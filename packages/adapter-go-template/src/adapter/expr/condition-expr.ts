/**
 * Condition and filter-predicate lowering (#3425): how a parsed JS condition
 * becomes a Go-template pipeline. Two renderers live here:
 *
 * - {@link renderConditionExpr} lowers the test of an `{{if}}` (a ternary, a
 *   `&&` / `||` branch, a `show` condition) to a bool-ish pipeline plus any
 *   hoisted `{{$bf_rN := …}}` preamble a higher-order callback call needs.
 * - {@link renderFilterExpr} lowers a `.filter()` / `.find()` predicate body
 *   (`t => !t.done`), substituting the callback param with the loop's dot.
 *
 * The adapter's `convertConditionToGo` and its filter/predicate call sites
 * call these free functions over a {@link ConditionExprHost}.
 */

import {
  asCallbackMethodCall,
  exprToString,
  identifierPath,
  type ParsedExpr,
  type SourceLocation,
} from '@barefootjs/jsx'

import type { GoEmitContext } from '../emit-context.ts'
import { goBinaryHelperCall, GO_REMEDIATION_OPTIONS, isElementIndex, lowerJsNot, wrapIfMultiToken } from '../lib/go-emit.ts'
import { isPropsObjectName } from '../lib/compile-state.ts'
import { capitalizeFieldName } from '../lib/go-naming.ts'
import type { HigherOrderShape } from '../lib/types.ts'
import { lowerTemplateLiteralValue, lowerTernary } from './url-builder.ts'


/**
 * What the condition and filter-predicate lowering needs from the adapter
 * beyond the shared {@link GoEmitContext}: the recursive `ParsedExpr`
 * renderer, the loop/scope lookups of the position being rendered, the root
 * and row field references and the adapter's shared operator helpers. Kept
 * out of `GoEmitContext` because only this module reads them.
 */
export interface ConditionExprHost {
  readonly ctx: GoEmitContext
  /** Render a `ParsedExpr` through the adapter's `ParsedExprEmitter`. */
  renderParsedExpr(expr: ParsedExpr): string
  /** A source location for a diagnostic. */
  makeLoc(): SourceLocation
  /** Whether a loop row or callback binds `name` at the current position. */
  hasScopeBinding(name: string): boolean
  /** The `$name` a `.filter()` predicate captured an enclosing row binding as. */
  filterCaptureAlias(name: string): string | undefined
  /** The Go accessor a loop destructure binds `name` to. */
  lookupDestructureBinding(name: string): string | undefined
  /** Record a wrapper-row read of `name`; returns `rendered`. */
  noteWrapperRowRead(name: string, rendered: string): string
  /** Whether `name` is an enclosing loop row's own item (any depth). */
  isOuterRowItem(name: string): boolean
  /** Whether `name` is a loop variable a `{{range}}` declared as `$name`. */
  hasLoopVarRef(name: string): boolean
  /** The `$name` range variable of a loop row binding. */
  rowVarRef(name: string): string
  /** A root field read that always escapes to `$.` (filter predicates). */
  filterRootFieldRef(name: string): string
  /** A root field read, `$.`-prefixed inside a loop. */
  rootFieldRef(name: string): string
  /** The root field a `props.key` read names. */
  propKeyFieldRef(key: string): string
  /** The nil-safe `bf_get` read of `property` on `object`. */
  renderOptionalMember(object: string, property: string): string
  /** The higher-order callback shape of a predicate method call, or null. */
  higherOrderShapeOf(node: ParsedExpr): HigherOrderShape | null
  /** `len (bf_filter …)` for `.filter(cb).length`, or null. */
  renderFilterLengthExpr(filterExpr: HigherOrderShape, renderArray: (e: ParsedExpr) => string): string | null
  /** The JS `+` lowering (numeric add or string concat). */
  emitPlus(leftExpr: ParsedExpr, rightExpr: ParsedExpr, leftRendered: string, rightRendered: string): string
  /** A bare identifier naming a literal local const, as Go, or null. */
  resolveLiteralConstAsGo(name: string): string | null
  /** Whether `name` is the innermost loop's plain item param (Go's `.`). */
  isCurrentLoopItem(name: string): boolean
  /** The innermost loop item's reference (`.`, or a scalar wrapper row's field). */
  currentLoopItemRef(): string
  /** Whether `name` is an outer (nested-loop) item param. */
  isOuterLoopParam(name: string): boolean
  /** Whether `name` is the innermost loop item and a record (has fields). */
  isCurrentLoopRecord(name: string): boolean
  /** `len` for a known array, `bf_length` otherwise. */
  conditionLengthFn(expr: Extract<ParsedExpr, { kind: 'member' }>): 'len' | 'bf_length'
  /** Whether `node` reads a member chain of a source-keyed signal seed map. */
  isMapSeededSignalChain(node: ParsedExpr): boolean
  /** Whether a `??` left operand is a nillable prop or signal field. */
  isNillableNullishLeft(expr: ParsedExpr): boolean
  /** Whether `path` names a registered template primitive. */
  isTemplatePrimitive(path: string): boolean
  /**
   * Refuse (BF101) the arithmetic in `expr` over a prop whose nil the
   * declared type cannot classify (`refuseAmbiguousNilArithmetic`, #3700):
   * this module lowers operators without the adapter's operand coercion.
   * `params` are the enclosing callback's own bindings (a filter predicate's
   * parameter and locals), entered over the current scope.
   */
  refuseAmbiguousNilArithmetic(expr: ParsedExpr, params: readonly string[]): void
}

