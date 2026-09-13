/**
 * ParsedExpr → Pebble emitters for the Pebble template adapter.
 *
 * Ported from `packages/adapter-jinja/src/adapter/expr/emitters.ts`
 * (`JinjaFilterEmitter` / `JinjaTopLevelEmitter`), with syntax choices from
 * `packages/adapter-twig/src/adapter/expr/emitters.ts` (`TwigFilterEmitter` /
 * `TwigTopLevelEmitter`) wherever Pebble's confirmed grammar matches Twig's
 * rather than Jinja's — see `pebble-adapter.ts`'s file header for the full
 * confirmed-syntax table this file's choices are drawn from. Two
 * `ParsedExprEmitter` implementations:
 *
 *   - `PebbleFilterEmitter` — filter/predicate context (loop param + local
 *     aliases + bare identifier signal fallback); self-contained, reads no
 *     adapter state.
 *   - `PebbleTopLevelEmitter` — top-level / per-render-var context; depends
 *     on the adapter only through the narrow `PebbleEmitContext` seam.
 *
 * Divergences from the Jinja port, documented at their definition site below.
 * This file's own numbering (1-7) is local to this file, not the same list
 * as `pebble-adapter.ts`'s file header (a different, overlapping set of
 * concerns) — cross-references between the two name the OTHER file
 * explicitly rather than assuming a shared numbering.
 *
 *   1. **Symbolic ternary, not word-based `if`/`else`.** Confirmed: Pebble's
 *      ternary is `cond ? a : b`, not Jinja's `a if cond else b`. `logical`'s
 *      `&&`/`||` lowering and `conditional`'s ternary lowering both emit
 *      `(T ? A : B)` — same choice Twig makes, for the same reason (Twig has
 *      no word-ternary either).
 *   2. **JS-truthy condition wrapping** (`truthyTest`) — unchanged in
 *      SHAPE from the Jinja/Twig ports: every condition-TEST position (`!x`,
 *      the left operand of `&&`/`||`, a ternary's test) routes through the
 *      shared `bf.truthy(...)` runtime helper unless the operand is
 *      structurally already boolean-shaped (`isBooleanResultParsed`) — see
 *      `boolean-result.ts`'s file header for why Pebble needs this (its
 *      `{% if %}` truthiness follows the same empty-container-is-falsy
 *      convention as Jinja/Twig, diverging from JS). `&&`/`||` still return
 *      the ORIGINAL operand VALUE (not a coerced bool) on the taken branch —
 *      matching JS `a || b` returning `a` itself — only the BRANCH TEST uses
 *      `bf.truthy`. The left operand's rendered text is emitted TWICE (once
 *      as the test, once as the value) — safe because every operand reaching
 *      this pipeline is a pure, side-effect-free read.
 *   3. **`??` is Pebble-native** (confirmed operator, see `pebble-adapter.ts`'s
 *      file header) — used directly for JS `??`, same as Twig's choice.
 *      UNLIKE Twig's confirmed "covers undefined AND null in one operator"
 *      guarantee, Pebble's `??` is documented as an "undefined-coalescing"
 *      operator specifically (distinguishing an unset template variable from
 *      an explicit `null`) — this adapter assumes the two collapse together
 *      under a non-strict-variables render config (the same assumption
 *      `pebble-adapter.ts`'s file header flags as a Phase 3/4 watchpoint),
 *      so `??` alone is used here rather than a hand-rolled two-operator
 *      guard whose extra complexity would be unverifiable anyway before the
 *      Java runtime exists.
 *   4. **`===`/`!==` route through `bf.eq`/`bf.neq`, never a native Pebble
 *      equality operator.** Same defensive choice Twig makes for PHP's loose
 *      `==` — Pebble's own `==`/`is same as` cross-type-numeric behavior
 *      (e.g. comparing a boxed `Integer` to a `Double`) is unverified here
 *      (no Java runtime exists yet to check against), so `bf.eq`/`bf.neq`
 *      (the ONE shared JS-strict-equality implementation, mirrored by every
 *      sibling adapter's Evaluator) is used unconditionally instead of
 *      trusting an unverified native operator.
 *   5. **No Pebble lambda for the predicate-callback fallback.** Same
 *      reasoning as the Jinja/Twig ports: `PebbleTopLevelEmitter` uses ONE
 *      mechanism for every higher-order callback (the evaluator-JSON
 *      `*_eval` payload). When `serializeParsedExpr` refuses the body, the
 *      call surfaces `BF101` instead of silently degrading — `.sort`/
 *      `.toSorted` is the one exception, whose non-lambda STRUCTURED
 *      fallback (`bf.sort` with a `{keys: […]}` descriptor) survives the
 *      port unchanged. `PebbleFilterEmitter` (the loop `.filter().map()`
 *      INLINE predicate, rendered as a plain boolean expression, never a
 *      lambda) is otherwise unaffected and still used for that path plus the
 *      filter-predicate entry point `_renderPebbleFilterExprPublic`.
 *   6. **Member access uses DOT notation for `.prop` (`obj.prop`), and the
 *      adapter's own `bf.get(obj, key)` runtime helper for a DYNAMIC/computed
 *      index (`obj[expr]`)** — neither Jinja's uniform bracket notation nor
 *      Twig's dot/`attribute()` split. A JS `MemberExpression`'s property
 *      name is always a source-level identifier (`obj.foo`, never
 *      `obj.'foo'`), so — unlike the loop-binding-accessor's destructure
 *      keys, which CAN be non-identifier-shaped — this position never needs
 *      a quoting/bracket fallback at all; dot notation is confirmed to
 *      resolve `Map` keys in Pebble (the runtime represents a JS object as a
 *      `Map<String, Object>`). A genuinely DYNAMIC key (`tone[k]`,
 *      `selected()[index]`) can't use dot notation (no way to splice a
 *      runtime value into a dotted name), and Pebble has no CONFIRMED
 *      `attribute()`-style builtin the way Twig does — so this adapter
 *      routes it through its own `bf.get(receiver, key)` helper instead,
 *      keeping the exact List-index-vs-Map-key resolution fully under the
 *      Java runtime's own control (Phase 3) rather than depending on an
 *      unverified Pebble builtin.
 *   7. **JS `+` on a string-typed operand routes through `~`, Pebble's
 *      concat operator** (`isStringConcatBinary`, same defensive gate Twig
 *      uses for PHP's numeric-only `+`) — Pebble's own arithmetic `+`
 *      operator's behavior on a non-numeric operand is unverified (no Java
 *      runtime to check against), so this side-steps the question entirely
 *      by using the confirmed-distinct concat operator whenever the adapter
 *      already knows an operand is string-shaped.
 */

