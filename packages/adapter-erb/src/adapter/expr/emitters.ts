/**
 * ParsedExpr → Ruby emitters for the ERB template adapter.
 *
 * Ported from the Mojolicious adapter's `expr/emitters.ts` (issue #2018
 * track D lineage), retargeted at Ruby / ERB's two-locals variable model
 * (`bf`, `v`). Two `ParsedExprEmitter` implementations:
 *
 *   - `ErbFilterEmitter` — filter/predicate context (loop param + local
 *     aliases + `v[:name]` / loop-bound-local fallback for other
 *     identifiers); self-contained aside from a couple of adapter-supplied
 *     predicates, reads no other adapter state.
 *   - `ErbTopLevelEmitter` — top-level / vars-Hash context; depends on the
 *     adapter only through the narrow `ErbEmitContext` seam.
 *
 * Two structural simplifications fall out of Ruby's richer surface
 * relative to Perl (documented at each site below, not scattered as
 * special cases):
 *
 *   1. **Predicate callbacks compile to real Ruby blocks** (`.select { |x|
 *      ... }`) instead of Perl's regex `$param → $_` substitution into a
 *      `grep { ... }` block body — Ruby blocks take named parameters, so
 *      no textual substitution is needed.
 *   2. **`.length` on a higher-order chain result needs no special form**
 *      (`arr.select { ... }.length` just works) — Perl's anonymous-arrayref
 *      `scalar(@{[grep ...]})` workaround has no ERB analog to port.
 *
 * The one thing EP does NOT need that ERB does: JS `&&` / `||` / `!` /
 * ternary tests must be wrapped in `bf.truthy?(...)`. Perl's own falsy set
 * (`undef`, `0`, `''`, `'0'`) already tracks JS's closely enough that Mojo's
 * native `&&`/`||`/`!`/`?:` work unwrapped; Ruby's falsy set is only
 * `nil`/`false`, so `0`, `''`, and `NaN` are Ruby-truthy but JS-falsy. Every
 * JS truthiness test in this file goes through `bf.truthy?` for that reason.
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
} from '@barefootjs/jsx'

import type { ErbEmitContext } from '../emit-context.ts'
import { ERB_TEMPLATE_PRIMITIVES } from '../lib/constants.ts'
import { rubyLocal, rubyStringLiteral, rubySymbolLiteral } from '../lib/ruby-naming.ts'
import { emitIndexAccessRuby } from './operand.ts'
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
 * Local shape for the predicate-method fallback chain. The higher-order
 * callback arrives as a generic `call`; `callbackMethod` recovers
 * `{ method, object, param, predicate }` from it before threading it
 * through the Ruby block / `bf.find*` lowering.
 */
type PredicateCall = {
  method: HigherOrderMethod
  object: ParsedExpr
  param: string
  predicate: ParsedExpr
}

// Predicate-shaped higher-order methods (filter/every/some land here through
// nested `.filter(...)` chains). Module-level so `callbackMethod`, which runs
// for many nodes during template generation, reuses one set per process.
const PREDICATE_METHODS: ReadonlySet<string> = new Set([
  'filter', 'find', 'findIndex', 'findLast', 'findLastIndex', 'every', 'some',
])

/** `void` referencing an unused parameter without a lint complaint. */
function unusedIsStringName(_n: string): boolean {
  return false
}

export class ErbFilterEmitter implements ParsedExprEmitter {
  constructor(
    private readonly param: string,
    private readonly localVarMap: Map<string, string>,
    // Whether `name` currently names a bare Ruby local bound by an
    // ENCLOSING loop/block (distinct from `this.param`, which is this
    // predicate's own — possibly nested — loop param). See
    // `ErbEmitContext.isLoopBoundName`'s docstring for why ERB needs this
    // and EP does not.
    private readonly isLoopBoundOuter: (n: string) => boolean = () => false,
    // Reports whether a getter/prop name is string-typed, for the Hash-vs-
    // Array index-access split (#operand.ts). Defaults to "never" for
    // callers that don't thread it through.
    private readonly isStringName: (n: string) => boolean = unusedIsStringName,
    // Records a BF101 for nested callback shapes this emitter can only
    // degrade — `find*` and the non-predicate methods. Optional so emitter
    // construction stays possible without an adapter; a missing hook keeps
    // the old silent-degrade emit.
    private readonly onUnsupported?: (message: string, reason?: string) => void,
  ) {}

  identifier(name: string): string {
    if (name === this.param) return rubyLocal(this.param)
    const signal = this.localVarMap.get(name)
    if (signal) return `v[${rubySymbolLiteral(signal)}]`
    if (this.isLoopBoundOuter(name)) return rubyLocal(name)
    return `v[${rubySymbolLiteral(name)}]`
  }

