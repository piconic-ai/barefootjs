/**
 * ParsedExpr → Jinja2 emitters for the Jinja template adapter.
 *
 * Ported from `packages/adapter-xslate/src/adapter/expr/emitters.ts`
 * (`XslateFilterEmitter` / `XslateTopLevelEmitter`). Two `ParsedExprEmitter`
 * implementations:
 *
 *   - `JinjaFilterEmitter` — filter/predicate context (loop param + local
 *     aliases + bare identifier signal fallback); self-contained, reads no
 *     adapter state.
 *   - `JinjaTopLevelEmitter` — top-level / per-render-var context; depends on
 *     the adapter only through the narrow `JinjaEmitContext` seam.
 *
 * Two deliberate divergences from the Kolon port, both documented at their
 * definition site below:
 *
 *   1. **JS-truthy condition wrapping** (`truthyTest`) — Python truthiness
 *      diverges from JS on empty containers; Perl doesn't have this problem
 *      (a Perl ref is always true), so Kolon never needed this. Every
 *      condition-TEST position (`!x`, the left operand of `&&`/`||`, a
 *      ternary's test) routes through the shared `bf.truthy(...)` runtime
 *      helper unless the operand is structurally already boolean-shaped
 *      (`isBooleanResultParsed`). `&&`/`||` still return the ORIGINAL
 *      operand VALUE (not a coerced bool) on the taken branch — matching JS
 *      `a || b` returning `a` itself, not `true` — only the BRANCH TEST uses
 *      `bf.truthy`. Because Jinja's `if/else` ternary has no way to reuse an
 *      already-computed test value for both the test and (conditionally) the
 *      result, the left operand's rendered text is emitted TWICE (once as
 *      the test, once as the value) — safe because every operand reaching
 *      this pipeline is a pure, side-effect-free read (a signal/prop lookup
 *      or a call into a pure runtime helper), never a stateful expression.
 *   2. **No Jinja lambda for the predicate-callback fallback.** Kolon's
 *      `-> $x { … }` lambda is the Xslate top-level emitter's fallback when a
 *      `.filter`/`.every`/`.some`/`.find*` predicate can't be serialized to
 *      the runtime evaluator's JSON form (e.g. a nested method-call
 *      predicate). Jinja has no lambda-expression syntax at all, so there is
 *      no equivalent fallback to port. `JinjaTopLevelEmitter` therefore uses
 *      ONE mechanism for every higher-order callback: the evaluator-JSON
 *      `*_eval` payload (`bf.filter_eval`, `bf.sort_eval`, …). When
 *      `serializeParsedExpr` refuses the body, the call surfaces `BF101`
 *      instead of silently degrading — `.sort`/`.toSorted` is the one
 *      exception, whose non-lambda STRUCTURED fallback (`bf.sort` with a
 *      `{keys: […]}` descriptor, no callback body at all) survives the port
 *      unchanged since it was never lambda-shaped to begin with.
 *      `JinjaFilterEmitter` (the loop `.filter().map()` INLINE predicate,
 *      rendered as a plain boolean expression, never a lambda) is otherwise
 *      unaffected and still used for that path plus the filter-predicate
 *      entry point `_renderJinjaFilterExprPublic`.
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
  identifierPath,
  matchSearchParamsMethodCall,
  sortComparatorFromArrow,
} from '@barefootjs/jsx'

import type { JinjaEmitContext } from '../emit-context.ts'
import { JINJA_TEMPLATE_PRIMITIVES } from '../lib/constants.ts'
import { jinjaIdent, escapeJinjaSingleQuoted } from '../lib/jinja-naming.ts'
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
 * Local shape for the predicate-lowering helper. Mirrors the Kolon port's
 * `PredicateCall`.
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
 * 1). Shared by both emitters below and reused by the adapter's top-level
 * `convertConditionToJinja` for IR-level `if` / loop-filter conditions.
 */
export function truthyTest(node: ParsedExpr, rendered: string): string {
  return isBooleanResultParsed(node) ? rendered : `bf.truthy(${rendered})`
}

/**
 * Lowering for the predicate body of a filter / every / some / find, plus the
 * same shape used by the loop-hoist `.filter().map()` inline condition.
 * Higher-order predicates are emitted using Jinja's own scalar comparison
 * operators.
 *
 * NOTE: Jinja has no `[x for x in … if …]`-as-expression form usable inline
 * here (a comprehension is a value producer, not a boolean test), so a
 * nested higher-order call (`x.tags.filter(...)`, `other.some(...)`) inside
 * a predicate has no faithful scalar lowering here either — same BF101
 * surfacing as Kolon (#2038) instead of silently degrading to the
 * callback's receiver.
 */
