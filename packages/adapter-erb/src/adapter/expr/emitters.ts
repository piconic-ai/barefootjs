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
  arithmeticHelper,
  literalMemberIndex,
  type ParsedExprEmitter,
  type ArrayMethod,
  type LiteralType,
  type ParsedExpr,
  type ObjectLiteralProperty,
  type FlatDepth,
  type TemplatePart,
  emitParsedExpr,
  groupObjectLiteralSegments,
  identifierPath,
  matchSearchParamsMethodCall,
  type LoweringEmitter,
  type LoweringNode,
  queryHrefArgs,
  isValidHelperId,
  lowerCallbackMethod,
  emitCallbackEval,
  nestedCallbackRefusal,
  filterPredicateShapeRefusal,
  isUnloweredCall,
  unloweredCallRefusal,
  type CallbackLoweringOptions,
  type PredicateMethod,
} from '@barefootjs/jsx'

import type { ErbEmitContext } from '../emit-context.ts'
import { ERB_TEMPLATE_PRIMITIVES } from '../lib/constants.ts'
import { rubyLocal, rubyStringLiteral, rubySymbolLiteral, rubySymbolKey } from '../lib/ruby-naming.ts'
import { emitIndexAccessRuby } from './operand.ts'
import {
  renderArrayMethod,
  renderSortMethod,
  renderFlatMethod,
  EVAL_SPELLING,
} from './array-method.ts'

// The display name BF101 uses; a native predicate form exists here.
export const CALLBACK_LOWERING: CallbackLoweringOptions = { adapterName: 'ERB', nativePredicate: true }

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

/**
 * `props.x` on a bare-props-form component flattens to the `v[:x]` the ERB
 * SSR caller seeds each prop under (props arrive as vars-Hash entries, not
 * a nested `props` Hash). Single door for BOTH `member()` emitters below
 * (#2886) — `ErbFilterEmitter` lacked this decision entirely (#2879's
 * cross-adapter follow-up), silently reaching `v[:props][:x]`, which is
 * `nil[...]` at runtime (`NoMethodError`). Returns null for any other
 * receiver so callers fall through to their generic member lowering —
 * `props.a.b` flattens only the inner hop.
 */
function flattenPropsMember(object: ParsedExpr, property: string): string | null {
  if (object.kind === 'identifier' && object.name === 'props') return `v[${rubySymbolLiteral(property)}]`
  return null
}

/**
 * `x.length` through `bf.length` (#2255, UTF-16 code units). An
 * optional-chained `x?.length` yields `nil` — JS's `undefined` — for an
 * absent receiver instead of `bf.length(nil)`'s `0`, so a bare read renders
 * empty and a `??` fallback takes over (#3332).
 */
function optionalLength(receiver: string, optional: boolean): string {
  const read = `bf.length(${receiver})`
  return optional ? `((${receiver}).nil? ? nil : ${read})` : read
}

/**
 * The Ruby block param a nested callback binds `param` as: its own local,
 * unless an enclosing callback param of another name already renders as that
 * local (a loop gate's filter param rendered as the row local `todo`, with a
 * nested callback param named `todo`), which the block param would shadow;
 * then the first of `_bf_<param>`, `_bf2_<param>`, … that none renders as.
 */
function blockLocal(param: string, outerLocals: ReadonlyMap<string, string>): string {
  const taken = (local: string) => [...outerLocals].some(([name, l]) => name !== param && l === local)
  let local = rubyLocal(param)
  for (let n = 1; taken(local); n++) local = n === 1 ? `_bf_${rubyLocal(param)}` : `_bf${n}_${rubyLocal(param)}`
  return local
}

