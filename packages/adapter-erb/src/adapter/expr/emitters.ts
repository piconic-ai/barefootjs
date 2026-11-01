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
  isStringConcatBinary,
  isStringTypedOperand,
  literalMemberIndex,
  type ParsedExprEmitter,
  type PrimitivePlan,
  type PrimitiveInputs,
  type NativeSafeTable,
  type OperandTyping,
  primitivesAt,
  planTest,
  spellTest,
  EMPTY_OPERAND_TYPING,
  BindingScope,
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
  isRootPropsObject,
  propsObjectIdentifier,
  unloweredCallRefusal,
  type CallbackLoweringOptions,
  type PredicateMethod,
  type StringNameTest,
  type NamedTypeFields,
  isNativePlan,
  relationalHelper,
  isNativeToNumber,
  numberLiteralSpelling,
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

/**
 * The (op, proof) pairs this adapter spells with its native operator
 * (`spec/js-primitive-semantics.md`; the plan's `NativeSafeTable`). Step 0
 * of #3824: filled so the plans describe today's output, not yet narrowed to
 * what the `primitives/` vectors pin. `primitive-plan-cross-adapter.test.ts`
 * holds every emission to it, with the positions that still decide on their
 * own listed there.
 */
export const NATIVE_SAFE: NativeSafeTable = {
  'to-boolean': [],
  // A unary `+` is native only over a proven number, `to_number` otherwise
  // (#3824 step 3). `unproven` describes binary `-` / `*` over operands Phase 1
  // cannot type, which keep the native operator until step 4.
  'to-number': ['number-pair', 'number', 'unproven'],
  plus: ['number-pair', 'string', 'unproven'],
  'strict-eq': ['number-pair', 'string-pair', 'boolean-pair', 'unproven'],
  // Native only over two proven numbers; any other pair takes the runtime's
  // JS Abstract Relational Comparison (`lt` / `le` / `gt` / `ge`; #3824
  // step 3, pinned by the `primitives/lt` … `ge` vectors).
  relational: ['number-pair'],
  // A unary minus over a non-zero literal folds into the literal; any other
  // operand takes `neg`, which keeps the sign of zero. A literal is native
  // only as a safe integer; `number('<JS spelling>')` otherwise, and `-0` is
  // `neg(0)` (#3824 step 6, pinned by the `primitives/number` vectors).
  neg: [],
  'number-literal': ['safe-integer'],
  nullish: ['non-nil', 'unproven'],
  get: [],
  // A comparison, `!` and a boolean literal are host booleans already (#3824 step 5).
  'boolean-value': ['boolean'],
}

/**
 * Spell the ToBoolean plan of a test position (#3824 step 1): the rendered
 * test as is when the plan is native, `bf.truthy?(...)` otherwise. Ruby's own
 * truthiness (only `nil` / `false` are falsy) agrees with JS on no other
 * value, and `NATIVE_SAFE['to-boolean']` claims no proof, so every plan is
 * the helper today. The `!`, `&&`, `||` and `?:` emitters receive the plan
 * from `emitParsedExpr`; the adapter's IR-level conditions and the predicate
 * blocks compute it with `planTest`.
 */
export function truthyTest(plan: PrimitivePlan | null, rendered: string): string {
  return spellTest(plan, rendered, (r) => `bf.truthy?(${r})`)
}

/**
 * JS `l && r` / `l || r` in a value position, which yield one of their
 * operands (#3824). When the plan proves `l` a boolean, Ruby's own `&&` / `||` (which return an operand, as JS does, and agree with JS on a boolean `l`). Otherwise `l` is boxed by its JS test:
 * `keep_truthy(l)` is the one-element array `[l]` when `l` is JS-truthy and
 * `nil` otherwise, `keep_falsy(l)` the reverse, so Ruby's `||` stops at `l`'s box
 * exactly when JS returns `l` itself and builds `[r]` only otherwise (the
 * short circuit); `[0]` unboxes the operand. Each operand is rendered once,
 * so a chain `a || b || c …` grows linearly.
 */