export class JinjaFilterEmitter implements ParsedExprEmitter {
  constructor(
    private readonly param: string,
    private readonly localVarMap: Map<string, string>,
    private readonly isStringName: (n: string) => boolean = () => false,
    // Records a BF101 for predicate shapes this emitter can only degrade
    // (#2038). Optional so emitter construction stays possible without an
    // adapter; a missing hook keeps the old silent-degrade emit.
    private readonly onUnsupported?: (message: string, reason?: string) => void,
  ) {}

  identifier(name: string): string {
    if (name === this.param) return jinjaIdent(this.param)
    const signal = this.localVarMap.get(name)
    if (signal) return jinjaIdent(signal)
    return jinjaIdent(name)
  }

  literal(value: string | number | boolean | null, literalType: LiteralType): string {
    if (literalType === 'string') return `'${escapeJinjaSingleQuoted(String(value))}'`
    if (literalType === 'boolean') return value ? 'true' : 'false'
    if (literalType === 'null') return 'none'
    return String(value)
  }

  member(object: ParsedExpr, property: string, _computed: boolean, emit: (e: ParsedExpr) => string): string {
    // `.length` — route through `bf.length` (handles both array element
    // count and string char count, JS-compatibly). Jinja's builtin
    // `|length` filter also faults trying to match JS semantics for every
    // input shape, so route through the runtime uniformly.
    if (property === 'length') {
      return `bf.length(${emit(object)})`
    }
    // Attribute / dict-key access — Jinja `.` resolves both transparently.
    return `${emit(object)}.${property}`
  }

  indexAccess(object: ParsedExpr, index: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    // Jinja's `[]` postfix is polymorphic (list index or dict key),
    // mirroring JS — no list/dict split is needed. #1897 (data-table's
    // `selected()[index]`).
    return `${emit(object)}[${emit(index)}]`
  }

  call(callee: ParsedExpr, args: ParsedExpr[], emit: (e: ParsedExpr) => string): string {
    // Signal getter calls: filter() → filter
    if (callee.kind === 'identifier' && args.length === 0) {
      return jinjaIdent(callee.name)
    }
    return emit(callee)
  }

  unary(op: string, argument: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    if (op === '!') return `not ${truthyTest(argument, emit(argument))}`
    if (op === '-') return `-${emit(argument)}`
    return emit(argument)
  }

  binary(op: string, left: ParsedExpr, right: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    const l = emit(left)
    const r = emit(right)
    // Jinja's `==` / `!=` are value-equality operators that compare strings
    // and numbers correctly — unlike Perl's numeric `==` (which the Mojo
    // adapter must steer around with `eq`/`ne`). Same reasoning as Kolon.
    const opMap: Record<string, string> = {
      '===': '==', '!==': '!=', '>': '>', '<': '<', '>=': '>=', '<=': '<=',
      '+': '+', '-': '-', '*': '*', '/': '/',
    }
    return `${l} ${opMap[op] ?? op} ${r}`
  }

  logical(op: '&&' | '||' | '??', left: ParsedExpr, right: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    const l = emit(left)
    const r = emit(right)
    // See the file header, divergence 1: the branch TEST goes through
    // `bf.truthy`, but the RETURNED value stays the original operand text —
    // `l` appears twice for `&&`/`||` (test + fallback value), safe because
    // every operand here is a pure lookup/call.
    if (op === '&&') return `(${r} if ${truthyTest(left, l)} else ${l})`
    if (op === '||') return `(${l} if ${truthyTest(left, l)} else ${r})`
    // `l is not none` alone is NOT equivalent to JS `??`'s null-or-undefined
    // check: a context var that was never seeded at all (not merely set to
    // `None`) resolves to Jinja's `ChainableUndefined` sentinel under
    // `undefined=ChainableUndefined`, and `Undefined is not none` is TRUE
    // (it's a distinct object, not the `None` singleton) — so the coalesce
    // would silently return the Undefined sentinel itself instead of `r`.
    // Guard with `is defined` too, mirroring the same pair this file's
    // `jinja-adapter.ts` already uses for nullable-optional-prop attribute
    // omission (see that file's header, divergence 5, and the `is defined
    // and is not none` call sites).
    return `(${l} if (${l} is defined and ${l} is not none) else ${r})`
  }