import { groupBinaryOperand,
  groupObjectLiteralSegments,
  isStringConcatBinary,
  type ParsedExprEmitter,
  type LoweringEmitter,
  type LoweringNode,
  type HigherOrderMethod,
  type ArrayMethod,
  type LiteralType,
  type ParsedExpr,
  type ObjectLiteralProperty,
  type FlatDepth,
  type TemplatePart,
  identifierPath,
  matchSearchParamsMethodCall,
  sortComparatorFromArrow,
  queryHrefArgs,
  isValidHelperId,
} from '@barefootjs/jsx'

import type { PebbleEmitContext } from '../emit-context.ts'
import { PEBBLE_TEMPLATE_PRIMITIVES } from '../lib/constants.ts'
import { pebbleIdent, escapePebbleSingleQuoted, pebbleHashKey } from '../lib/pebble-naming.ts'
import { isBooleanResultParsed } from '../boolean-result.ts'
import {
  renderArrayMethod,
  renderSortMethod,
  renderSortEval,
  renderReduceEval,
  renderPredicateEval,
  renderFlatMethod,
  renderFlatMapEval,
  renderMapEval,
} from './array-method.ts'

/**
 * Local shape for the predicate-lowering helper. Mirrors the Jinja/Twig
 * ports' `PredicateCall`.
 */
type PredicateCall = {
  method: HigherOrderMethod
  object: ParsedExpr
  param: string
  predicate: ParsedExpr
}

// Methods whose callback is a boolean predicate (`<recv>.<m>(x => …)`).
const PREDICATE_METHODS = new Set<HigherOrderMethod>([
  'filter', 'find', 'findIndex', 'findLast', 'findLastIndex', 'every', 'some',
])