  literal(value: string | number | boolean | null, literalType: LiteralType): string {
    if (literalType === 'string') return rubyStringLiteral(String(value))
    if (literalType === 'boolean') return value ? 'true' : 'false'
    if (literalType === 'null') return 'nil'
    return String(value)
  }

  member(object: ParsedExpr, property: string, _computed: boolean, emit: (e: ParsedExpr) => string): string {
    // `.length` needs no special higher-order form here — see the file
    // docstring's simplification (2): `.select { ... }.length` just works
    // in Ruby, unlike Perl's anonymous-arrayref `scalar(@{...})` detour.
    if (property === 'length') return `${emit(object)}.length`
    return `${emit(object)}[${rubySymbolLiteral(property)}]`
  }

  indexAccess(object: ParsedExpr, index: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    return emitIndexAccessRuby(object, index, emit, this.isStringName)
  }

  call(callee: ParsedExpr, args: ParsedExpr[], emit: (e: ParsedExpr) => string): string {
    // Signal getter calls: filter() → v[:filter]
    if (callee.kind === 'identifier' && args.length === 0) {
      return `v[${rubySymbolLiteral(callee.name)}]`
    }
    return emit(callee)
  }

  unary(op: string, argument: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    const arg = emit(argument)
    // JS `!x` tests JS truthiness, not Ruby's — wrap. See file docstring.
    if (op === '!') return `!bf.truthy?(${arg})`
    if (op === '-') return `-(${arg})`
    return arg
  }

  binary(op: string, left: ParsedExpr, right: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    const l = emit(left)
    const r = emit(right)
    // Unlike Perl's numeric `==` (which coerces a non-numeric string
    // operand to 0, making `"b" == "a"` erroneously true), Ruby's `==`
    // never coerces between mismatched types — `"b" == "a"` and
    // `"b" == 0` are both correctly `false` with no operator selection
    // needed. JS `===`/`!==` map straight onto Ruby `==`/`!=`.
    const opMap: Record<string, string> = {
      '===': '==', '!==': '!=', '>': '>', '<': '<', '>=': '>=', '<=': '<=',
      '+': '+', '-': '-', '*': '*', '/': '/',
    }
    return `(${l} ${opMap[op] ?? op} ${r})`
  }

  logical(op: '&&' | '||' | '??', left: ParsedExpr, right: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    const l = emit(left)
    const r = emit(right)
    // JS `&&`/`||` are operand-returning under JS truthiness, which
    // diverges from Ruby's own `&&`/`||` (Ruby only treats nil/false as
    // falsy) — see file docstring. `??` only ever needs a null check, which
    // Ruby and JS agree on.
    if (op === '&&') return `(bf.truthy?(${l}) ? ${r} : ${l})`
    if (op === '||') return `(bf.truthy?(${l}) ? ${l} : ${r})`
    return `((${l}).nil? ? ${r} : ${l})`
  }