/**
 * Split a rendered template block into preamble + final expression.
 * The last `{{...}}` must be a variable reference (`$bf_rN` or
 * `$bf_result`). Control tokens like `{{end}}` or `{{break}}` are
 * rejected — those template blocks (e.g. find's range/break form)
 * can't be composed in binary/logical expressions.
 */
function splitPreamble(rendered: string): { preamble: string; expr: string } | null {
  if (!rendered.includes('{{')) return null
  const lastOpen = rendered.lastIndexOf('{{')
  const lastClose = rendered.lastIndexOf('}}')
  if (lastOpen >= 0 && lastClose > lastOpen) {
    const candidate = rendered.substring(lastOpen + 2, lastClose)
    if (!candidate.startsWith('$')) return null
    return {
      preamble: rendered.substring(0, lastOpen),
      expr: candidate,
    }
  }
  return null
}

/**
 * Render a filter predicate expression (`t => !t.done`, or a block body
 * normalized to one — #2040). `localVarMap` is a vestigial empty default kept
 * on the recursion; block-body locals are now inlined upstream, so no caller
 * populates it. `datumField` (#2228) qualifies a bare `param` reference (and
 * `param.xxx` member/call access) through the wrapper struct's
 * datum-carrying field — see `wrapperDatumField` — for a loop whose `.` is a
 * child-component wrapper Props struct rather than the raw datum itself.
 * `undefined` for every other caller (non-loop `.filter()`/`.find()`/etc.,
 * or a plain-element-body loop), which keeps emitting the bare `.`/`.Field`
 * this method always has.
 *
 * `null` means a node had no Go template lowering and was refused with
 * BF101; every parent propagates it, so no partial predicate is built
 * around a stand-in (#3542).
 */
export function renderFilterExpr(
  host: ConditionExprHost,
  expr: ParsedExpr,
  param: string,
  localVarMap: Map<string, string> = new Map(),
  datumField?: string,
  fieldlessParam = false,
): string | null {
  // The predicate's operators lower without the operand coercion (#3700).
  host.refuseAmbiguousNilArithmetic(expr, [param, ...localVarMap.keys()])
  return renderFilterExprNode(host, expr, param, localVarMap, datumField, fieldlessParam)
}

/** One node of {@link renderFilterExpr}; children recurse through it. */
function renderFilterExprNode(
  host: ConditionExprHost,
  expr: ParsedExpr,
  param: string,
  localVarMap: Map<string, string>,
  datumField?: string,
  fieldlessParam = false,
): string | null {
  // #2228: `paramPrefix` prepends the wrapper's datum-carrying field to a
  // loop-param access (`.Todo` under a wrapper, `''` otherwise). Two derived
  // forms because Go template spells "the dot itself" as `.` but "field on
  // the dot" as `.Field` — a naive shared `'.'` prefix would emit `..Done`
  // for the non-wrapper member case:
  //   bare `t`     → `paramDot`             (`.Todo` / `.`)
  //   `t.done`     → `${paramPrefix}.Done`  (`.Todo.Done` / `.Done`)
  const paramPrefix = datumField ? `.${datumField}` : ''
  const paramDot = paramPrefix || '.'
  // A scalar row's value has no fields (`isFieldlessLoopRow`): `g.length`
  // goes through the generic member path over `paramDot` (`bf_length .`,
  // or `bf_length .BfLoopItem` on a scalar wrapper row).
  const paramHasFields = !fieldlessParam
  switch (expr.kind) {
    case 'identifier':
      return renderFilterIdentifier(host, expr, param, localVarMap, paramDot)

    case 'literal':
      if (expr.literalType === 'string') {
        return `"${expr.value}"`
      }
      if (expr.literalType === 'null') {
        return 'nil'
      }
      return String(expr.value)

    case 'member':
      return renderFilterMember(host, expr, param, localVarMap, datumField, fieldlessParam, paramPrefix, paramDot, paramHasFields)

    case 'call':
      return renderFilterCall(host, expr, param, localVarMap, datumField, fieldlessParam, paramPrefix, paramHasFields)

    case 'unary': {
      const arg = renderFilterExprNode(host, expr.argument, param, localVarMap, datumField, fieldlessParam)
      if (arg === null) return null
      if (expr.op === '!') return lowerJsNot(expr.argument, arg)
      if (expr.op === '-') {
        return `bf_neg ${wrapIfMultiToken(arg)}`
      }
      return arg
    }

    case 'binary':
      return renderFilterBinary(host, expr, param, localVarMap, datumField, fieldlessParam)

    case 'logical': {
      const left = renderFilterExprNode(host, expr.left, param, localVarMap, datumField, fieldlessParam)
      if (left === null) return null
      const right = renderFilterExprNode(host, expr.right, param, localVarMap, datumField, fieldlessParam)
      if (right === null) return null
      if (expr.op === '&&') {
        return `and (${left}) (${right})`
      }
      return `or (${left}) (${right})`
    }

    default:
      // The filter predicate body contains a node kind we can't lower to a
      // Go template action. Shared refusal with the nested-callback guard in
      // the `call` arm (#2038).
      return refuseFilterExprNode(host, expr)
  }
}