function spellLogical(op: '&&' | '||', plan: PrimitivePlan | null, l: string, r: string): string {
  if (truthyTest(plan, l) === l) return `(${l} ${op} ${r})`
  const keep = op === '&&' ? 'keep_falsy' : 'keep_truthy'
  return `(bf.${keep}(${l}) || [${r}])[0]`
}

// Predicate-shaped higher-order methods (filter/every/some land here through
// nested `.filter(...)` chains). Module-level so `callbackMethod`, which runs
// for many nodes during template generation, reuses one set per process.
const PREDICATE_METHODS: ReadonlySet<string> = new Set([
  'filter', 'find', 'findIndex', 'findLast', 'findLastIndex', 'every', 'some',
])

/**
 * String typing at a filter predicate's position: the binding scope there
 * (the predicate's own param and every enclosing row and callback) and the
 * component's string-valued names. A nested callback enters its param on
 * `scope`, so a param named like a string prop is typed as the param.
 */
export interface ErbStringTyping {
  readonly scope: BindingScope
  readonly isStringValueName: (name: string) => boolean
  /** A named row type's fields, for a row field read (`row.id`). */
  readonly namedFields?: NamedTypeFields
}

const NO_STRING_TYPING: ErbStringTyping = { scope: BindingScope.EMPTY, isStringValueName: () => false }

/**
 * One operand of a `+` the shared layer classified as string concatenation
 * (`isStringConcatBinary`). Ruby's `+` raises on a String plus a number
 * (`no implicit conversion of Integer into String`), so an operand the shared
 * `isStringTypedOperand` does not type as a string goes through the
 * runtime's JS `String()` first: `r.id + '-' + i` is `"x-0"`, and
 * `'r=' + (-4 % 2)` is `"r=0"`.
 */
function concatOperand(
  operand: ParsedExpr,
  emitted: string,
  isStringName: StringNameTest,
): string {
  return isStringTypedOperand(operand, isStringName) ? emitted : `bf.string(${emitted})`
}

/**
 * `props.x` on a bare-props-form component flattens to the `v[:x]` the ERB
 * SSR caller seeds each prop under (props arrive as vars-Hash entries, not
 * a nested `props` Hash). Single door for BOTH `member()` emitters below
 * (#2886) — `ErbFilterEmitter` lacked this decision entirely (#2879's
 * cross-adapter follow-up), silently reaching `v[:props][:x]`, which is
 * `nil[...]` at runtime (`NoMethodError`). Returns null for any other
 * receiver, including a `props` a binding shadows (`isBound`, #3693), so
 * callers fall through to their generic member lowering — `props.a.b`
 * flattens only the inner hop.
 */