  callbackMethod(
    method: string,
    object: ParsedExpr,
    arrow: Extract<ParsedExpr, { kind: 'arrow' }>,
    _restArgs: ParsedExpr[],
    emit: (e: ParsedExpr) => string,
  ): string {
    // Filter context only meaningfully handles the predicate methods
    // (filter / every / some land here through nested `.filter(...)`
    // chains). Sort / reduce / flatMap have no scalar Ruby form here —
    // surface BF101 instead of silently rewriting the predicate.
    if (!PREDICATE_METHODS.has(method)) {
      this.onUnsupported?.(
        `Filter predicate contains a nested '.${method}(...)' callback, which has no Ruby scalar form`,
        `Rewrite the predicate without a nested callback method, or add /* @client */ for client-only evaluation (no SSR).`,
      )
      return 'true'
    }
    // The predicate body is also a filter context, but with this
    // callback's own `param` (potentially shadowing the outer one), so we
    // spin up a nested emitter with the inner param. The outer param/alias
    // become part of "loop-bound outer" for the nested emitter — a real
    // Ruby block nests lexically, so the substitution-free block-param
    // approach composes for free (file docstring simplification 1).
    const param = arrow.params[0]
    const predicate = arrow.body
    const arrayExpr = emit(object)
    const nested = new ErbFilterEmitter(
      param,
      this.localVarMap,
      (n) => n === this.param || this.isLoopBoundOuter(n),
      this.isStringName,
      this.onUnsupported,
    )
    const predBody = emitParsedExpr(predicate, nested)
    const blockParam = rubyLocal(param)
    if (method === 'filter') return `${arrayExpr}.select { |${blockParam}| bf.truthy?(${predBody}) }`
    if (method === 'every') return `${arrayExpr}.all? { |${blockParam}| bf.truthy?(${predBody}) }`
    if (method === 'some') return `${arrayExpr}.any? { |${blockParam}| bf.truthy?(${predBody}) }`
    // `find` / `findIndex` / `findLast` / `findLastIndex` return an element
    // (or index), not a boolean — there is no inline predicate form.
    // Degrading to the receiver silently changes predicate semantics, so be
    // loud.
    this.onUnsupported?.(
      `Filter predicate contains a nested '.${method}(...)' callback, which has no Ruby scalar form`,
      `Rewrite the predicate without a nested callback method, or add /* @client */ for client-only evaluation (no SSR).`,
    )
    return arrayExpr
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

  arrow(_params: string[], _body: ParsedExpr, _emit: (e: ParsedExpr) => string): string {
    // A standalone arrow only reaches here outside a callback position,
    // which never arises in a predicate context — emit the truthy sentinel.
    return 'true'
  }

  regex(_raw: string): string {
    return 'true'
  }

  unsupported(_raw: string, _reason: string): string {
    return 'true'
  }

  objectLiteral(_properties: ObjectLiteralProperty[], _raw: string, _emit: (e: ParsedExpr) => string): string {
    // Filter-predicate context: an object literal is not a boolean leaf, so
    // emit the truthy sentinel exactly as `unsupported` does. Object
    // *values* are lowered to Ruby Hashes in the conditional/attr paths,
    // not here.
    return 'true'
  }
}

/**
 * Lowering for top-level expressions whose identifiers resolve against the
 * ERB template's vars Hash (`v`) — signals, props, module consts — or,
 * inside a loop body, a bare Ruby local. Differs from the filter emitter
 * mainly in:
 *   - `conditional` is supported (filter predicates can't return ternaries),
 *   - templatePrimitive / searchParams / eval-catalogue call dispatch,
 *   - the `unsupported` fallback returns the safe empty-string Ruby literal.
 */
export class ErbTopLevelEmitter implements ParsedExprEmitter {
  constructor(private readonly ctx: ErbEmitContext) {}

  identifier(name: string): string {
    // `undefined` / `null` nested inside a larger expression tree (e.g.
    // `props.isActive ? 'page' : undefined`) — the top-level short-circuits
    // don't see them.
    if (name === 'undefined' || name === 'null') return 'nil'
    // A loop-bound name (this identifier resolves to a bare Ruby local
    // introduced by an enclosing loop, not a vars-Hash entry) takes
    // priority over const inlining — mirrors the Mojo adapter's
    // `loopBoundNames` shadow guard, but here it ALSO decides the
    // fundamental v[:name]-vs-bare-local rendering, not just the const
    // fast path (ERB's two-locals variable model needs this distinction;
    // Perl's uniform `$name` sigil does not — see `ErbEmitContext`).
    if (this.ctx.isLoopBoundName(name)) return rubyLocal(name)
    // Module pure-string const (e.g. `const baseClasses = '...'` used in a
    // className template literal): inline the literal value rather than
    // emit `v[:baseClasses]` against a vars-Hash key that is never seeded.
    const inlined = this.ctx.resolveModuleStringConst(name)
    if (inlined !== null) return inlined
    // Same for a literal const of any scope (`const totalPages = 5`).
    const literalConst = this.ctx.resolveLiteralConst(name)
    if (literalConst !== null) return literalConst
    return `v[${rubySymbolLiteral(name)}]`
  }

  literal(value: string | number | boolean | null, literalType: LiteralType): string {
    if (literalType === 'string') return rubyStringLiteral(String(value))
    if (literalType === 'boolean') return value ? 'true' : 'false'
    if (literalType === 'null') return 'nil'
    return String(value)
  }

  member(object: ParsedExpr, property: string, _computed: boolean, emit: (e: ParsedExpr) => string): string {
    // `props.x` flattens to the `v[:x]` the ERB SSR caller seeds each prop
    // under (props arrive as vars-Hash entries, not a nested `props` Hash).
    if (object.kind === 'identifier' && object.name === 'props') {
      return `v[${rubySymbolLiteral(property)}]`
    }
    // Static property access on a module object-literal const
    // (`variantClasses.ghost`) resolves at compile time — the generic Hash
    // lowering below would read a vars-Hash key that doesn't exist
    // server-side.
    if (object.kind === 'identifier') {
      const staticValue = this.ctx.resolveStaticRecordLiteral(object.name, property)
      if (staticValue !== null) return staticValue
    }
    const obj = emit(object)
    if (property === 'length') return `${obj}.length`
    return `${obj}[${rubySymbolLiteral(property)}]`
  }