export class ErbFilterEmitter implements ParsedExprEmitter {
  // Plain field declarations + assignment, NOT TS constructor-parameter-
  // property shorthand: Vite's `bundleConfigFile` externalizes any bare
  // (non-relative) import when loading `vite.config.ts` (see
  // `@barefootjs/erb/vite`'s docstring), so this file can be loaded
  // directly by Node's OWN native TypeScript type-stripping (enabled by
  // default since Node 22.18/23.6) rather than esbuild — and Node's
  // strip-only mode does not support parameter properties (`SyntaxError
  // [ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX]`), only plain type annotations.
  private readonly param: string
  private readonly localVarMap: Map<string, string>
  // Whether `name` currently names a bare Ruby local bound by an
  // ENCLOSING loop/block (distinct from `this.param`, which is this
  // predicate's own — possibly nested — loop param). See
  // `ErbEmitContext.isLoopBoundName`'s docstring for why ERB needs this
  // and EP does not.
  private readonly isLoopBoundOuter: (n: string) => boolean
  // Reports whether a getter/prop name is string-typed, for the Hash-vs-
  // Array index-access split (#operand.ts). Defaults to "never" for
  // callers that don't thread it through.
  private readonly isStringName: (n: string) => boolean
  // Records a BF101 for nested callback shapes this emitter can only
  // degrade — `find*` and the non-predicate methods. Optional so emitter
  // construction stays possible without an adapter; a missing hook keeps
  // the old silent-degrade emit.
  private readonly onUnsupported?: (message: string, reason?: string) => void
  // The Ruby local to EMIT for a reference matching `this.param` — as
  // opposed to `this.param` itself, which is only the name to MATCH.
  // These two are the SAME value everywhere in this file except the
  // `filter().map()` loop-gating `<if>` (erb-adapter.ts's `renderLoop`,
  // #2245): `todos.filter(t => t.done).map(todo => ...)` parses the
  // predicate against the filter callback's OWN param (`t`), but the
  // Ruby local actually bound by the loop is the MAP callback's param
  // (`todo`) — Ruby has no per-callback block scope there (unlike the
  // real nested `.select { |t| ... }` block `callbackMethod` below
  // builds, where match and render are naturally the same param).
  // Defaults to `rubyLocal(param)`, i.e. every other construction site is
  // unaffected.
  private readonly renderParamAs: string
  // The Ruby locals an ENCLOSING callback's param renders as, keyed by its
  // JS name. A nested `.some(g => g === t.main)` inside the loop-gating
  // predicate must emit the outer `t` as the loop's bound local (`todo`),
  // the same split `renderParamAs` makes for this emitter's own param
  // (#3542).
  private readonly outerLocals: ReadonlyMap<string, string>

  constructor(
    param: string,
    localVarMap: Map<string, string>,
    isLoopBoundOuter: (n: string) => boolean = () => false,
    isStringName: (n: string) => boolean = unusedIsStringName,
    onUnsupported?: (message: string, reason?: string) => void,
    renderParamAs: string = rubyLocal(param),
    outerLocals: ReadonlyMap<string, string> = new Map(),
  ) {
    this.param = param
    this.localVarMap = localVarMap
    this.isLoopBoundOuter = isLoopBoundOuter
    this.isStringName = isStringName
    this.onUnsupported = onUnsupported
    this.renderParamAs = renderParamAs
    this.outerLocals = outerLocals
  }