function flattenPropsMember(
  object: ParsedExpr,
  property: string,
  isBound: (name: string) => boolean,
  propsObject: string,
): string | null {
  if (isRootPropsObject(object, isBound, propsObject)) return `v[${rubySymbolLiteral(property)}]`
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
  // The component's operand typing and the predicate's scope, which the
  // primitive plans read (#3824); untyped until the adapter calls `typedBy`.
  private operandTyping: OperandTyping = EMPTY_OPERAND_TYPING
  private operandScope: BindingScope = BindingScope.EMPTY

  get primitives(): PrimitiveInputs {
    return primitivesAt(this.operandTyping, this.operandScope, NATIVE_SAFE)
  }

  /** Type this predicate's operands with the component's `typing` at the predicate's `scope`. */
  typedBy(typing: OperandTyping, scope: BindingScope): this {
    this.operandTyping = typing
    this.operandScope = scope
    return this
  }

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
  // Whether a getter/prop name is string-typed here, for the Hash-vs-Array
  // index-access split (#operand.ts) and `+` string concatenation.
  // Defaults to "never" for callers that don't thread it through.
  private readonly stringTyping: ErbStringTyping
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
    stringTyping: ErbStringTyping = NO_STRING_TYPING,
    onUnsupported?: (message: string, reason?: string) => void,
    renderParamAs: string = rubyLocal(param),
    outerLocals: ReadonlyMap<string, string> = new Map(),
  ) {
    this.param = param
    this.localVarMap = localVarMap
    this.isLoopBoundOuter = isLoopBoundOuter
    this.stringTyping = stringTyping
    this.onUnsupported = onUnsupported
    this.renderParamAs = renderParamAs
    this.outerLocals = outerLocals
  }

  private readonly isStringName: StringNameTest = (n, componentProperty, path) =>
    this.stringTyping.scope.isStringValueName(n, this.stringTyping.isStringValueName, componentProperty, path, this.stringTyping.namedFields)

  identifier(name: string): string {
    if (name === this.param) return this.renderParamAs
    const outerLocal = this.outerLocals.get(name)
    if (outerLocal) return outerLocal
    const signal = this.localVarMap.get(name)
    if (signal) return `v[${rubySymbolLiteral(signal)}]`
    if (this.isLoopBoundOuter(name)) return rubyLocal(name)
    return `v[${rubySymbolLiteral(name)}]`
  }

  literal(value: string | number | boolean | null, literalType: LiteralType, plan: PrimitivePlan | null): string {
    if (literalType === 'string') return rubyStringLiteral(String(value))
    if (literalType === 'boolean') return value ? 'true' : 'false'
    if (literalType === 'null') return 'nil'
    return numberLiteral(value, plan)
  }

  member(object: ParsedExpr, property: string, computed: boolean, optional: boolean, emit: (e: ParsedExpr) => string, _plan: PrimitivePlan | null): string {
    // This predicate's own param, an enclosing callback's or an enclosing
    // loop row's binding spelled `props` is that binding (#3693).
    const flat = flattenPropsMember(
      object,
      property,
      n => n === this.param || this.outerLocals.has(n) || this.isLoopBoundOuter(n),
      this.stringTyping.scope.propsObject,
    )
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
    if (computed) return this.indexAccess(object, literalMemberIndex(property), emit, _plan)
    if (optional) return `${emit(object)}&.[](${rubySymbolLiteral(property)})`
    return `${emit(object)}[${rubySymbolLiteral(property)}]`
  }

  indexAccess(object: ParsedExpr, index: ParsedExpr, emit: (e: ParsedExpr) => string, _plan: PrimitivePlan | null): string {
    return emitIndexAccessRuby(object, index, emit, this.isStringName)
  }

  call(callee: ParsedExpr, args: ParsedExpr[], emit: (e: ParsedExpr) => string): string {
    // Signal getter calls: filter() → v[:filter]
    if (callee.kind === 'identifier' && args.length === 0) {
      return `v[${rubySymbolLiteral(callee.name)}]`
    }
    return emit(callee)
  }

  unary(op: string, argument: ParsedExpr, emit: (e: ParsedExpr) => string, plan: PrimitivePlan | null): string {
    const arg = emit(argument)
    // JS `!x` tests JS truthiness, not Ruby's — wrap. See file docstring.
    if (op === '!') return `!${truthyTest(plan, arg)}`
    if (op === '-') return negate(plan, arg, () => `-(${arg})`)
    return toNumber(plan, arg)
  }

  binary(op: string, left: ParsedExpr, right: ParsedExpr, emit: (e: ParsedExpr) => string, plan: PrimitivePlan | null): string {
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
    // JS `+` with a string-typed operand is concatenation; Ruby's `+` raises
    // on a String plus a number, so the other operand goes through
    // `bf.string`.
    if (isStringConcatBinary(op, left, right, this.isStringName)) {
      return `(${concatOperand(left, l, this.isStringName)} + ${concatOperand(right, r, this.isStringName)})`
    }
    // `<` `<=` `>` `>=`: native only over two proven numbers, the runtime's
    // JS Abstract Relational Comparison otherwise (#3824 step 3).
    const relational = relationalHelper(op, plan)
    if (relational) return `bf.${relational}(${l}, ${r})`
    const opMap: Record<string, string> = {
      '===': '==', '!==': '!=', '>': '>', '<': '<', '>=': '>=', '<=': '<=',
      '+': '+', '-': '-', '*': '*',
    }
    return `(${l} ${opMap[op] ?? op} ${r})`
  }

  logical(op: '&&' | '||' | '??', left: ParsedExpr, right: ParsedExpr, emit: (e: ParsedExpr) => string, plan: PrimitivePlan | null): string {
    const l = emit(left)
    const r = emit(right)
    // JS `&&`/`||` are operand-returning under JS truthiness, which
    // diverges from Ruby's own `&&`/`||` (Ruby only treats nil/false as
    // falsy) — see file docstring. `??` only ever needs a null check, which
    // Ruby and JS agree on.
    if (op !== '??') return spellLogical(op, plan, l, r)
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
      { ...this.stringTyping, scope: this.stringTyping.scope.enterCallback([param]) },
      this.onUnsupported,
      blockParam,
      outerLocals,
    ).typedBy(this.operandTyping, this.operandScope.enterCallback([param]))
    const predTest = truthyTest(planTest(predicate, this.operandTyping.at(this.operandScope.enterCallback([param])), NATIVE_SAFE), emitParsedExpr(predicate, nested))
    if (method === 'filter') return `${arrayExpr}.select { |${blockParam}| ${predTest} }`
    if (method === 'every') return `${arrayExpr}.all? { |${blockParam}| ${predTest} }`
    if (method === 'some') return `${arrayExpr}.any? { |${blockParam}| ${predTest} }`
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

  conditional(_test: ParsedExpr, _consequent: ParsedExpr, _alternate: ParsedExpr, _emit: (e: ParsedExpr) => string, _plan: PrimitivePlan | null): string {
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
  readonly primitives: PrimitiveInputs
  // Plain field + assignment, not a parameter property — see
  // `ErbFilterEmitter`'s constructor comment above for why.
  private readonly ctx: ErbEmitContext

  constructor(ctx: ErbEmitContext) {
    this.ctx = ctx
    this.primitives = { typing: () => ctx._operandTyping(), nativeSafe: NATIVE_SAFE }
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

  literal(value: string | number | boolean | null, literalType: LiteralType, plan: PrimitivePlan | null): string {
    if (literalType === 'string') return rubyStringLiteral(String(value))
    if (literalType === 'boolean') return value ? 'true' : 'false'
    if (literalType === 'null') return 'nil'
    return numberLiteral(value, plan)
  }

  member(object: ParsedExpr, property: string, computed: boolean, optional: boolean, emit: (e: ParsedExpr) => string, _plan: PrimitivePlan | null): string {
    const flat = flattenPropsMember(object, property, n => this.ctx.isLoopBoundName(n), propsObjectIdentifier(this.ctx._propsObjectName))
    if (flat !== null) return flat
    // Static property access on a module object-literal const
    // (`variantClasses.ghost`) resolves at compile time — the generic Hash
    // lowering below would read a vars-Hash key that doesn't exist
    // server-side.
    if (object.kind === 'identifier') {
      const element = this.ctx.staticArrayElement(object.name, property)
      if (element !== null) return emit(element)
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
    if (computed) return this.indexAccess(object, literalMemberIndex(property), emit, _plan)
    if (optional) return `${obj}&.[](${rubySymbolLiteral(property)})`
    return `${obj}[${rubySymbolLiteral(property)}]`
  }

  indexAccess(object: ParsedExpr, index: ParsedExpr, emit: (e: ParsedExpr) => string, _plan: PrimitivePlan | null): string {
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

  unary(op: string, argument: ParsedExpr, emit: (e: ParsedExpr) => string, plan: PrimitivePlan | null): string {
    const arg = emit(argument)
    if (op === '!') return `!${truthyTest(plan, arg)}`
    // Unary minus applies JS `ToNumber` like binary `-` (#3533).
    if (op === '-') {
      const operand = this.coerceNullishOperand(op, argument, undefined, arg)
      return negate(plan, operand, () => `-(${operand})`)
    }
    // Unary plus applies JS `ToNumber` too (#3824 step 3).
    return toNumber(plan, this.coerceNullishOperand(op, argument, undefined, arg))
  }

  /** Spell `arithmeticOperandCoercion` (#3474): a `null` operand reads as
   * `0`, as JS `ToNumber(null)` does (#3350); an `undefined` one as `NaN`, as
   * `ToNumber(undefined)` does (#3390).
   * A string or boolean relational operand that may only be absent
   * (`'undefined-keep'`, #3824 step 3) reads a nil as `NaN` and keeps a
   * present value, which the relational helper converts itself.
   */
  private coerceNullishOperand(op: string, expr: ParsedExpr, other: ParsedExpr | undefined, operand: string): string {
    const coercion = this.ctx._arithmeticCoercion(op, expr, other)
    if (coercion === 'undefined') return `bf.number(${operand})`
    if (coercion === 'undefined-keep') return `((${operand}).nil? ? Float::NAN : ${operand})`
    return coercion === 'null' ? `(${operand} || 0)` : operand
  }

  binary(op: string, left: ParsedExpr, right: ParsedExpr, emit: (e: ParsedExpr) => string, plan: PrimitivePlan | null): string {
    const l = this.coerceNullishOperand(op, left, right, emit(left))
    const r = this.coerceNullishOperand(op, right, left, emit(right))
    // `/` and `%` go through the runtime's JS division and remainder
    // (#3474): Ruby `/` on two Integers truncates (#3328), and Ruby `%`
    // floors (#3574).
    const helper = arithmeticHelper(op)
    if (helper) return `bf.${helper}(${l}, ${r})`
    // JS `+` with a string-typed operand is concatenation; Ruby's `+` raises
    // on a String plus a number, so the other operand goes through
    // `bf.string`.
    const isStringName = (n: string, property?: boolean, path?: readonly string[]) => this.ctx._isStringValueName(n, property, path)
    if (isStringConcatBinary(op, left, right, isStringName)) {
      return `(${concatOperand(left, l, isStringName)} + ${concatOperand(right, r, isStringName)})`
    }
    // `<` `<=` `>` `>=`: native only over two proven numbers, the runtime's
    // JS Abstract Relational Comparison otherwise (#3824 step 3).
    const relational = relationalHelper(op, plan)
    if (relational) return `bf.${relational}(${l}, ${r})`
    const opMap: Record<string, string> = {
      '===': '==', '!==': '!=', '>': '>', '<': '<', '>=': '>=', '<=': '<=',
      '+': '+', '-': '-', '*': '*',
    }
    return `(${l} ${opMap[op] ?? op} ${r})`
  }

  logical(op: '&&' | '||' | '??', left: ParsedExpr, right: ParsedExpr, emit: (e: ParsedExpr) => string, plan: PrimitivePlan | null): string {
    const l = emit(left)
    const r = emit(right)
    // JS `&&` / `||` yield an operand, each rendered once (`spellLogical`).
    if (op !== '??') return spellLogical(op, plan, l, r)
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
    const plan = lowerCallbackMethod(method, arrow, restArgs, CALLBACK_LOWERING, propsObjectIdentifier(this.ctx._propsObjectName))
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
    const block = `{ |${rubyLocal(param)}| ${this.ctx._renderRubyFilterTestPublic(predicate, param)} }`
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
    plan: PrimitivePlan | null,
  ): string {
    // JS ternary tests JS truthiness — wrap (see file docstring).
    return `(${truthyTest(plan, emit(test))} ? ${emit(consequent)} : ${emit(alternate)})`
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

/**
 * Spell a number literal's plan (#3824 step 6): a safe integer as itself,
 * any other literal through the runtime's `number` over its JS spelling
 * (`1e+21`, `1e-7`, `0.1`), and `-0` as `neg(0)`.
 */
export function numberLiteral(value: string | number | boolean | null, plan: PrimitivePlan | null): string {
  if (typeof value !== 'number') return String(value)
  const spelled = numberLiteralSpelling(value, plan)
  if (spelled.kind === 'native') return spelled.text
  return spelled.kind === 'parse' ? `bf.number('${spelled.text}')` : 'bf.neg(0)'
}

/**
 * Spell a unary-minus plan over `operand` (#3824 step 6): the runtime's
 * `neg`, JS `-ToNumber(x)` keeping the sign of zero, unless the plan names
 * the native operator.
 */
function negate(plan: PrimitivePlan | null, operand: string, native: () => string): string {
  return isNativePlan(plan, 'neg') ? native() : `bf.neg(${operand})`
}

/**
 * Spell a unary-`+` plan over `operand` (#3824 step 3): the operand itself
 * when the plan proves it a number, the runtime's JS ToNumber (`to_number`)
 * otherwise.
 */
function toNumber(plan: PrimitivePlan | null, operand: string): string {
  return isNativeToNumber(plan) ? operand : `bf.to_number(${operand})`
}