/** The `identifier` arm of {@link renderFilterExprNode}. */
function renderFilterIdentifier(
  host: ConditionExprHost,
  expr: Extract<ParsedExpr, { kind: 'identifier' }>,
  param: string,
  localVarMap: Map<string, string>,
  paramDot: string,
): string {
  if (expr.name === param) {
    return paramDot
  }
  // A local variable mapped to a signal.
  const signal = localVarMap.get(expr.name)
  if (signal) {
    // Root-scope read (#2700's BF101 gate needs it in
    // `templateReadRootFields`) — `$.` is hardcoded rather than
    // routed through `rootFieldRef`'s `this.inLoop`-conditional
    // prefix because a filter predicate must always escape back to
    // root regardless of loop nesting; call it only for its
    // registration side effect and keep the prefix here (pullfrog
    // review, PR #2818). The field name itself DOES go through
    // `resolveRootFieldAlias` (#2857) so a getter-alias local
    // (`const items__alias = items`) still emits the field the
    // signal itself seeds instead of a phantom `.Items__alias`.
    return host.filterRootFieldRef(signal)
  }
  // An enclosing row's binding (#3396). The predicate always sits inside
  // the filtered loop's own `{{range}}`, so an enclosing item reads its
  // `$name` range variable, never the dot or a root field; a destructure
  // binding reads its accessor; an index or preamble local is `$name`.
  if (host.hasScopeBinding(expr.name)) {
    const captured = host.filterCaptureAlias(expr.name)
    if (captured !== undefined) return `$${captured}`
    const acc = host.lookupDestructureBinding(expr.name)
    if (acc !== undefined) return host.noteWrapperRowRead(expr.name, acc)
    if (host.isOuterRowItem(expr.name) || host.hasLoopVarRef(expr.name)) return host.rowVarRef(expr.name)
  }
  // Any other identifier reaching here is ALSO a root-scope
  // reference (a memo, a plain derived const, or — #2857 — a
  // bare-props-form destructured/renamed prop) rather than the
  // loop's own param, so it needs the same unconditional `$.`
  // escape as the signal branch above, for the same reason: a
  // `.filter().map()` JSX loop's `{{if}}` gate (built from
  // `loop.filterPredicate` a few hundred lines below, via
  // `renderPredicateCondition` → this method) always sits inside
  // that loop's own `{{range}}`, never at the template's un-rebound
  // root, so `rootFieldRef`'s own `this.inLoop`-conditional prefix
  // would be wrong here even without the alias bug — a bare
  // `.Field` resolves against the CURRENT LOOP ITEM's type, not
  // root, and `html/template` panics at execute time (`can't
  // evaluate field ... in type ...`) the first time such a
  // reference is exercised.
  return host.filterRootFieldRef(expr.name)
}