/**
 * Route a condition-TEST position through `bf.truthy(...)` unless the node
 * is structurally already boolean-shaped. See the file header (divergence
 * 2). Shared by both emitters below and reused by the adapter's top-level
 * `convertConditionToPebble` for IR-level `if` / loop-filter conditions.
 */
export function truthyTest(node: ParsedExpr, rendered: string): string {
  return isBooleanResultParsed(node) ? rendered : `bf.truthy(${rendered})`
}

/**
 * `props.x` on a bare-props-form component flattens to the bare context var
 * the SSR caller binds each prop to (props arrive as individual top-level
 * context entries, not a nested `props` map). Single door for BOTH
 * `member()` emitters below (mirrors the Jinja/Twig #2886/#2879 fix) —
 * returns null for any other receiver so callers fall through to their
 * generic member lowering — `props.a.b` flattens only the inner hop.
 */
function flattenPropsMember(object: ParsedExpr, property: string): string | null {
  if (object.kind === 'identifier' && object.name === 'props') return pebbleIdent(property)
  return null
}

/**
 * Lowering for the predicate body of a filter / every / some / find, plus the
 * same shape used by the loop-hoist `.filter().map()` inline condition.
 * Higher-order predicates are emitted using Pebble's own scalar comparison
 * operators.
 *
 * NOTE: Pebble has no `[x for x in … if …]`-as-expression form usable inline
 * here (a comprehension is a value producer, not a boolean test), so a
 * nested higher-order call (`x.tags.filter(...)`, `other.some(...)`) inside
 * a predicate has no faithful scalar lowering here either — same BF101
 * surfacing as the Jinja/Twig ports instead of silently degrading to the
 * callback's receiver.
 */
export class PebbleFilterEmitter implements ParsedExprEmitter {
  // Plain field declarations + assignment, NOT TS constructor-parameter-
  // property shorthand: Vite's `bundleConfigFile` externalizes any bare
  // (non-relative) import when loading `vite.config.ts`, so this file can be
  // loaded directly by Node's OWN native TypeScript type-stripping (enabled
  // by default since Node 22.18/23.6) rather than esbuild — and Node's
  // strip-only mode does not support parameter properties (`SyntaxError
  // [ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX]`), only plain type annotations.
  private readonly param: string
  private readonly localVarMap: Map<string, string>
  private readonly isStringName: (n: string) => boolean
  // Records a BF101 for predicate shapes this emitter can only degrade.
  // Optional so emitter construction stays possible without an adapter; a
  // missing hook keeps the old silent-degrade emit.
  private readonly onUnsupported?: (message: string, reason?: string) => void

  constructor(
    param: string,
    localVarMap: Map<string, string>,
    isStringName: (n: string) => boolean = () => false,
    onUnsupported?: (message: string, reason?: string) => void,
  ) {
    this.param = param
    this.localVarMap = localVarMap
    this.isStringName = isStringName
    this.onUnsupported = onUnsupported
  }

  identifier(name: string): string {
    if (name === this.param) return pebbleIdent(this.param)
    const signal = this.localVarMap.get(name)
    if (signal) return pebbleIdent(signal)
    return pebbleIdent(name)
  }

  literal(value: string | number | boolean | null, literalType: LiteralType): string {
    if (literalType === 'string') return `'${escapePebbleSingleQuoted(String(value))}'`
    if (literalType === 'boolean') return value ? 'true' : 'false'
    if (literalType === 'null') return 'null'
    return String(value)
  }

  member(object: ParsedExpr, property: string, _computed: boolean, _optional: boolean, emit: (e: ParsedExpr) => string): string {
    const flat = flattenPropsMember(object, property)
    if (flat !== null) return flat
    // `.length` — route through `bf.length` (handles both array element
    // count and string char count, JS-compatibly) rather than any
    // Pebble-native length access, so a non-array/string operand still gets
    // JS-compatible coercion first.
    if (property === 'length') {
      return `bf.length(${emit(object)})`
    }
    // Dot access — see the file header, divergence 6: a JS member property
    // is always a source-level identifier, and Pebble's dot accessor
    // resolves a `Map` key by that name.
    return `${emit(object)}.${property}`
  }

  indexAccess(object: ParsedExpr, index: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    // See the file header, divergence 6: a DYNAMIC/computed index has no
    // confirmed Pebble builtin that resolves both List-index and Map-key
    // access uniformly, so route through the adapter's own `bf.get` helper.
    return `bf.get(${emit(object)}, ${emit(index)})`
  }

