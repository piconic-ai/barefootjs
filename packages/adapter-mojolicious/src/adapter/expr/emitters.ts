/**
 * ParsedExpr → Perl emitters for the Mojolicious EP template adapter.
 *
 * Extracted from `mojo-adapter.ts` (domain-module refactor, issue #2018
 * track D). Two `ParsedExprEmitter` implementations:
 *
 *   - `MojoFilterEmitter` — filter/predicate context (loop param + local
 *     aliases + bare `$name` signal fallback); self-contained, reads no
 *     adapter state.
 *   - `MojoTopLevelEmitter` — top-level / stash context; depends on the
 *     adapter only through the narrow `MojoEmitContext` seam.
 */

import {
  type ParsedExprEmitter,
  type HigherOrderMethod,
  type ArrayMethod,
  type LiteralType,
  type ParsedExpr,
  type ObjectLiteralProperty,
  type FlatDepth,
  type TemplatePart,
  emitParsedExpr,
  identifierPath,
  matchSearchParamsMethodCall,
  sortComparatorFromArrow,
  asCallbackMethodCall,
} from '@barefootjs/jsx'

import type { MojoEmitContext } from '../emit-context.ts'
import { MOJO_TEMPLATE_PRIMITIVES } from '../lib/constants.ts'
import { emitIndexAccessPerl, isStringTypedOperand } from './operand.ts'
import {
  renderArrayMethod,
  renderSortMethod,
  renderSortEval,
  renderReduceEval,
  renderPredicateEval,
  renderFlatMethod,
  renderFlatMapEval,
} from './array-method.ts'

/**
 * Local shape for the predicate-method fallback chain (#2018 P5). The
 * higher-order callback arrives as a generic `call`; `callbackMethod` recovers
 * `{ method, object, param, predicate }` from it before threading it through
 * the inline `grep` / `bf->find` lowering the old `higher-order` node fed.
 */
type PredicateCall = {
  method: HigherOrderMethod
  object: ParsedExpr
  param: string
  predicate: ParsedExpr
}

/**
 * Lowering for the predicate body of a filter / every / some / find,
 * plus the same shape used by `renderBlockBodyCondition` for complex
 * block-body filters. Identifiers resolve against:
 *   - the predicate's loop param (`$param`),
 *   - `localVarMap` aliases declared inside the block body, then
 *   - a bare `$name` fallback for signals captured by the closure.
 *
 * Methods that have no filter-context meaning (template-literal,
 * arrow-fn, conditional, unsupported) fall back to the `'1'` literal
 * the original switch's `default` arm returned — those shapes never
 * arose inside the predicates the adapter actually accepts.
 */
export class MojoFilterEmitter implements ParsedExprEmitter {
  constructor(
    private readonly param: string,
    private readonly localVarMap: Map<string, string>,
    // Reports whether a getter/prop name is string-typed, so `===`/`!==`
    // against it lowers to `eq`/`ne` (#1672). Defaults to "never" for callers
    // that don't thread it through.
    private readonly isStringName: (n: string) => boolean = () => false,
  ) {}

  identifier(name: string): string {
    if (name === this.param) return `$${this.param}`
    const signal = this.localVarMap.get(name)
    if (signal) return `$${signal}`
    return `$${name}`
  }

  literal(value: string | number | boolean | null, literalType: LiteralType): string {
    if (literalType === 'string') return `'${value}'`
    if (literalType === 'boolean') return value ? '1' : '0'
    if (literalType === 'null') return 'undef'
    return String(value)
  }

  member(object: ParsedExpr, property: string, _computed: boolean, emit: (e: ParsedExpr) => string): string {
    // `.length` on a higher-order result (e.g.
    // `x.tags.filter(t => t.active).length > 0` inside the outer
    // filter predicate, #1443). The higher-order emit produces an
    // anonymous array ref `[grep ...]`; reading `->{length}` on that
    // is undef at runtime, which is why the pre-#1443 `containsHigherOrder`
    // gate refused this shape outright. Lowering `.length` to
    // `scalar(@{...})` makes the result a real Perl integer.
    if (property === 'length' && (asCallbackMethodCall(object) !== null || object.kind === 'array-literal')) {
      return `scalar(@{${emit(object)}})`
    }
    return `${emit(object)}->{${property}}`
  }