  indexAccess(object: ParsedExpr, index: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    return emitIndexAccessRuby(object, index, emit, n => this.ctx._isStringValueName(n))
  }

  call(callee: ParsedExpr, args: ParsedExpr[], emit: (e: ParsedExpr) => string): string {
    // Signal getter: count() → v[:count]
    if (callee.kind === 'identifier' && args.length === 0) {
      return `v[${rubySymbolLiteral(callee.name)}]`
    }
    // Env-signal method call: `searchParams().get('sort')` is a real method
    // call on the per-request search-params reader object (seeded under the
    // reserved `v[:search_params]` key regardless of the local import
    // alias), not the generic Hash-lookup `member` would emit. Matches the
    // local import binding (incl. an alias).
    if (this.ctx._searchParamsLocals.size > 0) {
      const sp = matchSearchParamsMethodCall(callee, args, this.ctx._searchParamsLocals)
      if (sp) {
        return `v[:search_params].${sp.method}(${sp.args.map(emit).join(', ')})`
      }
    }
    // Identifier-path templatePrimitive: `JSON.stringify(x)` /
    // `Math.floor(x)` → `bf.json(v[:x])` / `bf.floor(v[:x])`. Args render
    // recursively through this same emitter so prop refs / signal calls
    // inside them get the standard transforms. A wrong-arity call records
    // BF101 and returns the safe `''` placeholder (never silently emits a
    // bad call).
    const path = identifierPath(callee)
    const spec = path ? ERB_TEMPLATE_PRIMITIVES[path] : undefined
    if (path && spec) {
      if (args.length === spec.arity) {
        return spec.emit(args.map(emit))
      }
      this.ctx._recordExprBF101(
        `templatePrimitive '${path}' expects ${spec.arity} arg(s), got ${args.length}`,
        `Call '${path}' with exactly ${spec.arity} argument(s).`,
      )
      // Don't fall through to the generic `emit(callee)` below — for a
      // member callee (`JSON.stringify`) that emits an invalid Ruby
      // Hash-lookup (`v[:JSON][:stringify]`). Return the same safe
      // empty-string placeholder the other BF101 paths use.
      return "''"
    }
    // Array methods (`.join` and any others added to ArrayMethod) are
    // lifted into the `array-method` IR kind at parse time, so they never
    // reach this dispatcher.
    return emit(callee)
  }

  unary(op: string, argument: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    const arg = emit(argument)
    if (op === '!') return `!bf.truthy?(${arg})`
    if (op === '-') return `-(${arg})`
    return arg
  }

  binary(op: string, left: ParsedExpr, right: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    const l = emit(left)
    const r = emit(right)
    const opMap: Record<string, string> = {
      '===': '==', '!==': '!=', '>': '>', '<': '<', '>=': '>=', '<=': '<=',
      '+': '+', '-': '-', '*': '*',
    }
    return `(${l} ${opMap[op] ?? op} ${r})`
  }