  call(callee: ParsedExpr, args: ParsedExpr[], emit: (e: ParsedExpr) => string): string {
    // Signal getter calls: filter() → filter
    if (callee.kind === 'identifier' && args.length === 0) {
      return pebbleIdent(callee.name)
    }
    return emit(callee)
  }

  unary(op: string, argument: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    if (op === '!') return `not ${truthyTest(argument, emit(argument))}`
    if (op === '-') return `-${emit(argument)}`
    return emit(argument)
  }

  binary(op: string, left: ParsedExpr, right: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    // Preserve source grouping: a compound operand re-emitted as infix
    // text is otherwise re-parsed under THIS language's precedence —
    // `(count() + 2) * 3` would silently become `count + 2 * 3` (#2173).
    const l = groupBinaryOperand(left, emit(left))
    const r = groupBinaryOperand(right, emit(right))
    // See the file header, divergence 4: never a native Pebble equality
    // operator for `===`/`!==`.
    if (op === '===') return `bf.eq(${l}, ${r})`
    if (op === '!==') return `bf.neq(${l}, ${r})`
    // See the file header, divergence 7: a string-typed `+` operand routes
    // through `~`, not Pebble's (unverified) numeric `+`.
    if (isStringConcatBinary(op, left, right, this.isStringName)) {
      return `${l} ~ ${r}`
    }
    const opMap: Record<string, string> = {
      '>': '>', '<': '<', '>=': '>=', '<=': '<=',
      '+': '+', '-': '-', '*': '*', '/': '/',
    }
    return `${l} ${opMap[op] ?? op} ${r}`
  }

  logical(op: '&&' | '||' | '??', left: ParsedExpr, right: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    const l = emit(left)
    const r = emit(right)
    // See the file header, divergences 1 & 2: the branch TEST goes through
    // `bf.truthy`, the RETURNED value stays the original operand text (`l`
    // appears twice for `&&`/`||`), and the ternary is Pebble's symbolic
    // `(test ? a : b)` form, not Jinja's word-based `(a if test else b)`.
    if (op === '&&') return `(${truthyTest(left, l)} ? ${r} : ${l})`
    if (op === '||') return `(${truthyTest(left, l)} ? ${l} : ${r})`
    // See the file header, divergence 3: Pebble's `??` is native.
    return `(${l} ?? ${r})`
  }

  callbackMethod(
    method: string,
    object: ParsedExpr,
    _arrow: Extract<ParsedExpr, { kind: 'arrow' }>,
    _restArgs: ParsedExpr[],
    emit: (e: ParsedExpr) => string,
  ): string {
    // A nested callback method inside a filter predicate has no Pebble
    // scalar form. Surface BF101 instead of silently changing predicate
    // semantics (`!other.some(r => …)` collapsing to `!other`).
    this.onUnsupported?.(
      `Filter predicate contains a nested '.${method}(...)' callback, which has no Pebble scalar form`,
      `Rewrite the predicate without a nested callback method, or add /* @client */ for client-only evaluation (no SSR).`,
    )
    return emit(object)
  }

  arrayLiteral(elements: ParsedExpr[], emit: (e: ParsedExpr) => string): string {
    return `[${elements.map(emit).join(', ')}]`
  }

  arrayMethod(
    method: ArrayMethod,
    object: ParsedExpr,
    args: ParsedExpr[],
    emit: (e: ParsedExpr) => string,
  ): string {
    return renderArrayMethod(method, object, args, emit)
  }

  flatMethod(
    object: ParsedExpr,
    depth: FlatDepth | { expr: ParsedExpr },
    emit: (e: ParsedExpr) => string,
  ): string {
    return renderFlatMethod(emit(object), depth, emit)
  }

  conditional(_test: ParsedExpr, _consequent: ParsedExpr, _alternate: ParsedExpr): string {
    return 'true'
  }

  templateLiteral(_parts: TemplatePart[]): string {
    return 'true'
  }

  arrow(_params: string[], _body: ParsedExpr): string {
    return 'true'
  }

  regex(_raw: string): string {
    return 'true'
  }

  unsupported(_raw: string, _reason: string): string {
    return 'true'
  }