  indexAccess(object: ParsedExpr, index: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    return emitIndexAccessPerl(object, index, emit, this.isStringName)
  }

  call(callee: ParsedExpr, args: ParsedExpr[], emit: (e: ParsedExpr) => string): string {
    // Signal getter calls: filter() → $filter
    if (callee.kind === 'identifier' && args.length === 0) {
      return `$${callee.name}`
    }
    return emit(callee)
  }

  unary(op: string, argument: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    const arg = emit(argument)
    if (op === '!') {
      // Wrap binary/logical operands in parens to dodge Perl precedence surprises.
      const needsParens = argument.kind === 'binary' || argument.kind === 'logical'
      return needsParens ? `!(${arg})` : `!${arg}`
    }
    if (op === '-') return `-${arg}`
    return arg
  }

  binary(op: string, left: ParsedExpr, right: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    const l = emit(left)
    const r = emit(right)
    // String equality: `eq`/`ne` when EITHER operand is string-typed — a string
    // literal, a string signal getter, or a string prop. Numeric `==`/`!=`
    // would coerce both sides to 0 and match unrelated non-numeric strings (#1672).
    const isStr = (e: ParsedExpr) => isStringTypedOperand(e, this.isStringName)
    const stringCmp = isStr(left) || isStr(right)
    if ((op === '===' || op === '==') && stringCmp) {
      return `${l} eq ${r}`
    }
    if ((op === '!==' || op === '!=') && stringCmp) {
      return `${l} ne ${r}`
    }
    const opMap: Record<string, string> = {
      '===': '==', '!==': '!=', '>': '>', '<': '<', '>=': '>=', '<=': '<=',
      '+': '+', '-': '-', '*': '*', '/': '/',
    }
    return `${l} ${opMap[op] ?? op} ${r}`
  }

  logical(op: '&&' | '||' | '??', left: ParsedExpr, right: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    const l = emit(left)
    const r = emit(right)
    if (op === '&&') return `(${l} && ${r})`
    if (op === '||') return `(${l} || ${r})`
    return `(${l} // ${r})`
  }

  callbackMethod(
    method: string,
    object: ParsedExpr,
    arrow: Extract<ParsedExpr, { kind: 'arrow' }>,
    _restArgs: ParsedExpr[],
    emit: (e: ParsedExpr) => string,
  ): string {
    // Filter context only meaningfully handles the predicate methods
    // (filter / every / some land here through nested `.filter(...)` chains).
    // Sort / reduce / flatMap never arise inside a predicate, so route them to
    // the truthy sentinel like the old `default` arm did.
    const predicateMethods: ReadonlySet<string> = new Set([
      'filter', 'find', 'findIndex', 'findLast', 'findLastIndex', 'every', 'some',
    ])
    if (!predicateMethods.has(method)) return '1'
    // The predicate body is also a filter context, but with this
    // callback's own `param` (potentially shadowing the outer one),
    // so we spin up a nested emitter with the inner param.
    const param = arrow.params[0]
    const predicate = arrow.body
    const arrayExpr = emit(object)
    const predBody = emitParsedExpr(predicate, new MojoFilterEmitter(param, this.localVarMap, this.isStringName))
    const grepBody = predBody.replace(new RegExp(`\\$${param}\\b`, 'g'), '$_')
    if (method === 'filter') return `[grep { ${grepBody} } @{${arrayExpr}}]`
    if (method === 'every') return `!(grep { !(${grepBody}) } @{${arrayExpr}})`
    if (method === 'some') return `!!(grep { ${grepBody} } @{${arrayExpr}})`
    return arrayExpr
  }

  arrayLiteral(elements: ParsedExpr[], emit: (e: ParsedExpr) => string): string {
    // Perl array ref: `[$a, $b]`. Filter-context use is rare (the
    // outer emitter routes most array-literal arrivals via
    // MojoTopLevelEmitter), but #1443's chain
    // `[a, b].filter(Boolean).join(' ')` can land here when the
    // outer `.filter()` recurses into a nested filter whose own
    // source is an array literal.
    return `[${elements.map(emit).join(', ')}]`
  }