/** The `member` arm of {@link renderFilterExprNode}. */
function renderFilterMember(
  host: ConditionExprHost,
  expr: Extract<ParsedExpr, { kind: 'member' }>,
  param: string,
  localVarMap: Map<string, string>,
  datumField: string | undefined,
  fieldlessParam: boolean,
  paramPrefix: string,
  paramDot: string,
  paramHasFields: boolean,
): string | null {
  // t.done -> .Done (or .Todo.Done under a wrapper struct, #2228)
  if (paramHasFields && expr.object.kind === 'identifier' && expr.object.name === param) {
    if ((expr.optional || expr.computed) && expr.property !== 'length') {
      return `(${host.renderOptionalMember(paramDot, expr.property)})`
    }
    return `${paramPrefix}.${capitalizeFieldName(expr.property)}`
  }
  // props.x on a bare-props-form component (#2879): props are
  // flattened onto the root struct, so this is a root-scope read
  // (`$.X`), not `.Props.X`. Mirrors `renderConditionExpr`'s own
  // `propsObjectName` branch; `props.a.b` still reaches root through
  // the generic recursion below.
  if (
    expr.object.kind === 'identifier' &&
    isPropsObjectName(host.ctx.state, expr.object.name) &&
    // The predicate's own param or an enclosing binding of that name
    // shadows the props object (#3693).
    expr.object.name !== param &&
    !host.hasScopeBinding(expr.object.name)
  ) {
    return host.filterRootFieldRef(expr.property)
  }
  // `.length` on a higher-order filter result (e.g.
  // `x.tags.filter(t => t.active).length > 0`). Reuse
  // `renderFilterLengthExpr` so the inner filter lowers to
  // `bf_filter <arr> "<field>" <value>` and the outer `.length` wraps it in
  // `len (...)`. Wrap in parens because the filter-context `binary` /
  // `unary` arms emit prefix function calls (`gt <l> <r>`) and Go template
  // would otherwise parse `gt len (bf_filter ...) 0` as four siblings.
  if (expr.property === 'length') {
    const innerHO = host.higherOrderShapeOf(expr.object)
    if (innerHO && innerHO.method === 'filter') {
      const lenExpr = host.renderFilterLengthExpr(innerHO, e =>
        renderFilterExprNode(host, e, param, localVarMap, datumField, fieldlessParam) ?? 'false',
      )
      if (lenExpr) return `(${lenExpr})`
    }
  }
  // Nested member access or local var.prop.
  const obj = renderFilterExprNode(host, expr.object, param, localVarMap, datumField, fieldlessParam)
  if (obj === null) return null
  // JS `.length` on a field (`i.name.length`, `i.tags.length`, #3447):
  // `bf_length` counts a string's UTF-16 code units or a slice's
  // elements. A `.Length` field read is not defined on either.
  if (expr.property === 'length' && !expr.computed) {
    const read = `bf_length ${wrapIfMultiToken(obj)}`
    return expr.optional ? `(bf_ternary (bf_eq ${wrapIfMultiToken(obj)} nil) nil (${read}))` : `(${read})`
  }
  if ((expr.optional || expr.computed) && expr.property !== 'length') {
    return `(${host.renderOptionalMember(obj, expr.property)})`
  }
  return `${obj}.${capitalizeFieldName(expr.property)}`
}

/** The `call` arm of {@link renderFilterExprNode}. */
function renderFilterCall(
  host: ConditionExprHost,
  expr: Extract<ParsedExpr, { kind: 'call' }>,
  param: string,
  localVarMap: Map<string, string>,
  datumField: string | undefined,
  fieldlessParam: boolean,
  paramPrefix: string,
  paramHasFields: boolean,
): string | null {
  // `t.isDone()` -> `.IsDone` (or `.Todo.IsDone` under a wrapper, #2228)
  if (paramHasFields && expr.callee.kind === 'member' && expr.callee.object.kind === 'identifier' && expr.callee.object.name === param) {
    return `${paramPrefix}.${capitalizeFieldName(expr.callee.property)}`
  }
  // Signal calls: `filter()` -> `$.Filter`. Same registration-only
  // `rootFieldRef` call — and the same `resolveRootFieldAlias` field
  // resolution (#2857) — as the `identifier` case above, for the same
  // reason (#2700's BF101 gate; pullfrog review, PR #2818).
  if (expr.callee.kind === 'identifier' && expr.args.length === 0) {
    return host.filterRootFieldRef(expr.callee.name)
  }
  // A nested callback method call (`other.some(r => …)`) reaching this
  // arm has no Go template form in filter context — the fallthrough
  // below renders only the callee and silently DROPS the arrow argument,
  // changing predicate semantics (#2038). The one faithful nested shape
  // (`.filter(cb).length` → `len (bf_filter_eval …)`) is intercepted at
  // the `member` arm before this node is visited; everything else must
  // be loud.
  if (asCallbackMethodCall(expr) !== null) {
    return refuseFilterExprNode(host, expr)
  }
  return renderFilterExprNode(host, expr.callee, param, localVarMap, datumField, fieldlessParam)
}