  objectLiteral(_properties: ObjectLiteralProperty[], _raw: string, _emit: (e: ParsedExpr) => string): string {
    // Filter-predicate context: emit the truthy sentinel exactly as
    // `unsupported` does. Object values lower to Pebble maps in the
    // conditional/attr paths, not through this dispatcher.
    return 'true'
  }
}

/**
 * Lowering for top-level expressions whose identifiers resolve against the
 * Pebble template's per-render context vars (signals, props, locals
 * introduced by `{% set x = … %}`). Differs from the filter emitter mainly
 * in
 *   - `conditional` is supported (filter predicates can't return ternaries),
 *   - higher-order methods route through `bf.*` array/evaluator helpers,
 *   - no lambda fallback exists (see the file header, divergence 5).
 */
export class PebbleTopLevelEmitter implements ParsedExprEmitter {
  // Plain field + assignment, not a parameter property — see
  // `PebbleFilterEmitter`'s constructor comment above for why.
  private readonly ctx: PebbleEmitContext

  constructor(ctx: PebbleEmitContext) {
    this.ctx = ctx
  }

  /**
   * Registered-lowering seam: `emitParsedExpr`'s shared `call` case tries
   * every matcher here BEFORE `call()` itself, so a registered call (the
   * built-in `queryHref`, or any userland plugin) is recognised no matter
   * where it sits in the tree.
   */
  get lowering(): LoweringEmitter {
    return {
      matchers: this.ctx._loweringMatchers,
      render: (node: LoweringNode, emit: (e: ParsedExpr) => string): string | null => {
        // `query` guard-list — `queryHref`-shaped. The helper includes a
        // pair iff its guard is truthy AND its value is a non-empty string
        // (the client's `if (value)`): a plain `key: v` passes guard
        // `true`, a conditional `key: cond ? v : undefined` passes the
        // lowered cond. Only the `query` helper renders to `bf.query`;
        // another guard-list helper must not be silently mis-rendered as
        // a query.
        if (node.kind === 'guard-list' && node.helper === 'query') {
          const qArgs = queryHrefArgs(node, emit)
          return `bf.query(${qArgs.join(', ')})`
        }
        // Generic `helper-call` — the neutral vocabulary's escape hatch for
        // a userland `LoweringPlugin` that lowers to a single runtime-helper
        // invocation. `bf.<helper>(args…)` mirrors the `query` helper's own
        // naming convention exactly.
        if (node.kind === 'helper-call' && isValidHelperId(node.helper)) {
          return `bf.${node.helper}(${node.args.map(emit).join(', ')})`
        }
        return null
      },
    }
  }

  identifier(name: string): string {
    // `undefined` / `null` nested inside a larger expression tree — Pebble
    // `null`.
    if (name === 'undefined' || name === 'null') return 'null'
    // Inline a module-scope pure-string const (`const x = 'literal'`) — it
    // never reaches the per-render context, so a bare reference would
    // resolve to Undefined.
    const inlined = this.ctx._resolveModuleStringConst(name)
    if (inlined !== null) return inlined
    // Same for a literal const of any scope (`const totalPages = 5`,
    // #1897 pagination's `Page {currentPage()} of {totalPages}`).
    const literalConst = this.ctx._resolveLiteralConst(name)
    if (literalConst !== null) return literalConst
    return pebbleIdent(name)
  }

  literal(value: string | number | boolean | null, literalType: LiteralType): string {
    if (literalType === 'string') return `'${escapePebbleSingleQuoted(String(value))}'`
    if (literalType === 'boolean') return value ? 'true' : 'false'
    if (literalType === 'null') return 'null'
    return String(value)
  }

  member(object: ParsedExpr, property: string, _computed: boolean, _optional: boolean, emit: (e: ParsedExpr) => string): string {
    const flat = flattenPropsMember(object, property)
    if (flat !== null) return flat
    // Static property access on a module object-literal const
    // (`variantClasses.ghost`, #1897) resolves at compile time — the
    // generic dot lowering below would reference a context var that
    // doesn't exist server-side and silently resolve to Undefined.
    if (object.kind === 'identifier') {
      const staticValue = this.ctx._resolveStaticRecordLiteral(object.name, property)
      if (staticValue !== null) return staticValue
    }
    const obj = emit(object)
    // `.length` → `bf.length` (array count or string char count, JS-compat).
    if (property === 'length') return `bf.length(${obj})`
    // Dot access — see the file header, divergence 6.
    return `${obj}.${property}`
  }