  arrayMethod(
    method: ArrayMethod,
    object: ParsedExpr,
    args: ParsedExpr[],
    emit: (e: ParsedExpr) => string,
  ): string {
    // Filter-context array methods are vanishingly rare — predicates
    // operate on scalars, not arrays. Defer to the top-level rendering
    // (`join(sep, @{...})`) for any case that does land here so the
    // emission stays consistent across contexts.
    return renderArrayMethod(method, object, args, emit)
  }

  flatMethod(object: ParsedExpr, depth: FlatDepth, emit: (e: ParsedExpr) => string): string {
    return renderFlatMethod(emit(object), depth)
  }

  conditional(_test: ParsedExpr, _consequent: ParsedExpr, _alternate: ParsedExpr): string {
    return '1'
  }

  templateLiteral(_parts: TemplatePart[]): string {
    return '1'
  }

  arrow(_params: string[], _body: ParsedExpr, _emit: (e: ParsedExpr) => string): string {
    // A standalone arrow only reaches here outside a callback position, which
    // never arises in a predicate context — emit the truthy sentinel like the
    // pre-#2018 `arrowFn` fallback.
    return '1'
  }

  regex(_raw: string): string {
    // A standalone regex has no filter-predicate meaning — truthy sentinel.
    return '1'
  }

  unsupported(_raw: string, _reason: string): string {
    return '1'
  }

  objectLiteral(_properties: ObjectLiteralProperty[], _raw: string, _emit: (e: ParsedExpr) => string): string {
    // Filter-predicate context: an object literal is not a boolean leaf, so
    // emit the truthy sentinel exactly as `unsupported` does (byte-identical
    // with the pre-`object-literal` fallback; Roadmap A-1). Object *values*
    // are lowered to Perl hashrefs in the conditional/attr paths, not here.
    return '1'
  }
}

/**
 * Lowering for top-level expressions whose identifiers resolve against
 * the Mojo template's stash (signals, props, locals introduced by
 * `% my $x = ...;` lines). Differs from the filter emitter mainly in
 *   - `.length` → `scalar(@{...})` (filter contexts never see arrays
 *     in lvalue position),
 *   - `conditional` is supported (filter predicates can't return
 *     ternaries),
 *   - the `unsupported` fallback drops to the regex pipeline so legacy
 *     shapes the AST can't classify still emit something coherent.
 */
export class MojoTopLevelEmitter implements ParsedExprEmitter {
  constructor(private readonly ctx: MojoEmitContext) {}

  identifier(name: string): string {
    // `undefined` / `null` nested inside a larger expression tree
    // (#1897, pagination's `props.isActive ? 'page' : undefined`) — the
    // top-level short-circuits don't see them.
    if (name === 'undefined' || name === 'null') return 'undef'
    // Module pure-string const (e.g. `const baseClasses = '...'` used in a
    // className template literal): inline the literal value rather than emit
    // `$baseClasses` against a stash variable that is never bound.
    const inlined = this.ctx.resolveModuleStringConst(name)
    if (inlined !== null) return inlined
    // Same for a literal const of any scope (`const totalPages = 5`,
    // #1897 pagination's `Page {currentPage()} of {totalPages}`).
    const literalConst = this.ctx.resolveLiteralConst(name)
    if (literalConst !== null) return literalConst
    return `$${name}`
  }

  literal(value: string | number | boolean | null, literalType: LiteralType): string {
    if (literalType === 'string') return `'${value}'`
    if (literalType === 'boolean') return value ? '1' : '0'
    if (literalType === 'null') return 'undef'
    return String(value)
  }

  member(object: ParsedExpr, property: string, _computed: boolean, emit: (e: ParsedExpr) => string): string {
    // `props.x` flattens to the bare `$x` the Mojo SSR caller binds each
    // prop to (props arrive as individual `my $x = ...` vars, not a
    // `$props` hashref).
    if (object.kind === 'identifier' && object.name === 'props') {
      return `$${property}`
    }
    // Static property access on a module object-literal const
    // (`variantClasses.ghost`, #1897) resolves at compile time — the
    // generic hash lowering below would dereference a Perl var that
    // doesn't exist server-side.
    if (object.kind === 'identifier') {
      const staticValue = this.ctx.resolveStaticRecordLiteral(object.name, property)
      if (staticValue !== null) return staticValue
    }
    const obj = emit(object)
    if (property === 'length') return `scalar(@{${obj}})`
    return `${obj}->{${property}}`
  }