/** The `binary` arm of {@link renderFilterExprNode}. */
function renderFilterBinary(
  host: ConditionExprHost,
  expr: Extract<ParsedExpr, { kind: 'binary' }>,
  param: string,
  localVarMap: Map<string, string>,
  datumField: string | undefined,
  fieldlessParam: boolean,
): string | null {
  const left = renderFilterExprNode(host, expr.left, param, localVarMap, datumField, fieldlessParam)
  if (left === null) return null
  const right = renderFilterExprNode(host, expr.right, param, localVarMap, datumField, fieldlessParam)
  if (right === null) return null
  // #2873 (pullfrog review, PR #2882): every case below is a prefix
  // function call (`bf_mod a b`, `eq a b`, …), so a COMPOUND operand —
  // itself a nested binary result like `bf_mod .N 2` — must be
  // parenthesised or the template parser folds its tokens into the
  // outer call's argument list (`eq bf_mod .N 2 0` hands `eq` four
  // args, and a bare func-name argument like `bf_mod` there is called
  // with ZERO args instead of nested: `wrong number of args for
  // bf_mod: want 2 got 0`). Mirrors the general (non-filter) binary
  // emitter's `wl`/`wr` wrapping (`wrapIfMultiToken`, above) — this
  // switch had never applied it, so `-`/`*`/`/` had the identical
  // pre-existing gap for a nested compound operand.
  const wl = wrapIfMultiToken(left)
  const wr = wrapIfMultiToken(right)

  const call = goBinaryHelperCall(expr.op, wl, wr, [expr.left, expr.right])
  if (call !== null) return call
  switch (expr.op) {
    case '+':
      return host.emitPlus(expr.left, expr.right, wl, wr)
    case '-':
      return `bf_sub ${wl} ${wr}`
    case '*':
      return `bf_mul ${wl} ${wr}`
    default:
      return `${left} ${expr.op} ${right}`
  }
}

/**
 * Refuse a filter-predicate node that has no Go template lowering: BF101
 * with the offending expression, and `null` for the parents to propagate
 * instead of wrapping a stand-in into `false.Length` / `gt false.Length 0`.
 * The top-level caller substitutes `false` so the emitted template stays
 * syntactically valid and `text/template` parsing doesn't cascade into
 * confusing secondary errors.
 */
function refuseFilterExprNode(host: ConditionExprHost, expr: ParsedExpr): null {
  host.ctx.state.errors.push({
    code: 'BF101',
    severity: 'error',
    message: `Filter predicate contains an expression that cannot be lowered to a Go template action: ${exprToString(expr)}`,
    loc: host.makeLoc(),
    suggestion: {
      message: 'Options:\n1. Use /* @client */ for client-side evaluation\n2. Rewrite the predicate to avoid nested higher-order methods (`.filter()` / `.map()` / etc. inside the predicate body)',
    },
  })
  return null
}

type ConditionParts = { preamble: string; expr: string }

const plain = (e: string): ConditionParts => ({ preamble: '', expr: e })

/**
 * Lower a parsed condition to a Go-template pipeline plus the preamble a
 * higher-order callback call hoists (`{{$bf_r0 := …}}`).
 */