  indexAccess(object: ParsedExpr, index: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    // See the file header, divergence 6.
    return `bf.get(${emit(object)}, ${emit(index)})`
  }

  call(callee: ParsedExpr, args: ParsedExpr[], emit: (e: ParsedExpr) => string): string {
    // Signal getter: count() → count
    if (callee.kind === 'identifier' && args.length === 0) {
      return pebbleIdent(callee.name)
    }
    // Env-signal method call (#1922): `searchParams().get('sort')` is a real
    // method call on the per-request `searchParams` reader object, not the
    // generic dot deref `member` would emit. Matches the local import
    // binding (incl. an alias).
    if (this.ctx._searchParamsLocals.size > 0) {
      const sp = matchSearchParamsMethodCall(callee, args, this.ctx._searchParamsLocals)
      if (sp) {
        return `searchParams.${sp.method}(${sp.args.map(emit).join(', ')})`
      }
    }
    // Identifier-path templatePrimitive: `JSON.stringify(x)` / `Math.floor(x)`
    // → `bf.json(x)` / `bf.floor(x)`. Args render recursively through this
    // same emitter. A wrong-arity call records BF101 and returns `''`.
    const path = identifierPath(callee)
    const spec = path ? PEBBLE_TEMPLATE_PRIMITIVES[path] : undefined
    if (path && spec) {
      if (args.length === spec.arity) {
        return spec.emit(args.map(emit))
      }
      this.ctx._recordExprBF101(
        `templatePrimitive '${path}' expects ${spec.arity} arg(s), got ${args.length}`,
        `Call '${path}' with exactly ${spec.arity} argument(s).`,
      )
      return "''"
    }
    return emit(callee)
  }

  unary(op: string, argument: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    if (op === '!') return `not ${truthyTest(argument, emit(argument))}`
    if (op === '-') return `-${emit(argument)}`
    return emit(argument)
  }

  binary(op: string, left: ParsedExpr, right: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    // Preserve source grouping: a compound operand re-emitted as infix
    // text is otherwise re-parsed under THIS language's precedence —
    // `(count() + 2) * 3` would silently become `count + 2 * 3` (#2173).
    const l = groupBinaryOperand(left, emit(left))
    const r = groupBinaryOperand(right, emit(right))
    // See the file header, divergence 4: never a native Pebble equality
    // operator for `===`/`!==`.
    if (op === '===') return `bf.eq(${l}, ${r})`
    if (op === '!==') return `bf.neq(${l}, ${r})`
    // See the file header, divergence 7. The adapter's string-value
    // registry catches getter/prop/local-const operands with no literal
    // present (`firstName() + lastName()`).
    if (isStringConcatBinary(op, left, right, n => this.ctx._isStringValueName(n))) {
      return `${l} ~ ${r}`
    }
    const opMap: Record<string, string> = {
      '>': '>', '<': '<', '>=': '>=', '<=': '<=',
      '+': '+', '-': '-', '*': '*',
    }
    return `${l} ${opMap[op] ?? op} ${r}`
  }

  logical(op: '&&' | '||' | '??', left: ParsedExpr, right: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    const l = emit(left)
    const r = emit(right)
    // See the file header, divergences 1 & 2.
    if (op === '&&') return `(${truthyTest(left, l)} ? ${r} : ${l})`
    if (op === '||') return `(${truthyTest(left, l)} ? ${l} : ${r})`
    // See the file header, divergence 3.
    return `(${l} ?? ${r})`
  }