  indexAccess(object: ParsedExpr, index: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    return emitIndexAccessPerl(object, index, emit, n => this.ctx._isStringValueName(n))
  }

  call(callee: ParsedExpr, args: ParsedExpr[], emit: (e: ParsedExpr) => string): string {
    // Signal getter: count() → $count
    if (callee.kind === 'identifier' && args.length === 0) {
      return `$${callee.name}`
    }
    // Env-signal method call (#1922): `searchParams().get('sort')` is a real
    // method call on the per-request `$searchParams` reader object, not the
    // generic hash deref `member` would emit (`$searchParams->{get}`, which
    // drops the arg). Matches the local import binding (incl. an alias).
    if (this.ctx._searchParamsLocals.size > 0) {
      const sp = matchSearchParamsMethodCall(callee, args, this.ctx._searchParamsLocals)
      if (sp) {
        return `$searchParams->${sp.method}(${sp.args.map(emit).join(', ')})`
      }
    }
    // Identifier-path templatePrimitive (#1189): `JSON.stringify(x)` /
    // `Math.floor(x)` → `bf->json($x)` / `bf->floor($x)`. Args render
    // recursively through this same emitter so prop refs / signal calls
    // inside them get the standard transforms. Mirrors the Go adapter's
    // `call()` primitive dispatch. A wrong-arity call records BF101 and
    // returns the safe `''` placeholder (never silently emits a bad call).
    const path = identifierPath(callee)
    const spec = path ? MOJO_TEMPLATE_PRIMITIVES[path] : undefined
    if (path && spec) {
      if (args.length === spec.arity) {
        return spec.emit(args.map(emit))
      }
      this.ctx._recordExprBF101(
        `templatePrimitive '${path}' expects ${spec.arity} arg(s), got ${args.length}`,
        `Call '${path}' with exactly ${spec.arity} argument(s).`,
      )
      // Don't fall through to the generic `emit(callee)` below — for a
      // member callee (`JSON.stringify`) that emits an invalid Perl
      // hash-deref (`$JSON->{stringify}`). Return the same safe
      // empty-string placeholder the other BF101 paths use.
      return "''"
    }
    // Array methods (`.join` and any others added to ArrayMethod, #1443)
    // are lifted into the `array-method` IR kind at parse time, so they
    // never reach this dispatcher. Per-method detection here would mix
    // value-builtin lowering with signal-call lowering — keeping them
    // separated forces every adapter to declare the full array-method
    // surface in one place (the `arrayMethod` emitter below).
    return emit(callee)
  }

  unary(op: string, argument: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    const arg = emit(argument)
    if (op === '!') return `!${arg}`
    if (op === '-') return `-${arg}`
    return arg
  }

  binary(op: string, left: ParsedExpr, right: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    const l = emit(left)
    const r = emit(right)
    // String equality: `eq`/`ne` when EITHER operand is string-typed — a string
    // literal (`role() === 'admin'`), a string signal getter (`sel()`), or a
    // string prop (`props.x`). Falling back to numeric `==`/`!=` would make
    // Perl coerce both sides to 0 and match unrelated non-numeric strings
    // (`"b" == "a"` → true), so all loop items render their true branch (#1672).
    const isStr = (e: ParsedExpr) => isStringTypedOperand(e, n => this.ctx._isStringValueName(n))
    const stringCmp = isStr(left) || isStr(right)
    if ((op === '===' || op === '==') && stringCmp) {
      return `${l} eq ${r}`
    }
    if ((op === '!==' || op === '!=') && stringCmp) {
      return `${l} ne ${r}`
    }
    const opMap: Record<string, string> = {
      '===': '==', '!==': '!=', '>': '>', '<': '<', '>=': '>=', '<=': '<=',
      '+': '+', '-': '-', '*': '*',
    }
    return `${l} ${opMap[op] ?? op} ${r}`
  }