export function renderConditionExpr(host: ConditionExprHost, expr: ParsedExpr): { preamble: string; expr: string } {
  switch (expr.kind) {
    case 'identifier':
      return renderConditionIdentifier(host, expr)

    case 'literal':
      if (expr.literalType === 'string') return plain(JSON.stringify(String(expr.value)))
      if (expr.literalType === 'null') return plain('nil')
      return plain(String(expr.value))

    case 'call':
      return renderConditionCall(host, expr)

    case 'member':
      return renderConditionMember(host, expr)

    case 'index-access': {
      // `bf_get $arr $i`, as in value position: Go's `index` builtin
      // refuses a `float64` index (a TS `number` field) and fails on an
      // out-of-range one, where JS reads `undefined`. A multi-token operand
      // (`bf_add $i 1`) must be parenthesised or Go parses it as extra
      // arguments.
      const obj = renderConditionExpr(host, expr.object)
      const idx = renderConditionExpr(host, expr.index)
      return {
        preamble: obj.preamble + idx.preamble,
        expr: `bf_get ${wrapIfMultiToken(obj.expr)} ${wrapIfMultiToken(idx.expr)}`,
      }
    }

    case 'binary':
      return renderConditionBinary(host, expr)

    case 'unary': {
      const arg = renderConditionExpr(host, expr.argument)
      // The same `lowerJsNot` as the main `unary()` emitter above: JS
      // truthiness via `bf_truthy`, multi-token argument parenthesised.
      if (expr.op === '!') return { preamble: arg.preamble, expr: lowerJsNot(expr.argument, arg.expr) }
      // Same rule as `!` just above: `bf_neg` is a prefix builtin too, so a
      // multi-token argument (`or .N 0`, from `-(n() ?? 0)`) must be
      // parenthesised or Go reads it as extra sibling args (#3249).
      if (expr.op === '-') return { preamble: arg.preamble, expr: `bf_neg ${wrapIfMultiToken(arg.expr)}` }
      return arg
    }

    case 'logical':
      return renderConditionLogical(host, expr)

    case 'conditional': {
      // #2335: a ternary used as (part of) a boolean sub-condition —
      // `(x ? y : z) && w`, `!(a ? b : c)` — must lower FAITHFULLY. The old
      // code returned only the lowered `test`, silently discarding both
      // branches (a `(x ? y : z)` collapsed to `x`) — not refused, silently
      // wrong. Emit the pipeline-position `(bf_ternary <test> <y> <z>)`
      // value; the enclosing condition (`{{if}}`, `and`/`or`, `not`)
      // truthiness-checks its result, exactly as it would the JS ternary's.
      return plain(lowerTernary(host.ctx, expr.test, expr.consequent, expr.alternate))
    }

    case 'template-literal':
      // #2863 follow-up: fold to one Go value (`bf_concat_str` chain) via
      // the same door as the `conditional` case just above, instead of
      // `renderParsedExpr`'s TEXT-position `templateLiteral()` form —
      // which would leak raw `{{…}}` into THIS condition-expression's own
      // pipeline position (e.g. `(a === \`${x}-${y}\`) ? … : …`).
      return plain(lowerTemplateLiteralValue(host.ctx, expr.parts))

    case 'arrow':
      // A standalone arrow has no Go condition form (callbacks reach the
      // `call` arm via `asCallbackMethodCall`).
      return plain('[ARROW-FN]')

    case 'regex':
      return plain(host.renderParsedExpr(expr))

    case 'array-literal':
      return plain(host.renderParsedExpr(expr))

    case 'array-method':
      return plain(host.renderParsedExpr(expr))

    case 'unsupported':
    // `raw` holds the original expression string, so a bare object literal in
    // a condition lowers to that raw text.
    case 'object-literal':
      return plain(expr.raw)
  }
}

/** The `identifier` arm of {@link renderConditionExpr}. */
function renderConditionIdentifier(
  host: ConditionExprHost,
  expr: Extract<ParsedExpr, { kind: 'identifier' }>,
): ConditionParts {
  // Destructure-param bindings (`.map(({ id, active }) => active ? …)`):
  // resolve the binding name to its accessor on the range var the same
  // way the value path (`identifier` in `ParsedExprEmitter`) does.
  // Without this, a destructured name falls through to `rootFieldRef`
  // and the condition emits a ROOT-scope field instead of the row's
  // (#2486). Innermost-first, and BEFORE module-const inlining so a
  // binding whose name collides with a module string const still
  // resolves to the loop item — same ordering as `identifier` above.
  const acc = host.lookupDestructureBinding(expr.name)
  if (acc !== undefined) return plain(host.noteWrapperRowRead(expr.name, acc))
  const inlined = host.ctx.resolveModuleStringConst(expr.name) ?? host.resolveLiteralConstAsGo(expr.name)
  if (inlined !== null) return plain(inlined)
  if (host.isCurrentLoopItem(expr.name)) {
    return plain(host.currentLoopItemRef())
  }
  // Outer loop value variable (nested loop) → its range var `$name`.
  if (host.isOuterLoopParam(expr.name) || host.hasLoopVarRef(expr.name)) {
    return plain(host.rowVarRef(expr.name))
  }
  return plain(host.rootFieldRef(expr.name))
}