  callbackMethod(
    method: string,
    object: ParsedExpr,
    _arrow: Extract<ParsedExpr, { kind: 'arrow' }>,
    _restArgs: ParsedExpr[],
    emit: (e: ParsedExpr) => string,
  ): string {
    // A nested callback method inside a filter predicate has no Jinja scalar
    // form. Surface BF101 instead of silently changing predicate semantics
    // (`!other.some(r => …)` collapsing to `!other`).
    this.onUnsupported?.(
      `Filter predicate contains a nested '.${method}(...)' callback, which has no Jinja scalar form`,
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

  flatMethod(object: ParsedExpr, depth: FlatDepth, emit: (e: ParsedExpr) => string): string {
    return renderFlatMethod(emit(object), depth)
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
    // `unsupported` does. Object values lower to Jinja dicts in the
    // conditional/attr paths, not through this dispatcher.
    return 'true'
  }
}

/**
 * Lowering for top-level expressions whose identifiers resolve against the
 * Jinja template's per-render context vars (signals, props, locals
 * introduced by `{% set x = … %}`). Differs from the filter emitter mainly
 * in
 *   - `conditional` is supported (filter predicates can't return ternaries),
 *   - higher-order methods route through `bf.*` array/evaluator helpers,
 *   - no lambda fallback exists (see the file header, divergence 2).
 */
export class JinjaTopLevelEmitter implements ParsedExprEmitter {
  constructor(private readonly ctx: JinjaEmitContext) {}

  identifier(name: string): string {
    // `undefined` / `null` nested inside a larger expression tree — Jinja
    // `none` (#1897).
    if (name === 'undefined' || name === 'null') return 'none'
    // Inline a module-scope pure-string const (`const x = 'literal'`) — it
    // never reaches the per-render context, so a bare reference would
    // resolve to Undefined.
    const inlined = this.ctx._resolveModuleStringConst(name)
    if (inlined !== null) return inlined
    // Same for a literal const of any scope (`const totalPages = 5`,
    // #1897 pagination's `Page {currentPage()} of {totalPages}`).
    const literalConst = this.ctx._resolveLiteralConst(name)
    if (literalConst !== null) return literalConst
    return jinjaIdent(name)
  }

  literal(value: string | number | boolean | null, literalType: LiteralType): string {
    if (literalType === 'string') return `'${escapeJinjaSingleQuoted(String(value))}'`
    if (literalType === 'boolean') return value ? 'true' : 'false'
    if (literalType === 'null') return 'none'
    return String(value)
  }

  member(object: ParsedExpr, property: string, _computed: boolean, emit: (e: ParsedExpr) => string): string {
    // `props.x` flattens to the bare context var the SSR caller binds each
    // prop to (props arrive as individual top-level context entries, not a
    // nested `props` dict).
    if (object.kind === 'identifier' && object.name === 'props') {
      return jinjaIdent(property)
    }
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
    // Jinja `.` access works for both dicts and objects.
    return `${obj}.${property}`
  }

  indexAccess(object: ParsedExpr, index: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    // Jinja's `[]` postfix is polymorphic (list index or dict key),
    // mirroring JS. #1897 (data-table's `selected()[index]`).
    return `${emit(object)}[${emit(index)}]`
  }

  call(callee: ParsedExpr, args: ParsedExpr[], emit: (e: ParsedExpr) => string): string {
    // Signal getter: count() → count
    if (callee.kind === 'identifier' && args.length === 0) {
      return jinjaIdent(callee.name)
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
    const spec = path ? JINJA_TEMPLATE_PRIMITIVES[path] : undefined
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
    const l = emit(left)
    const r = emit(right)
    // Jinja's `==` / `!=` handle both strings and numbers (unlike Perl's
    // numeric `==`), so all equality comparisons stay on `==` / `!=`.
    const opMap: Record<string, string> = {
      '===': '==', '!==': '!=', '>': '>', '<': '<', '>=': '>=', '<=': '<=',
      '+': '+', '-': '-', '*': '*',
    }
    return `${l} ${opMap[op] ?? op} ${r}`
  }

  logical(op: '&&' | '||' | '??', left: ParsedExpr, right: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    const l = emit(left)
    const r = emit(right)
    // See the file header, divergence 1.
    if (op === '&&') return `(${r} if ${truthyTest(left, l)} else ${l})`
    if (op === '||') return `(${l} if ${truthyTest(left, l)} else ${r})`
    // See `JinjaFilterEmitter.logical`'s comment above (same file, same
    // fix): guard with `is defined` too, so a context var that was never
    // seeded (Jinja's `ChainableUndefined`, not Python `None`) still
    // coalesces to `r` instead of leaking the Undefined sentinel through.
    return `(${l} if (${l} is defined and ${l} is not none) else ${r})`
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

    // Predicate family (#2018 P2/P5): `filter` / `find*` / `every` / `some`.
    if (PREDICATE_METHODS.has(method as HigherOrderMethod)) {
      return this._emitPredicateCallback(
        { method: method as HigherOrderMethod, object, param: params[0], predicate: body },
        recv,
        emit,
      )
    }

    // `.sort(cmp)` / `.toSorted(cmp)` (#2018): serialize the comparator body +
    // emit `bf.sort_eval`; fall back to the structured `bf.sort` when the
    // body is outside the evaluator surface (e.g. `localeCompare`). This
    // structured fallback is data (a `{keys: […]}` descriptor), never a
    // lambda, so it ports unchanged — see the file header, divergence 2.
    if (method === 'sort' || method === 'toSorted') {
      const evalForm = renderSortEval(recv, body, params, emit)
      if (evalForm !== null) return evalForm
      const structured = sortComparatorFromArrow(arrow)
      if (structured !== null) return renderSortMethod(recv, structured)
      this.ctx._recordExprBF101(
        `'.${method}(...)' comparator is outside the Jinja adapter's evaluable / structured surface`,
        `Pre-compute the sorted array, or move this position to a '/* @client */' boundary.`,
      )
      return "''"
    }

    // `.reduce(fn, init)` / `.reduceRight(fn, init)` (#2018): serialize the
    // reducer body + emit `bf.reduce_eval`. The init is the trailing arg.
    if (method === 'reduce' || method === 'reduceRight') {
      const direction = method === 'reduceRight' ? 'right' : 'left'
      const init = restArgs[0]
      const evalForm =
        init !== undefined
          ? renderReduceEval(recv, body, params, init, direction, emit)
          : null
      if (evalForm !== null) return evalForm
      this.ctx._recordExprBF101(
        `'.${method}(...)' is outside the Jinja adapter's evaluable surface (needs a literal initial value and an evaluable reducer body)`,
        `Pre-compute the reduced value, or move this position to a '/* @client */' boundary.`,
      )
      return "''"
    }

    // `.flatMap(proj)` (#2018 P3): serialize the projection body + emit
    // `bf.flat_map_eval`.
    if (method === 'flatMap') {
      const evalForm = renderFlatMapEval(recv, body, params[0], emit)
      if (evalForm !== null) return evalForm
      this.ctx._recordExprBF101(
        `'.flatMap(...)' projection is outside the Jinja adapter's evaluable surface`,
        `Pre-compute the projected array, or move this position to a '/* @client */' boundary.`,
      )
      return "''"
    }

    // Value-producing `.map(cb)` (#2073): serialize the projection body +
    // emit `bf.map_eval`. (The JSX-returning `.map` is an IRLoop upstream.)
    if (method === 'map') {
      const evalForm = renderMapEval(recv, body, params[0], emit)
      if (evalForm !== null) return evalForm
      this.ctx._recordExprBF101(
        `'.map(...)' projection is outside the Jinja adapter's evaluable surface`,
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
   * `some`). See the file header, divergence 2: Jinja has no lambda
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
    // evaluator path on Jinja (no lambda fallback) — the identity predicate
    // serializes fine (`{"kind":"identifier","name":"_t"}`), so this isn't a
    // special case here the way it is for Kolon's lambda form.
    const spec = evalFn[method]
    if (spec) {
      const evalForm = renderPredicateEval(spec[0], arrayExpr, predicate, param, emit, spec[1])
      if (evalForm !== null) return evalForm
    }

    this.ctx._recordExprBF101(
      `'.${method}(...)' predicate is outside the Jinja adapter's evaluable surface — Jinja has no lambda-expression form to fall back to`,
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

  flatMethod(object: ParsedExpr, depth: FlatDepth, emit: (e: ParsedExpr) => string): string {
    return renderFlatMethod(emit(object), depth)
  }

  conditional(
    test: ParsedExpr,
    consequent: ParsedExpr,
    alternate: ParsedExpr,
    emit: (e: ParsedExpr) => string,
  ): string {
    return `(${emit(consequent)} if ${truthyTest(test, emit(test))} else ${emit(alternate)})`
  }

  templateLiteral(parts: TemplatePart[], emit: (e: ParsedExpr) => string): string {
    // `` `n=${count() + 1}` `` → Jinja string concatenation (`~`):
    // `'n=' ~ bf.string(count + 1)`. Every interpolated (non-string-literal)
    // segment routes through `bf.string(...)` before concatenation — Jinja's
    // `~` stringifies each operand with Python `str()`, which diverges from
    // JS `String(x)` for floats/booleans/None (see `jinja-adapter.ts`'s file
    // header, "Stringification").
    const terms: string[] = []
    for (const part of parts) {
      if (part.type === 'string') {
        if (part.value !== '') {
          terms.push(`'${escapeJinjaSingleQuoted(part.value)}'`)
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
    // empty-string literal so a stray emit can't produce a Jinja syntax
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

  objectLiteral(_properties: ObjectLiteralProperty[], _raw: string, _emit: (e: ParsedExpr) => string): string {
    // Mirror `unsupported`: a bare object literal reaching the dispatcher
    // lowers to the safe empty-string literal. Object values that round-trip
    // to a Jinja dict go through the dedicated `objectLiteralToJinjaDict`
    // lowering in the conditional/attr paths.
    return "''"
  }
}