  logical(op: '&&' | '||' | '??', left: ParsedExpr, right: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    const l = emit(left)
    const r = emit(right)
    if (op === '&&') return `(${l} && ${r})`
    if (op === '||') return `(${l} || ${r})`
    return `(${l} // ${r})`
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

    // sort / toSorted: eval-first, then the structured `bf->sort` fallback
    // (recovered from the arrow by `sortComparatorFromArrow`, e.g. a
    // `localeCompare` comparator), then BF101.
    if (method === 'sort' || method === 'toSorted') {
      const evalForm = renderSortEval(recv, body, params, emit)
      if (evalForm !== null) return evalForm
      const c = sortComparatorFromArrow(arrow)
      if (c !== null) return renderSortMethod(recv, c)
      this.ctx._recordExprBF101(
        `.${method}(...) comparator is not lowerable to a template sort`,
        `Pre-sort the array in the route handler, or mark the loop @client-only.`,
      )
      return "''"
    }

    // reduce / reduceRight: eval-only (the arithmetic catalogue always
    // serializes); BF101 when the body is outside the evaluator surface or the
    // seed isn't a literal.
    if (method === 'reduce' || method === 'reduceRight') {
      const direction = method === 'reduceRight' ? 'right' : 'left'
      const init = restArgs[0]
      const evalForm =
        init !== undefined ? renderReduceEval(recv, body, params, init, direction, emit) : null
      if (evalForm !== null) return evalForm
      this.ctx._recordExprBF101(
        `.${method}(...) is not lowerable to a template fold`,
        `Pre-compute the fold in the route handler, or mark the loop @client-only.`,
      )
      return "''"
    }

    // flatMap: eval-only; BF101 when the projection is outside the surface.
    if (method === 'flatMap') {
      const evalForm = renderFlatMapEval(recv, body, params[0], emit)
      if (evalForm !== null) return evalForm
      this.ctx._recordExprBF101(
        `.flatMap(...) projection is not lowerable to a template flat-map`,
        `Pre-compute the projection in the route handler, or mark the loop @client-only.`,
      )
      return "''"
    }

    // Predicate methods: filter / find / every / some / findIndex / findLast /
    // findLastIndex. Eval-first (#2018 P2), then the inline `grep` / `bf->find`
    // fallback for a predicate the evaluator can't model.
    const cb: PredicateCall = {
      method: method as HigherOrderMethod,
      object,
      param: params[0],
      predicate: body,
    }
    return this.renderPredicate(cb, recv, emit)
  }

  private renderPredicate(
    cb: PredicateCall,
    arrayExpr: string,
    emit: (e: ParsedExpr) => string,
  ): string {
    const { method, param, predicate } = cb
    // Evaluator path (#2018 P2): serialize the predicate body + emit the
    // matching `bf->*_eval` helper (isomorphic with the Go adapter). Falls
    // back to the inline `grep` / `bf->find` lowering below for a predicate
    // the evaluator can't model (e.g. a method-call predicate).
    const evalFn: Record<string, [string, boolean?]> = {
      filter: ['filter_eval'], every: ['every_eval'], some: ['some_eval'],
      find: ['find_eval', true], findLast: ['find_eval', false],
      findIndex: ['find_index_eval', true], findLastIndex: ['find_index_eval', false],
    }
    // `.filter(Boolean)` (identity predicate `_t => _t`) keeps the inline
    // `grep { $_ }` form — it composes through the array-method chain
    // (`.filter(Boolean).join(' ')` in the registry Slot) and renders
    // identically to a truthiness filter.
    const isIdentity =
      method === 'filter' && predicate.kind === 'identifier' && predicate.name === param
    const spec = evalFn[method]
    if (spec && !isIdentity) {
      const evalForm = renderPredicateEval(spec[0], arrayExpr, predicate, param, emit, spec[1])
      if (evalForm !== null) return evalForm
    }

    const predBody = this.ctx._renderPerlFilterExprPublic(predicate, param)
    const grepBody = predBody.replace(new RegExp(`\\$${param}\\b`, 'g'), '$_')
    if (method === 'filter') return `[grep { ${grepBody} } @{${arrayExpr}}]`
    if (method === 'every') return `!(grep { !(${grepBody}) } @{${arrayExpr}})`
    if (method === 'some') return `!!(grep { ${grepBody} } @{${arrayExpr}})`
    // `.find` / `.findIndex` / `.findLast` / `.findLastIndex` → the runtime
    // helpers (`bf->find` / `find_index` / `find_last` / `find_last_index`),
    // which call the predicate as a per-element coderef — same shape Xslate
    // emits via a Kolon lambda. The JS camelCase names map to the snake_case
    // helpers (like index_of / last_index_of).
    const findHelper: Record<string, string> = {
      find: 'find',
      findIndex: 'find_index',
      findLast: 'find_last',
      findLastIndex: 'find_last_index',
    }
    if (findHelper[method]) {
      return `bf->${findHelper[method]}(${arrayExpr}, sub { my $${param} = $_[0]; ${predBody} })`
    }
    return arrayExpr
  }