  callbackMethod(
    method: string,
    object: ParsedExpr,
    arrow: Extract<ParsedExpr, { kind: 'arrow' }>,
    restArgs: ParsedExpr[],
    emit: (e: ParsedExpr) => string,
  ): string {
    const recv = emit(object)
    const body = arrow.body
    const params = arrow.params

    // Predicate family: `filter` / `find*` / `every` / `some`.
    if (PREDICATE_METHODS.has(method as HigherOrderMethod)) {
      return this._emitPredicateCallback(
        { method: method as HigherOrderMethod, object, param: params[0], predicate: body },
        recv,
        emit,
      )
    }

    // `.sort(cmp)` / `.toSorted(cmp)`: serialize the comparator body + emit
    // `bf.sort_eval`; fall back to the structured `bf.sort` when the body is
    // outside the evaluator surface (e.g. `localeCompare`). This structured
    // fallback is data (a `{keys: […]}` descriptor), never a lambda, so it
    // ports unchanged — see the file header, divergence 5.
    if (method === 'sort' || method === 'toSorted') {
      const evalForm = renderSortEval(recv, body, params, emit)
      if (evalForm !== null) return evalForm
      const structured = sortComparatorFromArrow(arrow)
      if (structured !== null) return renderSortMethod(recv, structured)
      this.ctx._recordExprBF101(
        `'.${method}(...)' comparator is outside the Pebble adapter's evaluable / structured surface`,
        `Pre-compute the sorted array, or move this position to a '/* @client */' boundary.`,
      )
      return "''"
    }

    // `.reduce(fn, init)` / `.reduceRight(fn, init)`: serialize the reducer
    // body + emit `bf.reduce_eval`. The init is the trailing arg.
    if (method === 'reduce' || method === 'reduceRight') {
      const direction = method === 'reduceRight' ? 'right' : 'left'
      const init = restArgs[0]
      const evalForm =
        init !== undefined
          ? renderReduceEval(recv, body, params, init, direction, emit)
          : null
      if (evalForm !== null) return evalForm
      this.ctx._recordExprBF101(
        `'.${method}(...)' is outside the Pebble adapter's evaluable surface (needs a literal initial value and an evaluable reducer body)`,
        `Pre-compute the reduced value, or move this position to a '/* @client */' boundary.`,
      )
      return "''"
    }

    // `.flatMap(proj)`: serialize the projection body + emit `bf.flat_map_eval`.
    if (method === 'flatMap') {
      const evalForm = renderFlatMapEval(recv, body, params[0], emit)
      if (evalForm !== null) return evalForm
      this.ctx._recordExprBF101(
        `'.flatMap(...)' projection is outside the Pebble adapter's evaluable surface`,
        `Pre-compute the projected array, or move this position to a '/* @client */' boundary.`,
      )
      return "''"
    }

    // Value-producing `.map(cb)`: serialize the projection body + emit
    // `bf.map_eval`. (The JSX-returning `.map` is an IRLoop upstream.)
    if (method === 'map') {
      const evalForm = renderMapEval(recv, body, params[0], emit)
      if (evalForm !== null) return evalForm
      this.ctx._recordExprBF101(
        `'.map(...)' projection is outside the Pebble adapter's evaluable surface`,
        `Pre-compute the projected array, or move this position to a '/* @client */' boundary.`,
      )
      return "''"
    }

    // Unknown callback method (should not arrive — CALLBACK_METHODS is closed).
    void object
    return recv
  }

  /**
   * Lower a boolean-predicate callback (`filter` / `find*` / `every` /
   * `some`). See the file header, divergence 5: Pebble has no lambda
   * expression, so — unlike Kolon — there is no non-evaluator fallback here.
   * A predicate the evaluator can't model surfaces `BF101`.
   */
  private _emitPredicateCallback(
    call: PredicateCall,
    arrayExpr: string,
    emit: (e: ParsedExpr) => string,
  ): string {
    const { method, param, predicate } = call

    const evalFn: Record<string, [string, boolean?]> = {
      filter: ['filter_eval'], every: ['every_eval'], some: ['some_eval'],
      find: ['find_eval', true], findLast: ['find_eval', false],
      findIndex: ['find_index_eval', true], findLastIndex: ['find_index_eval', false],
    }
    // `.filter(Boolean)` (identity predicate `_t => _t`) still needs the
    // evaluator path on Pebble (no lambda fallback) — the identity predicate
    // serializes fine (`{"kind":"identifier","name":"_t"}`).
    const spec = evalFn[method]
    if (spec) {
      const evalForm = renderPredicateEval(spec[0], arrayExpr, predicate, param, emit, spec[1])
      if (evalForm !== null) return evalForm
    }

    this.ctx._recordExprBF101(
      `'.${method}(...)' predicate is outside the Pebble adapter's evaluable surface — Pebble has no lambda-expression form to fall back to`,
      `Rewrite the predicate as a pure expression the evaluator can serialize (no nested method-call callbacks), or move this position to a '/* @client */' boundary.`,
    )
    return "''"
  }