  logical(op: '&&' | '||' | '??', left: ParsedExpr, right: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    const l = emit(left)
    const r = emit(right)
    if (op === '&&') return `(bf.truthy?(${l}) ? ${r} : ${l})`
    if (op === '||') return `(bf.truthy?(${l}) ? ${l} : ${r})`
    return `((${l}).nil? ? ${r} : ${l})`
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

    // sort / toSorted: eval-first, then the structured `bf.sort` fallback
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
    // serializes); BF101 when the body is outside the evaluator surface or
    // the seed isn't a literal.
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

    // Value-producing map: eval-only; BF101 when the projection is outside
    // the surface. (The JSX-returning `.map` is an IRLoop upstream.)
    if (method === 'map') {
      const evalForm = renderMapEval(recv, body, params[0], emit)
      if (evalForm !== null) return evalForm
      this.ctx._recordExprBF101(
        `.map(...) projection is not lowerable to a template map`,
        `Pre-compute the projection in the route handler, or mark the position @client-only.`,
      )
      return "''"
    }

    // Predicate methods: filter / find / every / some / findIndex /
    // findLast / findLastIndex. Eval-first, then the Ruby block / `bf.find*`
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
    // Evaluator path: serialize the predicate body + emit the matching
    // `bf.*_eval` helper (isomorphic with the Go/Perl adapters). Falls back
    // to the inline Ruby-block / `bf.find*` lowering below for a predicate
    // the evaluator can't model (e.g. a method-call predicate).
    const evalFn: Record<string, [string, boolean?]> = {
      filter: ['filter_eval'], every: ['every_eval'], some: ['some_eval'],
      find: ['find_eval', true], findLast: ['find_eval', false],
      findIndex: ['find_index_eval', true], findLastIndex: ['find_index_eval', false],
    }
    // `.filter(Boolean)` (identity predicate `_t => _t`) keeps the inline
    // `.select { |x| bf.truthy?(x) }` form — it composes through the
    // array-method chain (`.filter(Boolean).join(' ')`) and renders
    // identically to a truthiness filter.
    const isIdentity =
      method === 'filter' && predicate.kind === 'identifier' && predicate.name === param
    const spec = evalFn[method]
    if (spec && !isIdentity) {
      const evalForm = renderPredicateEval(spec[0], arrayExpr, predicate, param, emit, spec[1])
      if (evalForm !== null) return evalForm
    }

    const predBody = this.ctx._renderRubyFilterExprPublic(predicate, param)
    const blockParam = rubyLocal(param)
    if (method === 'filter') return `${arrayExpr}.select { |${blockParam}| bf.truthy?(${predBody}) }`
    if (method === 'every') return `${arrayExpr}.all? { |${blockParam}| bf.truthy?(${predBody}) }`
    if (method === 'some') return `${arrayExpr}.any? { |${blockParam}| bf.truthy?(${predBody}) }`
    // `.find` / `.findIndex` / `.findLast` / `.findLastIndex` → the runtime
    // helpers (`bf.find` / `find_index` / `find_last` / `find_last_index`),
    // which call the predicate as a Ruby block per element (Ruby's native
    // callable form — the direct analog of Xslate's Kolon lambda / Perl's
    // coderef). The JS camelCase names map to the snake_case helpers.
    const findHelper: Record<string, string> = {
      find: 'find',
      findIndex: 'find_index',
      findLast: 'find_last',
      findLastIndex: 'find_last_index',
    }
    if (findHelper[method]) {
      return `bf.${findHelper[method]}(${arrayExpr}) { |${blockParam}| bf.truthy?(${predBody}) }`
    }
    return arrayExpr
  }

  arrayLiteral(elements: ParsedExpr[], emit: (e: ParsedExpr) => string): string {
    // Ruby array literal. Identifiers inside elements resolve through the
    // top-level emitter so `[className, childClass]` becomes
    // `[v[:className], v[:childClass]]`. Empty `[]` stays as `[]`.
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
    // JS ternary tests JS truthiness — wrap (see file docstring).
    return `(bf.truthy?(${emit(test)}) ? ${emit(consequent)} : ${emit(alternate)})`
  }

  templateLiteral(parts: TemplatePart[], emit: (e: ParsedExpr) => string): string {
    // `` `n=${count() + 1}` `` → Ruby string concatenation
    // (`'n=' + bf.string(v[:count] + 1)`), NOT string interpolation — a
    // literal chunk could itself contain `#{...}`-shaped text, and every
    // dynamic term needs JS ToString semantics (`bf.string`, not Ruby's
    // own `#{}` / `to_s`, e.g. JS `1.0.toString()` is `"1"`) rather than
    // Ruby's native stringification.
    const terms: string[] = []
    for (const part of parts) {
      if (part.type === 'string') {
        if (part.value !== '') terms.push(rubyStringLiteral(part.value))
      } else {
        terms.push(`bf.string(${emit(part.expr)})`)
      }
    }
    if (terms.length === 0) return "''"
    return terms.join(' + ')
  }

  arrow(_params: string[], _body: ParsedExpr, _emit: (e: ParsedExpr) => string): string {
    // A bare arrow function never stands alone at a render position (it's
    // only meaningful as a callback argument, handled by `callbackMethod`).
    // Return the safe Ruby empty-string literal — consistent with the
    // BF101 / `unsupported` paths — so a stray emit can't produce an
    // `<%= %>` syntax error.
    return "''"
  }

  regex(_raw: string): string {
    return "''"
  }

  unsupported(_raw: string, _reason: string): string {
    // Unreachable in the parse-first flow: `convertExpressionToRuby` gates
    // on `isSupported` before dispatching, and `isSupported` recurses, so a
    // top-level supported expression never contains an `unsupported` node.
    return "''"
  }

  objectLiteral(_properties: ObjectLiteralProperty[], _raw: string, _emit: (e: ParsedExpr) => string): string {
    // Mirror `unsupported`: a bare object literal reaching the dispatcher
    // lowers to the safe Ruby empty-string literal. Object values that
    // round-trip to a Ruby Hash go through the dedicated
    // `objectLiteralToRubyHash` lowering in the conditional/attr paths.
    return "''"
  }
}