/** The `call` arm of {@link renderConditionExpr}. */
function renderConditionCall(
  host: ConditionExprHost,
  expr: Extract<ParsedExpr, { kind: 'call' }>,
): ConditionParts {
  if (expr.callee.kind === 'identifier' && expr.args.length === 0) {
    return plain(host.rootFieldRef(expr.callee.name))
  }
  // `isValidElement(x)` — the framework "is this a renderable element
  // (not plain text)?" predicate. #2266: a passed-through JSX child is
  // ALSO represented as pre-rendered markup on Go's SSR model, so a
  // plain non-empty STRING child is truthy but is NOT a valid element
  // — a bare truthiness check (the pre-#2266 lowering) wrongly took
  // `Slot`'s element-merge branch and panicked dereferencing
  // `.Props`/`.Tag` on a string (`can't evaluate field Props in type
  // interface {}`). `bf_is_element` (bf.go) does a real reflect-based
  // shape check (map/struct carrying both `tag`+`props` keys/fields,
  // case-insensitively), matching JS's `'tag' in x && 'props' in x`.
  // Pre-parenthesised — `call`-kind results aren't covered by
  // `needsParens`, so an unparenthesised `bf_is_element X` splices as
  // extra sibling args into an enclosing `and`/`or`.
  if (
    expr.callee.kind === 'identifier' &&
    (identifierPath(expr.callee) ?? expr.callee.name) === 'isValidElement' &&
    expr.args.length === 1
  ) {
    const inner = renderConditionExpr(host, expr.args[0])
    return { preamble: inner.preamble, expr: `(bf_is_element ${wrapIfMultiToken(inner.expr)})` }
  }
  // Any other user-defined predicate call with arguments (e.g.
  // `isAdmin(user)`) has no server-side evaluator and is not a registered
  // template primitive. Silently forcing it (to true OR false) is a
  // correctness hazard — a forced-true could expose auth-gated content, a
  // forced-false could hide required content. Refuse with a hard BF102 so
  // the author moves the predicate to a supported primitive or defers it
  // with `/* @client */`.
  if (
    expr.callee.kind === 'identifier' &&
    !host.isTemplatePrimitive(identifierPath(expr.callee) ?? '')
  ) {
    const path = identifierPath(expr.callee) ?? expr.callee.name
    host.ctx.state.errors.push({
      code: 'BF102',
      severity: 'error',
      message:
        `Predicate '${path}(...)' cannot be evaluated in a Go template. ` +
        `A server-side template cannot call user-defined JavaScript predicates.`,
      loc: host.makeLoc(),
      suggestion: { message: GO_REMEDIATION_OPTIONS },
    })
    // Go template actions must be self-contained; emit a literal so the
    // partial still parses while the build fails on the BF102 error.
    return plain('false')
  }
  // A higher-order callback call (`arr.find(...)`, `arr.some(...)`) lowers
  // via `renderParsedExpr` → `callbackMethod`, which may emit a
  // template-block form (`{{$bf_r0 := …}}…{{$bf_r0}}`) whose leading
  // assignment block must move to the `preamble`. Split it out — mirrors
  // the (removed) `higher-order` case.
  if (asCallbackMethodCall(expr)) {
    const rendered = host.renderParsedExpr(expr)
    const split = splitPreamble(rendered)
    if (split) return split
    return plain(rendered)
  }
  return plain(host.renderParsedExpr(expr))
}

/** The `member` arm of {@link renderConditionExpr}. */
function renderConditionMember(
  host: ConditionExprHost,
  expr: Extract<ParsedExpr, { kind: 'member' }>,
): ConditionParts {
  if (expr.property === 'length') {
    const innerHO = host.higherOrderShapeOf(expr.object)
    if (innerHO) {
      // renderFilterLengthExpr uses bf_filter runtime helpers (not template
      // blocks), so `.preamble` is always empty here. A future higher-order
      // method producing preambles through this path would need the callback
      // to propagate them.
      const result = host.renderFilterLengthExpr(innerHO, e => renderConditionExpr(host, e).expr)
      if (result) return plain(result)
    }
  }

  if (
    expr.object.kind === 'identifier' &&
    isPropsObjectName(host.ctx.state, expr.object.name) &&
    // A loop row binding of that name shadows the props object (#3693).
    !host.hasScopeBinding(expr.object.name)
  ) {
    return plain(host.propKeyFieldRef(expr.property))
  }

  // A numeric index reads an element, not a field (#3497): it takes the
  // `bf_get` arm below, the row itself rendering as `.`.
  const elementIndex = isElementIndex(expr.computed, expr.property)
  if (expr.object.kind === 'identifier' && host.isCurrentLoopRecord(expr.object.name) && !elementIndex) {
    return plain(`.${capitalizeFieldName(expr.property)}`)
  }

  const obj = renderConditionExpr(host, expr.object)
  if (expr.property === 'length') {
    // `len` is a prefix builtin like `index`/`and`/`or` above: a
    // multi-token operand (`or .X bf_arr`, from a `??` object here —
    // e.g. `(todos()?.length ?? 0)`'s inner `todos()?.length`, or
    // `(todos() ?? []).length`'s `todos() ?? []`) must be parenthesised
    // or Go reads it as extra sibling args of `len` (#3249).
    // A `?.length` receiver can be nil (an absent optional prop is
    // `interface{}`, #3422), which `len` refuses at execution time;
    // `bf_length` reads nil as 0, the same falsy answer as `undefined`
    // (`conditionLengthFn`).
    return { preamble: obj.preamble, expr: `${host.conditionLengthFn(expr)} ${wrapIfMultiToken(obj.expr)}` }
  }
  // A `?.`-written member hop must use the same nil-safe, case-tolerant
  // runtime getter as the value-position emitter. In particular, an
  // optional object prop is decoded as a map with JS-cased keys, so
  // `props.meta?.count` cannot be reached with a capitalized `.Count`
  // dot access after the direct `props.meta` read has resolved to
  // `.Meta` (#3275). `bf_get` also preserves optional-chain behavior
  // when the object itself is absent.
  // A member of a source-keyed signal seed map (#3353) uses the same
  // getter, as `member()` does in value position.
  if (expr.optional || elementIndex || host.isMapSeededSignalChain(expr.object)) {
    return {
      preamble: obj.preamble,
      expr: host.renderOptionalMember(obj.expr, expr.property),
    }
  }
  // Same wrapping rule as the `.length` arm above: a multi-token
  // object (`or .A .B`, from a `??`/`||` object — e.g.
  // `(props.a ?? props.b)?.name`) must be parenthesised before the
  // `.Field` access, or Go reads the unparenthesised tail as an extra
  // sibling arg of the prefix call (`or .A .B.Name` — silently wrong,
  // not a panic, since `or`/`and` tolerate extra args).
  return { preamble: obj.preamble, expr: `${wrapIfMultiToken(obj.expr)}.${capitalizeFieldName(expr.property)}` }
}