  arrayLiteral(elements: ParsedExpr[], emit: (e: ParsedExpr) => string): string {
    return `[${elements.map(emit).join(', ')}]`
  }

  arrayMethod(
    method: ArrayMethod,
    object: ParsedExpr,
    args: ParsedExpr[],
    emit: (e: ParsedExpr) => string,
  ): string {
    return renderArrayMethod(method, object, args, emit)
  }

  flatMethod(
    object: ParsedExpr,
    depth: FlatDepth | { expr: ParsedExpr },
    emit: (e: ParsedExpr) => string,
  ): string {
    return renderFlatMethod(emit(object), depth, emit)
  }

  conditional(
    test: ParsedExpr,
    consequent: ParsedExpr,
    alternate: ParsedExpr,
    emit: (e: ParsedExpr) => string,
  ): string {
    // See the file header, divergence 1: Pebble's symbolic ternary.
    return `(${truthyTest(test, emit(test))} ? ${emit(consequent)} : ${emit(alternate)})`
  }

  templateLiteral(parts: TemplatePart[], emit: (e: ParsedExpr) => string): string {
    // `` `n=${count() + 1}` `` → Pebble string concatenation (`~`):
    // `'n=' ~ bf.string(count + 1)`. Every interpolated (non-string-literal)
    // segment routes through `bf.string(...)` before concatenation.
    const terms: string[] = []
    for (const part of parts) {
      if (part.type === 'string') {
        if (part.value !== '') {
          terms.push(`'${escapePebbleSingleQuoted(part.value)}'`)
        }
      } else {
        const rendered = emit(part.expr)
        const needsParens =
          part.expr.kind === 'binary' ||
          part.expr.kind === 'logical' ||
          part.expr.kind === 'conditional'
        terms.push(`bf.string(${needsParens ? `(${rendered})` : rendered})`)
      }
    }
    if (terms.length === 0) return `''`
    return terms.join(' ~ ')
  }

  arrow(_params: string[], _body: ParsedExpr): string {
    // A bare arrow never stands alone at a render position (it's only
    // meaningful as a callback, handled by `callbackMethod`). Emit the safe
    // empty-string literal so a stray emit can't produce a Pebble syntax
    // error.
    return "''"
  }

  regex(_raw: string): string {
    // A bare regex literal has no template-render form — mirror `unsupported`.
    return "''"
  }

  unsupported(_raw: string, _reason: string): string {
    return "''"
  }

  objectLiteral(properties: ObjectLiteralProperty[], _raw: string, emit: (e: ParsedExpr) => string): string {
    // Reachable here in VALUE position (a `.map()` receiver/callback body, an
    // array-literal element, …) since `isSupportedValue` admits an object
    // literal whose every property value is itself supported
    // (expression-parser.ts, `checkSupport`'s `pos` parameter). Emit a
    // Pebble map literal, keyed the same way `objectLiteralToPebbleDict`
    // quotes the spread-path literal.
    if (properties.length === 0) return '{}'
    const literalOf = (run: readonly Extract<ObjectLiteralProperty, { kind: 'prop' }>[]) =>
      `{${run.map(p => `${pebbleHashKey(p.key)}: ${emit(p.value)}`).join(', ')}}`
    if (!properties.some(p => p.kind === 'spread')) {
      return literalOf(properties as Extract<ObjectLiteralProperty, { kind: 'prop' }>[])
    }
    // Spread (`{ ...t, editing: false }`): folded via the adapter's own
    // `bf.merge(base, top)` runtime helper — NEITHER Jinja's `dict(base,
    // **top)` builtin call NOR Twig's `|merge` filter, since Pebble's
    // built-in filter set is not confirmed to include a `merge` filter with
    // the exact shallow, later-wins-on-conflict semantics JS spread needs
    // (unlike `raw`, which IS confirmed — see `pebble-adapter.ts`'s file
    // header). `bf.merge` keeps this fully under the Java runtime's own
    // control (Phase 3) instead of depending on an unverified builtin.
    const segments = groupObjectLiteralSegments(properties, literalOf, emit)
    return segments.reduce((acc, seg) => `bf.merge(${acc}, ${seg})`)
  }
}