  arrayLiteral(elements: ParsedExpr[], emit: (e: ParsedExpr) => string): string {
    // Perl array ref. Identifiers inside elements resolve through the
    // top-level emitter so `[className, childClass]` becomes
    // `[$className, $childClass]` (the registry Slot's chain in
    // #1443). Empty `[]` stays as `[]` — a valid empty Perl array
    // ref that grep/join handle naturally.
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

  flatMethod(object: ParsedExpr, depth: FlatDepth, emit: (e: ParsedExpr) => string): string {
    return renderFlatMethod(emit(object), depth)
  }

  conditional(
    test: ParsedExpr,
    consequent: ParsedExpr,
    alternate: ParsedExpr,
    emit: (e: ParsedExpr) => string,
  ): string {
    return `(${emit(test)} ? ${emit(consequent)} : ${emit(alternate)})`
  }

  templateLiteral(parts: TemplatePart[], emit: (e: ParsedExpr) => string): string {
    // `` `n=${count() + 1}` `` → Perl string concatenation
    // (`"n=" . ($count + 1)`), NOT double-quote interpolation. Perl only
    // interpolates simple `$var` reads inside `"..."`, so complex `${...}`
    // parts — arithmetic, helper calls (`bf->json(...)`), ternaries —
    // would render unevaluated if inlined into a quoted string.
    //   - Static chunks are emitted as quoted literals with the sigils
    //     that interpolate inside `"..."` (`$`/`@`) plus `"`/`\` escaped,
    //     so literal text survives verbatim.
    //   - Expression terms whose Perl precedence is below `.` (binary /
    //     logical / conditional) wrap in parens so they bind before the
    //     concatenation.
    const terms: string[] = []
    for (const part of parts) {
      if (part.type === 'string') {
        if (part.value !== '') {
          terms.push(`"${part.value.replace(/[\\"$@]/g, m => `\\${m}`)}"`)
        }
      } else {
        const rendered = emit(part.expr)
        const needsParens =
          part.expr.kind === 'binary' ||
          part.expr.kind === 'logical' ||
          part.expr.kind === 'conditional'
        terms.push(needsParens ? `(${rendered})` : rendered)
      }
    }
    if (terms.length === 0) return '""'
    return terms.join(' . ')
  }

  arrow(_params: string[], _body: ParsedExpr, _emit: (e: ParsedExpr) => string): string {
    // A bare arrow function never stands alone at a render position (it's
    // only meaningful as a callback argument, handled by `callbackMethod`).
    // Return the safe Perl empty-string literal `''` — consistent with the
    // BF101 / `unsupported` paths — so a stray emit can't produce a `<%= %>`
    // syntax error.
    return "''"
  }

  regex(_raw: string): string {
    // A standalone regex literal has no template render form (it only appears
    // as a `.replace(/re/, …)` argument the parser refuses upstream). Mirror
    // `arrow` / `unsupported` with the safe Perl empty-string literal.
    return "''"
  }

  unsupported(_raw: string, _reason: string): string {
    // Unreachable in the parse-first flow: `convertExpressionToPerl`
    // gates on `isSupported` before dispatching, and `isSupported`
    // recurses, so a top-level supported expression never contains an
    // `unsupported` node. Return a safe Perl empty-string literal in
    // case a future caller renders a node tree directly.
    return "''"
  }

  objectLiteral(_properties: ObjectLiteralProperty[], _raw: string, _emit: (e: ParsedExpr) => string): string {
    // Mirror `unsupported`: a bare object literal reaching the dispatcher
    // lowers to the safe Perl empty-string literal, exactly as before the
    // `object-literal` kind existed (byte-identical; Roadmap A-1). Object
    // values that round-trip to a Perl hashref go through the dedicated
    // `objectLiteralToPerlHashref` lowering in the conditional/attr paths.
    return "''"
  }
}