/** The `binary` arm of {@link renderConditionExpr}. */
function renderConditionBinary(
  host: ConditionExprHost,
  expr: Extract<ParsedExpr, { kind: 'binary' }>,
): ConditionParts {
  // `wrapIfMultiToken` (whitespace-based, on the RENDERED string) — not
  // the old `needsParensInGoTemplate` (AST-kind-based: only
  // member.length/arithmetic-binary/unary-negation) — matches the
  // `logical`/`unary` arms just below. AST-kind gating missed a `??`
  // operand here: `(x ?? []).length > 0` renders `expr.left` through
  // the `logical` arm to `or .X bf_arr` (or `bf_nullish …`), which
  // `needsParensInGoTemplate` never flagged, so it spliced
  // unparenthesised into `gt` as extra sibling args — `html/template`
  // then fails at render time ("wrong number of args"), not at compile
  // time (#3249).
  const leftResult = renderConditionExpr(host, expr.left)
  const left = wrapIfMultiToken(leftResult.expr)

  const rightResult = renderConditionExpr(host, expr.right)
  const right = wrapIfMultiToken(rightResult.expr)

  const preamble = leftResult.preamble + rightResult.preamble

  let result: string
  const call = goBinaryHelperCall(expr.op, left, right, [expr.left, expr.right])
  if (call !== null) {
    result = call
  } else switch (expr.op) {
    case '+':
      result = host.emitPlus(expr.left, expr.right, left, right); break
    case '-':
      result = `bf_sub ${left} ${right}`; break
    case '*':
      result = `bf_mul ${left} ${right}`; break
    default:
      result = `${left} ${expr.op} ${right}`
  }
  return { preamble, expr: result }
}

/** The `logical` arm of {@link renderConditionExpr}. */
function renderConditionLogical(
  host: ConditionExprHost,
  expr: Extract<ParsedExpr, { kind: 'logical' }>,
): ConditionParts {
  const leftResult = renderConditionExpr(host, expr.left)
  const rightResult = renderConditionExpr(host, expr.right)
  const preamble = leftResult.preamble + rightResult.preamble
  // `wrapIfMultiToken` (whitespace-based, on the RENDERED string) — not
  // `needsParens` (AST-kind-based, only `logical`/`unary`/`conditional`)
  // — matches the main `logical()` emitter's own wrapping. `needsParens`
  // misses any other multi-token rendering (`len .X`, `bf_add a b`,
  // `.SearchParams.Get "k"`), which `and`/`or`/`bf_nullish` (all prefix
  // builtins) would otherwise parse as extra sibling args instead of one
  // operand.
  const wrapLeft = wrapIfMultiToken(leftResult.expr)
  const wrapRight = wrapIfMultiToken(rightResult.expr)
  // `??` on a nillable prop needs true JS nullish semantics (#2254,
  // sibling of #2248/#2252's fix for text-expression/signal-seed
  // positions): Go's `or` is truthiness-based, so a present-but-empty
  // `""`/`0`/`false` operand wrongly falls back. `bf_nullish` tests
  // nil-ness only. Mirrors the `logical()` emitter's own gate (used
  // for non-condition expression positions) — same
  // `nullishConsumed ∩ nillable` check via `nillablePropNameOf`.
  const result = expr.op === '&&'
    ? `and ${wrapLeft} ${wrapRight}`
    : expr.op === '??' && host.isNillableNullishLeft(expr.left)
      ? `bf_nullish ${wrapLeft} ${wrapRight}`
      : `or ${wrapLeft} ${wrapRight}`
  return { preamble, expr: result }
}