  identifier(name: string): string {
    if (name === this.param) return this.renderParamAs
    const outerLocal = this.outerLocals.get(name)
    if (outerLocal) return outerLocal
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

  member(object: ParsedExpr, property: string, computed: boolean, optional: boolean, emit: (e: ParsedExpr) => string): string {
    const flat = flattenPropsMember(object, property)
    if (flat !== null) return flat
    // `.length` needs no special higher-order form here — see the file
    // docstring's simplification (2): `.select { ... }.length` just works
    // in Ruby, unlike Perl's anonymous-arrayref `scalar(@{...})` detour.
    // Routed through `bf.length` (not the native `.length` method) because
    // Ruby's `String#length` counts Unicode codepoints, not JS's UTF-16
    // code units (#2255) — array `.length` is unaffected either way, so
    // this stays one call site for both receiver shapes.
    if (property === 'length') return optionalLength(emit(object), optional)
    // A `?.`-written access (`user?.name`, #2168 optional-chaining-prop):
    // Ruby's own `nil[:key]` raises `NoMethodError` (unlike Hash#[] on a
    // present Hash) — `&.` is Ruby's native safe-navigation operator, and
    // `&.[](...)` is its explicit-method form for indexing rather than a
    // dotted method call. Only guards the single written `?.` hop, not a
    // JS-style whole-chain short-circuit — see the `ParsedExpr` `member`
    // variant's docstring for the multi-hop caveat.
    if (computed) return this.indexAccess(object, literalMemberIndex(property), emit)
    if (optional) return `${emit(object)}&.[](${rubySymbolLiteral(property)})`
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
    // `/` and `%` go through the runtime's JS division and remainder
    // (#3474): Ruby `/` on two Integers truncates (#3328), and Ruby `%`
    // floors (#3574).
    const helper = arithmeticHelper(op)
    if (helper) return `bf.${helper}(${l}, ${r})`
    const opMap: Record<string, string> = {
      '===': '==', '!==': '!=', '>': '>', '<': '<', '>=': '>=', '<=': '<=',
      '+': '+', '-': '-', '*': '*',
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
      const refusal = nestedCallbackRefusal(method, CALLBACK_LOWERING.adapterName)
      this.onUnsupported?.(refusal.message, refusal.suggestion)
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
    const outerLocals = new Map([...this.outerLocals, [this.param, this.renderParamAs]])
    const blockParam = blockLocal(param, outerLocals)
    const nested = new ErbFilterEmitter(
      param,
      this.localVarMap,
      (n) => n === this.param || this.isLoopBoundOuter(n),
      this.isStringName,
      this.onUnsupported,
      blockParam,
      outerLocals,
    )
    const predBody = emitParsedExpr(predicate, nested)
    if (method === 'filter') return `${arrayExpr}.select { |${blockParam}| bf.truthy?(${predBody}) }`
    if (method === 'every') return `${arrayExpr}.all? { |${blockParam}| bf.truthy?(${predBody}) }`
    if (method === 'some') return `${arrayExpr}.any? { |${blockParam}| bf.truthy?(${predBody}) }`
    // `find` / `findIndex` / `findLast` / `findLastIndex` return an element
    // (or index), not a boolean — there is no inline predicate form.
    // Degrading to the receiver silently changes predicate semantics, so be
    // loud.
    const refusal = nestedCallbackRefusal(method, CALLBACK_LOWERING.adapterName)
    this.onUnsupported?.(refusal.message, refusal.suggestion)
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

  flatMethod(
    object: ParsedExpr,
    depth: FlatDepth | { expr: ParsedExpr },
    emit: (e: ParsedExpr) => string,
  ): string {
    return renderFlatMethod(emit(object), depth, emit)
  }

  conditional(_test: ParsedExpr, _consequent: ParsedExpr, _alternate: ParsedExpr): string {
    return this.refuseShape('a conditional (`?:`)')
  }

  templateLiteral(_parts: TemplatePart[]): string {
    return this.refuseShape('a template literal')
  }

  arrow(_params: string[], _body: ParsedExpr, _emit: (e: ParsedExpr) => string): string {
    return this.refuseShape('a standalone arrow function')
  }

  regex(_raw: string): string {
    return this.refuseShape('a regular expression literal')
  }

  unsupported(_raw: string, reason: string): string {
    return this.refuseShape(`an expression with no template form (${reason})`)
  }

  objectLiteral(_properties: ObjectLiteralProperty[], _raw: string, _emit: (e: ParsedExpr) => string): string {
    return this.refuseShape('an object literal')
  }

  /**
   * A predicate shape this emitter cannot spell is BF101, never a truthy
   * constant standing in for it (#3534): that rendered every row.
   */
  private refuseShape(shape: string): string {
    const refusal = filterPredicateShapeRefusal(shape, CALLBACK_LOWERING.adapterName)
    this.onUnsupported?.(refusal.message, refusal.suggestion)
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
  // Plain field + assignment, not a parameter property — see
  // `ErbFilterEmitter`'s constructor comment above for why.
  private readonly ctx: ErbEmitContext

  constructor(ctx: ErbEmitContext) {
    this.ctx = ctx
  }

  /**
   * Registered-lowering seam (#2843): `emitParsedExpr`'s shared `call` case
   * tries every matcher here BEFORE `call()` itself, so a registered call
   * (the built-in `queryHref`, or any userland plugin) is recognised no
   * matter where it sits in the tree. `render` is what used to live inline
   * in `ErbAdapter.convertExpressionToRuby` before the object-literal
   * support-gate refusal (`checkSupport`'s `call` arm, now itself
   * registry-aware) made the pre-gate special case unnecessary.
   */
  get lowering(): LoweringEmitter {
    return {
      matchers: this.ctx._loweringMatchers,
      render: (node: LoweringNode, emit: (e: ParsedExpr) => string): string | null => {
        // `query` guard-list — `queryHref`-shaped.
        if (node.kind === 'guard-list' && node.helper === 'query') {
          const qArgs = queryHrefArgs(node, emit)
          return `bf.query(${qArgs.join(', ')})`
        }
        // Generic `helper-call` (#2069) — a userland `LoweringPlugin`'s
        // single runtime-helper invocation; `bf.<helper>(args…)` mirrors
        // the `query` helper's own naming convention.
        if (node.kind === 'helper-call' && isValidHelperId(node.helper)) {
          return `bf.${node.helper}(${node.args.map(emit).join(', ')})`
        }
        return null
      },
    }
  }

  identifier(name: string): string {
    // `undefined` / `null` nested inside a larger expression tree (e.g.
    // `props.isActive ? 'page' : undefined`) — the top-level short-circuits
    // don't see them.
    if (name === 'undefined' || name === 'null') return 'nil'
    // A loop-bound name (this identifier resolves to a bare Ruby local
    // introduced by an enclosing loop, not a vars-Hash entry) takes
    // priority over const inlining — mirrors the Mojo adapter's threaded
    // scope shadow guard, but here it ALSO decides the fundamental
    // v[:name]-vs-bare-local rendering, not just the const fast path
    // (ERB's two-locals variable model needs this distinction; Perl's
    // uniform `$name` sigil does not — see `ErbEmitContext`).
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

  member(object: ParsedExpr, property: string, computed: boolean, optional: boolean, emit: (e: ParsedExpr) => string): string {
    const flat = flattenPropsMember(object, property)
    if (flat !== null) return flat
    // Static property access on a module object-literal const
    // (`variantClasses.ghost`) resolves at compile time — the generic Hash
    // lowering below would read a vars-Hash key that doesn't exist
    // server-side.
    if (object.kind === 'identifier') {
      const staticValue = this.ctx.resolveStaticRecordLiteral(object.name, property)
      if (staticValue !== null) return staticValue
    }
    const obj = emit(object)
    // Routed through `bf.length`, not native `.length` — see
    // `ErbFilterEmitter.member()`'s comment above (#2255, UTF-16 code
    // units vs. Ruby's codepoint-counting `String#length`).
    if (property === 'length') return optionalLength(obj, optional)
    // A `?.`-written access (`user?.name`, #2168 optional-chaining-prop):
    // see `ErbFilterEmitter.member()`'s comment above for why `&.[](...)`
    // (not a dotted `&.name`) is the right safe-nav form for a Hash-keyed
    // prop, and for the single-hop caveat.
    if (computed) return this.indexAccess(object, literalMemberIndex(property), emit)
    if (optional) return `${obj}&.[](${rubySymbolLiteral(property)})`
    return `${obj}[${rubySymbolLiteral(property)}]`
  }

  indexAccess(object: ParsedExpr, index: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    return emitIndexAccessRuby(object, index, emit, n => this.ctx._isStringValueName(n))
  }

  call(callee: ParsedExpr, args: ParsedExpr[], emit: (e: ParsedExpr) => string): string {
    // #3144: a zero-arg call to a component-body local bound to an
    // opaque call (`const label = makeLabel(); {label()}`) is NOT a
    // signal getter -- checked before the signal-getter branch below,
    // which would otherwise treat it as one and emit an unbound name.
    if (callee.kind === 'identifier' && args.length === 0 && this.ctx._isOpaqueLocalAccessorCall(callee.name)) {
      this.ctx._recordExprBF101(
        `Call to '${callee.name}(...)' has no ERB template lowering — '${callee.name}' is a local bound to an opaque call (not a signal/memo getter), so there is no ERB binding for its result in template scope.`,
        `The reference adapter runs '${callee.name}()' at render time. Add /* @client */ to defer this read to the client, or pre-compute the value in the backend.`,
      )
      return "''"
    }
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
    // #2994: any other identifier callee reaching here is a call to an
    // arbitrary JS function by bare name — a module-scope `function`/arrow
    // `const` helper being the repro shape, but the same reasoning covers
    // any other unregistered callee (a destructured prop-valued callback,
    // …). Zero-arg calls already returned above as signal getters, so this
    // is always a call WITH args. Falling through to `emit(callee)` used to
    // silently resolve the bare name against the vars-Hash (nil → renders
    // empty) and drop every argument — no Ruby binding for an arbitrary JS
    // closure reference exists, whether it resolves at runtime or not.
    //
    // No `_boolContext`-style structural exemption here (#3012): scoping
    // the exemption by "is this call's value only consumed for
    // truthiness?" rather than by callee identity let ANY OTHER helper
    // called from a condition/ternary test keep the pre-#2994 broken
    // fallback silently. `isValidElement` — the one caller that
    // legitimately needs to keep working under the degraded fallback
    // (`ui/components/ui/slot`'s `asChild` guard) — is now resolved above
    // as an identity-scoped `templatePrimitive` (`bf.is_element`, backed
    // by the Ruby port of the shared BarefootJS runtime's shape-check
    // method), so it never reaches this branch at all. Every other
    // bare-name call refuses here unconditionally, in a boolean-test
    // position or not.
    if (callee.kind === 'identifier') {
      this.ctx._recordExprBF101(
        `Call to '${callee.name}(...)' has no ERB template lowering — '${callee.name}' is not a signal getter, a registered template primitive, or a recognised lowering call, so there is no Ruby binding for it in template scope.`,
        `A bare-name call to a module-scope helper (or any other JS-only function reference) only exists in the real JS runtime (Hono SSR / CSR) — ERB has no way to invoke it.`,
      )
      return "''"
    }
    // A method outside the catalogue (`s().localeCompare(q)`) has no
    // lowering; read as its callee, the call and its arguments would vanish
    // (#3493). A getter or function-valued prop keeps the callee read.
    if (isUnloweredCall(callee, args, this.ctx._propsObjectName, this.ctx._isGlobalName)) {
      const refusal = unloweredCallRefusal(callee, args, CALLBACK_LOWERING.adapterName)
      this.ctx._recordExprBF101(refusal.message, refusal.suggestion)
      return "''"
    }
    return emit(callee)
  }

  unary(op: string, argument: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    const arg = emit(argument)
    if (op === '!') return `!bf.truthy?(${arg})`
    // Unary minus applies JS `ToNumber` like binary `-` (#3533).
    if (op === '-') return `-(${this.coerceNullishOperand(op, argument, undefined, arg)})`
    return arg
  }

  /** Spell `arithmeticOperandCoercion` (#3474): a `null` operand reads as
   * `0`, as JS `ToNumber(null)` does (#3350); an `undefined` one as `NaN`, as
   * `ToNumber(undefined)` does (#3390). */
  private coerceNullishOperand(op: string, expr: ParsedExpr, other: ParsedExpr | undefined, operand: string): string {
    const coercion = this.ctx._arithmeticCoercion(op, expr, other)
    if (coercion === 'undefined') return `bf.number(${operand})`
    return coercion === 'null' ? `(${operand} || 0)` : operand
  }

  binary(op: string, left: ParsedExpr, right: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    const l = this.coerceNullishOperand(op, left, right, emit(left))
    const r = this.coerceNullishOperand(op, right, left, emit(right))
    // `/` and `%` go through the runtime's JS division and remainder
    // (#3474): Ruby `/` on two Integers truncates (#3328), and Ruby `%`
    // floors (#3574).
    const helper = arithmeticHelper(op)
    if (helper) return `bf.${helper}(${l}, ${r})`
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
    // The shared chain (`@barefootjs/jsx`'s `adapters/callback-method.ts`)
    // decides; this emitter only spells the result.
    const recv = emit(object)
    const plan = lowerCallbackMethod(method, arrow, restArgs, CALLBACK_LOWERING)
    switch (plan.kind) {
      case 'eval':
        return emitCallbackEval(plan, recv, emit, EVAL_SPELLING)
      case 'structured-sort':
        return renderSortMethod(recv, plan.comparator)
      case 'native-predicate':
        return this._nativePredicate(plan.method, plan.param, plan.predicate, recv)
      case 'refuse':
        this.ctx._recordExprBF101(plan.message, plan.suggestion)
        return "''"
      default:
        // Unreachable: a method outside `CALLBACK_METHODS`.
        return recv
    }
  }

  /**
   * The native form of a predicate: a Ruby block, through `.select` /
   * `.all?` / `.any?` for `filter` / `every` / `some` and the runtime's
   * `bf.find*` helpers otherwise. The shared chain picks it for a predicate
   * the evaluator can't model (a method-call predicate) and for the identity
   * `.filter(x => x)`, which composes through the array-method chain.
   */
  private _nativePredicate(method: PredicateMethod, param: string, predicate: ParsedExpr, arrayExpr: string): string {
    const predBody = this.ctx._renderRubyFilterExprPublic(predicate, param)
    const block = `{ |${rubyLocal(param)}| bf.truthy?(${predBody}) }`
    if (method === 'filter') return `${arrayExpr}.select ${block}`
    if (method === 'every') return `${arrayExpr}.all? ${block}`
    if (method === 'some') return `${arrayExpr}.any? ${block}`
    const findHelper = { find: 'find', findIndex: 'find_index', findLast: 'find_last', findLastIndex: 'find_last_index' }
    return `bf.${findHelper[method]}(${arrayExpr}) ${block}`
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

  objectLiteral(properties: ObjectLiteralProperty[], _raw: string, emit: (e: ParsedExpr) => string): string {
    // Reachable here in VALUE position (a `.map()` receiver/callback body, an
    // array-literal element, …) since `isSupportedValue` admits an object
    // literal whose every property value is itself supported
    // (expression-parser.ts, `checkSupport`'s `pos` parameter). Emit a Ruby
    // Hash literal, keyed the same way `objectLiteralToRubyHash` quotes the
    // spread-path literal.
    if (properties.length === 0) return '{}'
    const literalOf = (run: readonly Extract<ObjectLiteralProperty, { kind: 'prop' }>[]) =>
      `{ ${run.map(p => `${rubySymbolKey(p.key)} ${emit(p.value)}`).join(', ')} }`
    if (!properties.some(p => p.kind === 'spread')) {
      return literalOf(properties as Extract<ObjectLiteralProperty, { kind: 'prop' }>[])
    }
    // Spread (`{ ...t, editing: false }`, #2696 Step 2): `Hash#merge` has
    // accepted multiple hash arguments since Ruby 2.6 (this gem requires
    // >= 3.1), overriding left-to-right — exactly JS spread's semantics.
    // Starting from a fresh `{}` (rather than the first segment) means the
    // fold works uniformly whether the FIRST entry is a `prop` run or a
    // `spread` — no special-casing which segment is the merge "receiver".
    const segments = groupObjectLiteralSegments(properties, literalOf, emit)
    return `{}.merge(${segments.join(', ')})`
  }
}
