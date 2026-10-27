/**
 * Memo initial-value computation — lower a memo's computation to its SSR initial
 * value as a Go expression.
 *
 * Free functions over a {@link GoEmitContext}. `computeMemoInitialValue` is the
 * typed-field entry (zero-value defaulting); `computeMemoInitialValueOrNull` is
 * the pattern-matching core dispatching over template-literal, parsed-body,
 * comparison-ternary, block-body and object memo shapes.
 */

import type { MemoInfo, ParsedExpr, ParsedStatement, TypeInfo, JsSourceText } from '@barefootjs/jsx'
import {
  asCallbackMethodCall,
  freeIdentifiers,
  freeVarsInBody,
  materializeGetterCalls,
  isNullishLiteral,
  serializeParsedExpr,
} from '@barefootjs/jsx'

import type { GoEmitContext } from '../emit-context.ts'
import type { PropFallbackVar } from '../lib/types.ts'
import { capitalizeFieldName } from '../lib/go-naming.ts'
import { escapeGoString } from '../lib/go-emit.ts'
import {
  convertInitialValue,
  getSignalInitialValueAsGo,
  mapJoinChainToGo,
  matchMapJoinChain,
  seedFallbackVar,
  unboxToGoScalar,
  unwrapNullableUnion,
} from '../value/value-lowering.ts'
import { embeddedPropMemberChain } from '../value/prop-member-seed.ts'
import { appliesDefaultOnNil, defaultedBindingGo, evaluatedDefaultBindingGo, resolvePropGoType } from '../props/prop-types.ts'
import { typeInfoToGo } from '../type/type-codegen.ts'
import { parsedLiteralToGo } from '../value/parsed-literal-to-go.ts'
import { computeTemplateLiteralMemoInitialValue } from './template-interp.ts'
import {
  BOXED_ARITHMETIC_HELPER,
  type BoxedArithmeticSeed,
  classifyBoxedArithmetic,
  getterCallName,
  isResolvableLengthRead,
  lengthReadReceiver,
  memoArithmeticYieldsNaN,
  nonNegativeIntLiteral,
  propNameForPropsBinding,
  propsMemberName,
} from './memo-seed-shape.ts'
import { resolveBlockBodyMemoModuleConst, computeObjectMemoInitialValue } from './memo-value.ts'

// The boxed-arithmetic decision lives with the seed classification; re-exported
// for the adapter's existing import.
export { isBoxedNumericMemoBody } from './memo-seed-shape.ts'

/** Default for the optional `propFallbackVars` argument. */
const EMPTY_PROP_FALLBACK_VARS: ReadonlyMap<string, PropFallbackVar> = new Map()

/** Whether `t` is `boolean`, or a `T | undefined`/`T | null` union whose
 *  non-nullish branch is `boolean` (the controlled-signal shape,
 *  `createSignal<boolean | undefined>(...)`). The union half goes through
 *  the shared `unwrapNullableUnion`, which only unwraps an EXACT
 *  nullish-plus-primitive pair — so `boolean | number` (no nullish member)
 *  is not boolean-typed here, where the previous inline check took the
 *  first non-nullish member and misclassified it. */
function isBooleanTypeInfo(t: TypeInfo): boolean {
  const scalar = unwrapNullableUnion(t)
  return scalar.kind === 'primitive' && scalar.primitive === 'boolean'
}

/** Whether the getter NAME (a signal or memo) has a boolean-compatible
 *  declared type — gates the ternary-over-getter-calls branch below
 *  (#2260) so it only fires for the boolean shape it hardcodes a `func()
 *  bool { ... }()` wrapper for; a string/number-typed getter falls through
 *  to the caller's normal handling instead of emitting invalid Go. */
function isBooleanTypedGetter(
  ctx: GoEmitContext,
  name: string,
  signals: { getter: string; initialValue: JsSourceText; type?: TypeInfo; parsed?: ParsedExpr }[],
): boolean {
  const signal = signals.find(s => s.getter === name)
  if (signal) return signal.type !== undefined && isBooleanTypeInfo(signal.type)
  const memo = (ctx.state.currentMemos ?? []).find(m => m.name === name)
  return memo?.type !== undefined && isBooleanTypeInfo(memo.type)
}

/**
 * A memo-body length read ({@link lengthReadReceiver}) → `bf.Length(<recv>)`,
 * where `<recv>` is the receiver's constructor-time Go value: the seeded
 * signal's value (`in.Items` for `createSignal(props.items)`, the `initial`
 * of a `createQuery`), another memo's baked value, or the prop field. So the
 * baked length is the length of the data the constructor actually received,
 * not a compile-time constant. `bf.Length` is the runtime helper the
 * template-position `.length` lowering (`bf_length`) also calls: elements
 * for a slice/map, UTF-16 code units for a string, and `0` for nil (an
 * absent prop), never a panic.
 *
 * @returns the Go expression, or null when the body is not a length read or
 *   its receiver does not resolve
 */
function resolveLengthReadGo(
  ctx: GoEmitContext,
  e: ParsedExpr,
  signals: { getter: string; initialValue: JsSourceText; type?: TypeInfo; parsed?: ParsedExpr }[],
  propsParams: { name: string; sourceName?: string; type?: TypeInfo; defaultValue?: string }[],
  propFallbackVars: ReadonlyMap<string, PropFallbackVar>,
  propRef: (propName: string) => string,
  resolving: ReadonlySet<string>,
): string | null {
  if (!isResolvableLengthRead(ctx, e, signals, propsParams)) return null
  const recv = lengthReadReceiver(e)!
  const getter = getterCallName(recv)
  const recvGo = getter
    ? resolveGetterValueAsGo(ctx, getter, signals, propsParams, propFallbackVars, resolving)
    : propRef(propNameForPropsBinding(ctx, recv)!)
  return recvGo === null ? null : `bf.Length(${recvGo})`
}

/** A `() => props.X.filter((p) => <predicate>)` match: the array prop name,
 *  the predicate serialized to the runtime evaluator's ParsedExpr JSON, the
 *  arrow's param name, and the free variable names its predicate captures.
 *  Null when `body` isn't this shape, `propName` doesn't resolve to a known
 *  prop, or the predicate isn't representable (`serializeParsedExpr` refusal).
 *  Shared by the SSR-value emitter ({@link memoInitialFromParsedBody}) and the
 *  constructor's sibling-memo hoisting pre-pass so both walk the shape
 *  identically. */
export function matchFilterArmMemo(
  ctx: GoEmitContext,
  body: ParsedExpr,
  signals: { getter: string; initialValue: JsSourceText; type?: TypeInfo; parsed?: ParsedExpr }[],
  propsParams: { name: string; sourceName?: string; type?: TypeInfo; defaultValue?: string }[],
): { propName: string; predJSON: string; paramName: string; freeVars: string[] } | null {
  const cb = asCallbackMethodCall(body)
  if (!cb || cb.method !== 'filter') return null
  const propName = propsMemberName(cb.object)
  const param = propName ? propsParams.find(p => p.name === propName) : undefined
  if (!propName || !param) return null

  // Single authority (Package G plan): every step that isn't `env-reader` is
  // value-materializable at SSR time — env readers are per-request readers
  // the runtime evaluator can't invoke, so they're excluded here exactly as
  // the plan's own consumers exclude them.
  const knownGetterNames = new Set<string>(
    ctx.state.ssrSeedPlan.steps.filter(s => s.kind !== 'env-reader').map(s => s.name),
  )

  const materialized = materializeGetterCalls(cb.arrow.body, knownGetterNames)
  const predJSON = serializeParsedExpr(materialized)
  if (predJSON === null) return null

  const paramName = cb.arrow.params[0] ?? '_'
  const freeVars = freeVarsInBody(materialized, new Set(cb.arrow.params))
  return { propName, predJSON, paramName, freeVars }
}

/**
 * Names of EARLIER sibling memos (per `ctx.state.currentMemos` declaration
 * order) that a filter-arm memo's predicate free variables resolve to — the
 * constructor generator hoists these into a shared local so the sibling's
 * expression isn't emitted twice (once for its own field, once inlined in
 * this memo's `bf.FilterEval` env map, #2075/#2077 review finding 3). Empty
 * when `memo` isn't a filter-arm memo or references nothing hoistable.
 */
export function filterArmEarlierSiblingRefs(
  ctx: GoEmitContext,
  memo: { name: string; parsed?: ParsedExpr },
  signals: { getter: string; initialValue: JsSourceText; type?: TypeInfo; parsed?: ParsedExpr }[],
  propsParams: { name: string; sourceName?: string; type?: TypeInfo; defaultValue?: string }[],
): string[] {
  if (!memo.parsed) return []
  const match = matchFilterArmMemo(ctx, memo.parsed, signals, propsParams)
  if (!match) return []
  // `currentMemos` order equals the plan's memo-step order (plan lists
  // signals first, then memos, both in declaration order) — kept here rather
  // than filtering `ssrSeedPlan.steps` since this index is memo-only already.
  const memos = ctx.state.currentMemos ?? []
  const currentIndex = memos.findIndex(m => m.name === memo.name)
  if (currentIndex < 0) return []
  const refs: string[] = []
  for (const name of match.freeVars) {
    const idx = memos.findIndex(m => m.name === name)
    if (idx >= 0 && idx < currentIndex) refs.push(name)
  }
  return refs
}

/**
 * Compute a memo's SSR initial value as a Go expression — e.g.
 * `() => count() * 2` → `in.Initial * 2`, `() => props.value * 10` →
 * `in.Value * 10`. Unresolved computations default to the memo's Go zero value.
 *
 * @param propFallbackVars when a hoisted fallback var exists for a referenced
 *   prop, it is substituted for `in.FieldName` so the memo inherits the
 *   signal-time `??` fallback
 * @param goType Go type of the memo field, used to pick the zero-value fallback
 */
export function computeMemoInitialValue(
  ctx: GoEmitContext,
  memo: { name: string; computation: JsSourceText; deps: string[]; parsed?: ParsedExpr },
  signals: { getter: string; initialValue: JsSourceText; type?: TypeInfo; parsed?: ParsedExpr }[],
  propsParams: { name: string; sourceName?: string; type?: TypeInfo; defaultValue?: string }[],
  propFallbackVars: ReadonlyMap<string, PropFallbackVar> = EMPTY_PROP_FALLBACK_VARS,
  goType?: string,
): string {
  // Seed the resolution stack with this memo's own name — every external call
  // is a fresh top-level computation, so self-reference must be caught on the
  // very first recursion, not only on the second visit.
  // Reference types (map / slice / interface / pointer) hold `nil`; `0` is
  // not assignable to them.
  const nillable =
    goType !== undefined &&
    (goType.startsWith('map[') ||
      goType.startsWith('[]') ||
      goType.startsWith('*') ||
      goType.includes('interface{}') ||
      goType === 'any')
  // An identity memo over an `undefined` / `null`-initialized signal is
  // that signal's `nil`, so an attribute bound to it stays nil-checkable
  // (`attrValueMayBeNullish`, #3322). Only this field: another memo
  // computing over it keeps resolving the dependency's usual seed, since
  // `nil` can't be a native Go arithmetic operand.
  if (nillable && isNullishIdentityMemo(ctx, memo, signals, new Set([memo.name]))) return 'nil'
  // Arithmetic over an `undefined`-initialized signal is `NaN` in JS
  // (`ToNumber(undefined)`), but a Go seed would read the signal as `0`
  // (#3390). `bf.Number(nil)` is that NaN; only a field that can hold a
  // float64 takes it.
  if ((goType === undefined || goType === 'float64' || goType.includes('interface{}') || goType === 'any') &&
      memo.parsed && memoArithmeticYieldsNaN(ctx, memo.parsed)) {
    return 'bf.Number(nil)'
  }
  // A memo over a boxed dependent-default prop (#3531): the evaluator's value
  // when it converts to the field's type, else the shapes below.
  if (memo.parsed && readsBoxedDependentDefaultProp(ctx, memo.parsed)) {
    const evaluated = evalExprGo(ctx, memo.parsed, signals, propsParams, propFallbackVars, new Set([memo.name]))
    const typed = evaluated === null ? null : evaluatedAsGoType(evaluated, goType)
    if (typed !== null) return typed
  }
  const resolved = computeMemoInitialValueOrNull(
    ctx, memo, signals, propsParams, propFallbackVars, new Set([memo.name]),
  )
  if (resolved !== null) return resolved
  const evaluated = memo.parsed
    ? evalExprGo(ctx, memo.parsed, signals, propsParams, propFallbackVars, new Set([memo.name]))
    : null
  const typed = evaluated === null ? null : evaluatedAsGoType(evaluated, goType)
  if (typed !== null) return typed
  // Zero value for the memo's Go type: `false` for bool, `""` for string,
  // `nil` for reference types, else the int `0`.
  if (goType === 'bool') return 'false'
  if (goType === 'string') return '""'
  if (nillable) return 'nil'
  return '0'
}

/** String methods with a runtime helper of the same JS semantics. */
const STRING_METHOD_HELPER: Readonly<Record<string, string>> = {
  toUpperCase: 'Upper',
  toLowerCase: 'Lower',
  trim: 'Trim',
}

/**
 * Whether `expr` is an integer whatever its inputs: an integer literal, a
 * `.length` read, or `+` / `-` / `*` / `%` / unary sign / a ternary / a
 * `??` or `||` over such operands.
 */
export function isIntegerValued(expr: ParsedExpr): boolean {
  switch (expr.kind) {
    case 'literal':
      return typeof expr.value === 'number' && Number.isInteger(expr.value)
    case 'member':
      return !expr.computed && expr.property === 'length'
    case 'unary':
      return (expr.op === '-' || expr.op === '+') && isIntegerValued(expr.argument)
    case 'binary':
      return ['+', '-', '*', '%'].includes(expr.op) && isIntegerValued(expr.left) && isIntegerValued(expr.right)
    case 'conditional':
      return isIntegerValued(expr.consequent) && isIntegerValued(expr.alternate)
    case 'logical':
      return expr.op !== '&&' && isIntegerValued(expr.left) && isIntegerValued(expr.right)
    default:
      return false
  }
}

/**
 * An `any`-typed Go value (an {@link evalExprGo} result) converted to a
 * destination of Go type `goType` with JS's coercion: `bf.String` for a
 * `string`, `bf.Truthy` for a `bool`, `bf.Number` for a `float64`, and an
 * `int`/`float64` type switch for an `int` (`unboxToGoScalar`). An
 * `interface{}` or unknown destination takes it as is. Null for any other
 * type, which the value can't be assigned to.
 */
export function evaluatedAsGoType(evaluated: string, goType: string | undefined): string | null {
  if (goType === undefined || goType === 'any' || goType === 'interface{}') return evaluated
  if (goType === 'string') return `bf.String(${evaluated})`
  if (goType === 'bool') return `bf.Truthy(${evaluated})`
  if (goType === 'float64') return `bf.Number(${evaluated})`
  if (goType === 'int') return unboxToGoScalar(evaluated, 'int')
  return null
}

/**
 * An expression evaluated at construction by the runtime's JS evaluator
 * (`bf.EvalExpr`) over the SSR values of the signals, memos and props it
 * reads: a memo body the shapes in {@link memoInitialFromParsedBody} don't
 * recognise (#3436), or a child prop value (#3437), such as `u().name ?? 'x'`
 * or `(u().age ?? 0) + 1` over an object signal. A no-argument `toUpperCase` / `toLowerCase` / `trim` call, which
 * the evaluator does not run, wraps the evaluated receiver in its runtime
 * helper. The result is an `any`, so the caller converts it to the memo
 * field's Go type. Null when the body is outside the evaluator's surface or
 * reads a name with no SSR value.
 */
export function evalExprGo(
  ctx: GoEmitContext,
  body: ParsedExpr,
  signals: { getter: string; initialValue: JsSourceText; type?: TypeInfo; parsed?: ParsedExpr }[],
  propsParams: { name: string; sourceName?: string; type?: TypeInfo; defaultValue?: string }[],
  propFallbackVars: ReadonlyMap<string, PropFallbackVar>,
  resolving: ReadonlySet<string>,
): string | null {
  if (body.kind === 'array-method' && body.args.length === 0) {
    const helper = STRING_METHOD_HELPER[body.method]
    if (!helper) return null
    const recv = evalExprGo(ctx, body.object, signals, propsParams, propFallbackVars, resolving)
    return recv === null ? null : `bf.${helper}(${recv})`
  }
  // Env readers are per-request readers the evaluator can't invoke.
  const knownGetterNames = new Set<string>(
    ctx.state.ssrSeedPlan.steps.filter(s => s.kind !== 'env-reader').map(s => s.name),
  )
  const materialized = materializeGetterCalls(body, knownGetterNames)
  const json = serializeParsedExpr(materialized)
  if (json === null) return null
  const entries: string[] = []
  for (const name of freeVarsInBody(materialized, new Set())) {
    if (name === 'undefined') continue
    const goExpr = evalEnvValueGo(ctx, name, signals, propsParams, propFallbackVars, resolving)
    if (goExpr === null) return null
    entries.push(`${JSON.stringify(name)}: ${goExpr}`)
  }
  return `bf.EvalExpr("${escapeGoString(json)}", map[string]any{${entries.join(', ')}})`
}

/**
 * A signal's SSR value as a memo lowering reads it: the evaluated computed
 * prop seed (#3519) when there is one, the same value its own field and a
 * forwarded child prop get, else `getSignalInitialValueAsGo`'s.
 */
function signalSeedValueGo(
  ctx: GoEmitContext,
  signal: { getter: string; initialValue: JsSourceText; type?: TypeInfo; parsed?: ParsedExpr },
  propsParams: { name: string; sourceName?: string; type?: TypeInfo; defaultValue?: string }[],
  propFallbackVars: ReadonlyMap<string, PropFallbackVar>,
  signalType: TypeInfo | undefined,
): string {
  const computed = ctx.computedSignalSeed(
    { ...signal, type: signal.type ?? { kind: 'unknown', raw: 'unknown' } },
    propsParams,
    propFallbackVars,
  )
  return computed ?? getSignalInitialValueAsGo(ctx, signal.initialValue, propsParams, propFallbackVars, signalType, signal.parsed)
}

/**
 * Seed shapes that compute a value; a top-level `??` keeps its own path
 * unless {@link isComputedNullishSeed} says otherwise. A call
 * (`Math.max(props.n ?? 0, 1)`, `(props.label ?? 'x').toUpperCase()`)
 * computes one too (#3540), and so does a member read off a computed value
 * (`(props.label ?? '').length`, `[props.n].length`). A member chain rooted
 * at a name (`props.label`, `initial.address.city`) is a prop passthrough or
 * a prop member seed, resolved to its Input field elsewhere.
 */
function isComputedSeedShape(
  ctx: GoEmitContext,
  e: ParsedExpr,
  propsParams: readonly { name: string }[],
  propFallbackVars: ReadonlyMap<string, PropFallbackVar>,
): boolean {
  switch (e.kind) {
    case 'logical':
      return e.op !== '??' || isComputedNullishSeed(ctx, e, propsParams, propFallbackVars)
    case 'binary':
    case 'conditional':
    case 'unary':
    case 'template-literal':
    case 'call':
    case 'array-method':
      return true
    case 'member': {
      let root: ParsedExpr = e
      while (root.kind === 'member') root = root.object
      return root.kind !== 'identifier'
    }
    default:
      return false
  }
}

/**
 * A signal seed that computes over a prop (`props.label || 'none'`,
 * `props.flag && 'on'`, `n * 2`, `(props.label ?? '').length`), evaluated by
 * the runtime evaluator as a memo body is (#3519, #3540). Before, such a seed
 * baked the bare prop, `nil` or the type's zero value.
 * Null for any other seed, or one the evaluator can't take.
 */
export function computedPropSeedGo(
  ctx: GoEmitContext,
  parsed: ParsedExpr | undefined,
  propsParams: { name: string; sourceName?: string; type?: TypeInfo; defaultValue?: string }[],
  propFallbackVars: ReadonlyMap<string, PropFallbackVar>,
): string | null {
  if (!parsed) return null
  // A seed reading a boxed dependent-default prop is evaluated whatever its
  // shape, a bare read included, so it converts to the seed's type (#3531).
  if (!isComputedSeedShape(ctx, parsed, propsParams, propFallbackVars) && !readsBoxedDependentDefaultProp(ctx, parsed)) return null
  // A prop member chain inside the seed keeps its own refusal (#3142).
  if (embeddedPropMemberChain(ctx, parsed, propsParams)) return null
  if (!readsPropName(ctx, parsed, propsParams)) return null
  return evalExprGo(ctx, parsed, [], propsParams, propFallbackVars, new Set())
}

/**
 * Whether `e` reads the props object or a prop binding. `freeIdentifiers`,
 * not `freeVarsInBody`: the latter skips the receiver of a string method
 * (`(props.label ?? 'x').toUpperCase()`).
 */
function readsPropName(ctx: GoEmitContext, e: ParsedExpr, propsParams: readonly { name: string }[]): boolean {
  return [...(freeIdentifiers(e) ?? [])].some(
    name => name === ctx.state.propsObjectName || propsParams.some(p => p.name === name),
  )
}

/**
 * Whether a top-level `??` seed is evaluated (#3577) instead of seeding the
 * left prop through its hoisted fallback local or its Input field:
 *
 * - a fallback operand reads a prop (`props.b ?? props.a`,
 *   `props.b ?? props.a ?? 'z'`), which the field path drops, seeding
 *   `in.B` alone;
 * - `props.X ?? <literal>` while the prop's hoisted local carries a
 *   different literal: that local is another seed's value, such as a
 *   sibling `props.X ?? 'y'` or a destructure default the seed plan inlined
 *   (`const { x: local = 'd' } = props` reads as `props.x ?? 'd'`).
 */
function isComputedNullishSeed(
  ctx: GoEmitContext,
  e: Extract<ParsedExpr, { kind: 'logical' }>,
  propsParams: readonly { name: string }[],
  propFallbackVars: ReadonlyMap<string, PropFallbackVar>,
): boolean {
  let operand: ParsedExpr = e
  while (operand.kind === 'logical' && operand.op === '??') {
    if (readsPropName(ctx, operand.right, propsParams)) return true
    operand = operand.left
  }
  const match = ctx.extractPropFallbackFromParsed(e)
  return match !== null && propFallbackVars.has(match.propName) && seedFallbackVar(ctx, e, propFallbackVars) === undefined
}

/**
 * Whether `parsed` reads a destructured scalar prop whose default reads an
 * earlier prop (`ParamInfo.defaultParts`, #3531) or is a non-zero literal
 * (`appliesDefaultOnNil`). The constructor has already
 * applied that default to `in.<Field>` (`dependentDefaultNormalization`), but
 * the field is boxed as `interface{}` so an absent prop stays nil, and a
 * concrete destination (a `bool` signal, a `string` memo, a child's typed
 * Input field) can't take it raw. Such a value is computed by the runtime
 * evaluator and converted to the destination's type where that conversion
 * exists ({@link evaluatedAsGoType}); every other destination keeps its own
 * path, which reads the same resolved field. A non-scalar dependent prop
 * keeps its own Go type and needs neither.
 */
export function readsBoxedDependentDefaultProp(ctx: GoEmitContext, parsed: ParsedExpr): boolean {
  const frees = freeIdentifiers(parsed)
  if (frees === null) return false
  return ctx.state.currentPropsParams.some(p =>
    appliesDefaultOnNil(p) && frees.has(p.name) &&
    resolvePropGoType(ctx, p, ctx.state.propTypeOverrides) === 'interface{}',
  )
}

/**
 * The Go value {@link evalExprGo} hands the evaluator for one free name of
 * the expression: a signal's seed, a memo's value, a prop field, or the
 * props object as a map. Null when the name has no SSR value.
 */
function evalEnvValueGo(
  ctx: GoEmitContext,
  name: string,
  signals: { getter: string; initialValue: JsSourceText; type?: TypeInfo; parsed?: ParsedExpr }[],
  propsParams: { name: string; sourceName?: string; type?: TypeInfo; defaultValue?: string }[],
  propFallbackVars: ReadonlyMap<string, PropFallbackVar>,
  resolving: ReadonlySet<string>,
): string | null {
  let goExpr: string | null = null
  const signal = signals.find(s => s.getter === name)
  const memo = (ctx.state.currentMemos ?? []).find(m => m.name === name)
  const param = propsParams.find(p => p.name === name)
  if (signal) {
    // A literal seed goes in as the JS value itself: an object as a
    // source-keyed map, so a field the literal omits stays absent for
    // `??` instead of reading as the Go zero value of a struct field.
    const literal = signal.parsed ? seedLiteralToEvalGo(ctx, signal.parsed) : null
    if (literal !== null) {
      goExpr = literal
    } else {
      goExpr = signalSeedValueGo(ctx, signal, propsParams, propFallbackVars, signal.type)
      // `0` is also its answer for a seed it can't resolve; the evaluator
      // would compute over that stand-in instead of the real value.
      if (goExpr === '0' && signal.initialValue.trim() !== '0') return null
    }
  } else if (memo) {
    if (resolving.has(memo.name)) return null
    goExpr = memoEnvValueGo(ctx, memo, signals, propsParams, propFallbackVars, new Set([...resolving, memo.name]))
  } else if (param) {
    // The binding itself, with its destructure default. A hoisted
    // `propFallbackVars` local is a sibling signal's `x ?? d` seed, whose
    // fallback is not this expression's (#3540).
    const binding = ctx.state.currentPropsParams.find(p => p.name === name)
    // A default only the evaluator can build (a callback) goes in evaluated.
    const defaulted = binding
      ? (defaultedBindingGo(ctx, binding, ctx.state.currentPropsParams, ctx.state.propTypeOverrides) ??
        evaluatedDefaultBindingGo(ctx, binding, ctx.state.currentPropsParams, ctx.state.propTypeOverrides))
      : null
    goExpr = defaulted ?? `in.${capitalizeFieldName(param.sourceName ?? name)}`
  } else if (name === ctx.state.propsObjectName) {
    // The props object (`props.items.length`) as a map keyed by each
    // prop's caller-facing name (#3512).
    // An aliased destructure (`const { label: text } = props`) adds a
    // second entry with the same caller-facing name; each key appears once.
    const keys = [...new Set(propsParams.map(p => p.sourceName ?? p.name))]
    goExpr = `map[string]any{${keys.map(key => `${JSON.stringify(key)}: in.${capitalizeFieldName(key)}`).join(', ')}}`
  }
  return goExpr
}

/**
 * A seed literal as the evaluator's JS value: a scalar as its Go literal,
 * `null` / `undefined` as `nil`, an object as a source-keyed
 * `map[string]any` and an array as a `[]any`. Null for anything else (a
 * spread, a shorthand or other identifier, a call).
 */
function seedLiteralToEvalGo(ctx: GoEmitContext, expr: ParsedExpr): string | null {
  if (isNullishLiteral(expr)) return 'nil'
  if (expr.kind === 'object-literal') {
    const entries: string[] = []
    for (const prop of expr.properties) {
      if (prop.kind === 'spread') return null
      const value = seedLiteralToEvalGo(ctx, prop.value)
      if (value === null) return null
      entries.push(`${JSON.stringify(prop.key)}: ${value}`)
    }
    return `map[string]any{${entries.join(', ')}}`
  }
  if (expr.kind === 'array-literal') {
    const elements: string[] = []
    for (const element of expr.elements) {
      const value = seedLiteralToEvalGo(ctx, element)
      if (value === null) return null
      elements.push(value)
    }
    return `[]any{${elements.join(', ')}}`
  }
  return parsedLiteralToGo(ctx, expr)
}

/**
 * A memo's SSR value as an evaluator environment entry: the same value its
 * own field takes in {@link computeMemoInitialValue} — `nil` for an identity
 * chain over a nullish seed, `NaN` for arithmetic over an `undefined` one —
 * else its hoisted local, a catalogue shape or the evaluator. Null when none
 * resolves.
 */
function memoEnvValueGo(
  ctx: GoEmitContext,
  memo: MemoInfo,
  signals: { getter: string; initialValue: JsSourceText; type?: TypeInfo; parsed?: ParsedExpr }[],
  propsParams: { name: string; sourceName?: string; type?: TypeInfo; defaultValue?: string }[],
  propFallbackVars: ReadonlyMap<string, PropFallbackVar>,
  resolving: ReadonlySet<string>,
): string | null {
  if (isNullishIdentityMemo(ctx, memo, signals, resolving)) return 'nil'
  if (memo.parsed && memoArithmeticYieldsNaN(ctx, memo.parsed)) return 'bf.Number(nil)'
  const hoisted = ctx.state.hoistedMemoLocals.get(memo.name)
  if (hoisted !== undefined) return hoisted
  // An env entry is untyped, so a memo over a boxed dependent-default prop
  // is evaluated rather than built from its typed shapes (#3531).
  const boxed = memo.parsed !== undefined && readsBoxedDependentDefaultProp(ctx, memo.parsed)
  return (boxed ? null : computeMemoInitialValueOrNull(ctx, memo, signals, propsParams, propFallbackVars, resolving)) ??
    (memo.parsed ? evalExprGo(ctx, memo.parsed, signals, propsParams, propFallbackVars, resolving) : null)
}

/**
 * Whether `memo` is an identity chain (`() => s()`, `() => other()`) that
 * ends at a signal whose initial value is a literal `undefined` / `null`.
 */
function isNullishIdentityMemo(
  ctx: GoEmitContext,
  memo: { parsed?: ParsedExpr },
  signals: { getter: string; parsed?: ParsedExpr }[],
  resolving: ReadonlySet<string>,
): boolean {
  const dep = memo.parsed ? getterCallName(memo.parsed) : null
  if (dep === null) return false
  const signal = signals.find(s => s.getter === dep)
  if (signal) return isNullishLiteral(signal.parsed)
  const inner = (ctx.state.currentMemos ?? []).find(m => m.name === dep)
  if (!inner || resolving.has(inner.name)) return false
  return isNullishIdentityMemo(ctx, inner, signals, new Set([...resolving, inner.name]))
}

/** The signal shape the parsed-body seed arms read. */
type SeedSignal = { getter: string; initialValue: JsSourceText; type?: TypeInfo; parsed?: ParsedExpr }

/** The prop-param shape the parsed-body seed arms read. */
type SeedPropParam = { name: string; sourceName?: string; type?: TypeInfo; defaultValue?: string; parsed?: ParsedExpr; optional?: boolean }

/** What every {@link memoInitialFromParsedBody} arm reads. */
interface SeedEmitEnv {
  readonly ctx: GoEmitContext
  readonly signals: SeedSignal[]
  readonly propsParams: SeedPropParam[]
  readonly propFallbackVars: ReadonlyMap<string, PropFallbackVar>
  readonly currentMemoName: string
  readonly resolving: ReadonlySet<string>
  /** A prop's constructor value: its hoisted fallback var, else its input field. */
  readonly propRef: (propName: string) => string
}

/**
 * One arm's verdict on a memo body: the Go seed, `null` to decline the whole
 * body (no later arm can resolve it), or `undefined` when the arm's shape
 * doesn't apply and the next arm runs.
 */
type SeedArmResult = string | null | undefined

/**
 * Structural matcher for the common expression-bodied memo shapes, driven by
 * the analyzer-attached `MemoInfo.parsed` (the memo arrow's body): `getter() ===
 * 'lit'`, `props.X ?? false`, `cond() ? A : B`, `<getter()|props.X|var> <*+-/>
 * <int>`, and bare `getter()` / `props.X` / `var`. Each shape is one arm of
 * {@link PARSED_BODY_ARMS}, tried in order; the boxed-arithmetic shapes are
 * classified once ({@link classifyBoxedArithmetic}, the decision the memo
 * field's Go type also reads) and only spelled here.
 *
 * @returns the Go SSR value, or null when the body is none of these (the caller
 *   then falls through to comparison-ternary / block-body / object-memo handling)
 */
export function memoInitialFromParsedBody(
  ctx: GoEmitContext,
  body: ParsedExpr,
  signals: SeedSignal[],
  propsParams: SeedPropParam[],
  propFallbackVars: ReadonlyMap<string, PropFallbackVar>,
  currentMemoName: string,
  resolving: ReadonlySet<string> = new Set(),
): string | null {
  const propRef = (propName: string): string => {
    const hoisted = propFallbackVars.get(propName)
    if (hoisted) return hoisted.varName
    const param = propsParams.find(p => p.name === propName)
    return `in.${capitalizeFieldName(param?.sourceName ?? propName)}`
  }
  const env: SeedEmitEnv = { ctx, signals, propsParams, propFallbackVars, currentMemoName, resolving, propRef }
  for (const arm of PARSED_BODY_ARMS) {
    const result = arm(env, body)
    if (result !== undefined) return result
  }
  return null
}

/**
 * A boxed-arithmetic body ({@link classifyBoxedArithmetic}) → its runtime
 * helper call. The classification is the one `inferMemoType` reads to give
 * the field `interface{}`, so the seed and the field type can't disagree.
 */
function boxedArithmeticArm(env: SeedEmitEnv, body: ParsedExpr): SeedArmResult {
  const seed = classifyBoxedArithmetic(env.ctx, body, env.signals, env.propsParams)
  return seed === null ? undefined : emitBoxedArithmetic(env, seed)
}

function emitBoxedArithmetic(env: SeedEmitEnv, seed: BoxedArithmeticSeed): SeedArmResult {
  switch (seed.kind) {
    case 'numeric-operands': {
      // Numeric getter/prop combinations must not fall through to a zero
      // seed merely because the RHS isn't a literal. The shared runtime owns
      // JS arithmetic and safely accepts Go's concrete or interface values.
      const left = resolveNumericAtomGo(env, seed.left)
      const right = resolveNumericAtomGo(env, seed.right)
      return left !== null && right !== null ? `bf.${BOXED_ARITHMETIC_HELPER[seed.op]}(${left}, ${right})` : undefined
    }
    case 'literal-division':
      return literalDivisionGo(env, seed.dividend, String(seed.divisor))
    case 'nillable-prop-literal': {
      // A hoisted fallback var is a concrete number, so a prop that has one
      // keeps the plain arithmetic ({@link literalArithmeticArm}).
      if (env.propFallbackVars.has(seed.propName)) return undefined
      const param = env.propsParams.find(p => p.name === seed.propName)
      const field = capitalizeFieldName(propsMemberName(seed.left) ?? param?.sourceName ?? seed.propName)
      return `bf.${BOXED_ARITHMETIC_HELPER[seed.op]}(in.${field}, ${String(seed.operand)})`
    }
    case 'boxed-memo-identity':
      // The dependency's boxed value passes through ({@link identityGetterArm}).
      return undefined
    case 'boxed-memo-literal': {
      // getter() <op> N over a BOXED memo: Go has no `any * int`, so the
      // shared runtime helper does the arithmetic (`bf.Mul(<total>, 2)`).
      const dep = resolveGetterValueAsGo(env.ctx, seed.dep, env.signals, env.propsParams, env.propFallbackVars, env.resolving)
      return dep === null ? null : `bf.${BOXED_ARITHMETIC_HELPER[seed.op]}(${dep}, ${String(seed.operand)})`
    }
  }
}

/** A numeric operand ({@link classifyBoxedArithmetic}'s `numeric-operands`) → its constructor value. */
function resolveNumericAtomGo(env: SeedEmitEnv, expr: ParsedExpr): string | null {
  const { ctx, signals, propsParams, propFallbackVars, propRef, resolving } = env
  const lengthGo = resolveLengthReadGo(ctx, expr, signals, propsParams, propFallbackVars, propRef, resolving)
  if (lengthGo !== null) return lengthGo
  const getter = getterCallName(expr)
  if (getter) return resolveGetterValueAsGo(ctx, getter, signals, propsParams, propFallbackVars, resolving)
  const propName = propNameForPropsBinding(ctx, expr)
  return propName ? propRef(propName) : null
}

/**
 * `bf.Div(<dividend>, N)` for a getter call, `props.X` or destructured-prop
 * dividend, else null. `bf.Div`'s `any` operands accept any constructor value
 * form, an IIFE included (#3379).
 */
function literalDivisionGo(env: SeedEmitEnv, dividend: ParsedExpr, operand: string): string | null {
  const dep = getterCallName(dividend)
  if (dep) {
    const depInitial = resolveGetterValueAsGo(env.ctx, dep, env.signals, env.propsParams, env.propFallbackVars, env.resolving)
    return depInitial === null ? null : `bf.Div(${depInitial}, ${operand})`
  }
  const propName = propsMemberName(dividend)
  if (propName && env.propsParams.some(p => p.name === propName)) {
    const hoisted = env.propFallbackVars.get(propName)
    return `bf.Div(${hoisted ? hoisted.varName : `in.${capitalizeFieldName(propName)}`}, ${operand})`
  }
  const param = dividend.kind === 'identifier' ? env.propsParams.find(p => p.name === dividend.name) : undefined
  return param ? `bf.Div(in.${capitalizeFieldName(param.sourceName ?? param.name)}, ${operand})` : null
}

/**
 * A request-scoped env-signal read (`searchParams().get('k')`, any local
 * alias, #1922) → the literal key and the reader's canonical field name,
 * else null. Constraints: the receiver must be a zero-arg call of a local
 * bound to a registered env signal (`ctx.state.envSignalReadersByLocal`,
 * keyed by that reader's own registration — not a hardcoded key); the
 * method must be one that reader's `methods` set recognises; the key
 * argument must be a string literal.
 */
function envGetKey(ctx: GoEmitContext, e: ParsedExpr): { key: string; fieldName: string } | null {
  if (e.kind !== 'call' || e.callee.kind !== 'member' || e.callee.computed) return null
  const recvName = getterCallName(e.callee.object)
  if (recvName === null) return null
  const reader = ctx.state.envSignalReadersByLocal.get(recvName)
  if (!reader || !reader.methods.has(e.callee.property)) return null
  const arg = e.args[0]
  if (!arg || arg.kind !== 'literal' || arg.literalType !== 'string') return null
  return { key: String(arg.value), fieldName: capitalizeFieldName(reader.canonicalName) }
}

/**
 * () => searchParams().get('k') — a derived memo over the env signal
 * (#2069). The constructor reads the canonical `in.SearchParams` reader the
 * handler fills per request, so the memo SSR-computes instead of zero-valuing.
 */
function envGetArm(env: SeedEmitEnv, body: ParsedExpr): SeedArmResult {
  const m = envGetKey(env.ctx, body)
  return m === null ? undefined : `in.${m.fieldName}.Get(${JSON.stringify(m.key)})`
}

/**
 * () => searchParams().get('k') ?? '<lit>' — the defaulted form. Go's
 * `SearchParams.Get` returns "" for an absent key (it can't surface JS's
 * null), so the default fires on "" — the same documented `?? → or`
 * divergence as the template-position lowering (`or (.SearchParams.Get
 * "k") "<lit>"`); the two positions stay consistent.
 */
function envGetDefaultArm(env: SeedEmitEnv, body: ParsedExpr): SeedArmResult {
  if (body.kind !== 'logical' || (body.op !== '??' && body.op !== '||')) return undefined
  if (body.right.kind !== 'literal' || body.right.literalType !== 'string') return undefined
  const m = envGetKey(env.ctx, body.left)
  if (m === null) return undefined
  const def = JSON.stringify(String(body.right.value))
  return `func() string { if v := in.${m.fieldName}.Get(${JSON.stringify(m.key)}); v != "" { return v }; return ${def} }()`
}

/**
 * () => props.X.filter((p) => <predicate>) — a LIST-valued derived memo
 * chained off a sibling memo the predicate closes over (e.g. a
 * searchParams()-derived `tag`). Env-signal getters are excluded from the
 * free-var materialization set: they're per-request READERS, not values,
 * and the runtime evaluator has no way to invoke one.
 */
function filterArm(env: SeedEmitEnv, body: ParsedExpr): SeedArmResult {
  const match = matchFilterArmMemo(env.ctx, body, env.signals, env.propsParams)
  if (!match) return undefined
  const { propName, predJSON, paramName, freeVars } = match
  const currentIndex = (env.ctx.state.currentMemos ?? []).findIndex(m => m.name === env.currentMemoName)
  const envEntries: string[] = []
  for (const name of freeVars) {
    const goExpr = filterEnvEntryGo(env, name, currentIndex)
    if (goExpr === null) return undefined
    envEntries.push(`${JSON.stringify(name)}: ${goExpr}`)
  }
  const itemsField = `in.${capitalizeFieldName(propName)}`
  const envMap = `map[string]any{${envEntries.join(', ')}}`
  return `bf.FilterEval(${itemsField}, "${escapeGoString(predJSON)}", ${JSON.stringify(paramName)}, ${envMap})`
}

/** One free variable of a filter-arm predicate → its constructor value, else null. */
function filterEnvEntryGo(env: SeedEmitEnv, name: string, currentIndex: number): string | null {
  const { ctx, signals, propsParams, propFallbackVars, resolving } = env
  const memos = ctx.state.currentMemos ?? []
  const siblingIndex = memos.findIndex(m => m.name === name)
  if (siblingIndex >= 0) {
    // Only a sibling declared EARLIER than the memo being computed is
    // eligible — mirrors JS declaration order and rules out both
    // self-reference and any mutual pair (at most one direction can
    // satisfy `earlier`), independent of the resolving-stack guard
    // below. A hoisted local (the constructor emitted it once already,
    // #2075/#2077 review finding 3) is reused verbatim instead of
    // recomputing the expression a second time.
    const siblingMemo = memos[siblingIndex]
    const eligible = currentIndex >= 0 && siblingIndex < currentIndex && !resolving.has(siblingMemo.name)
    if (!eligible) return null
    return ctx.state.hoistedMemoLocals.get(siblingMemo.name) ?? computeMemoInitialValueOrNull(
      ctx, siblingMemo, signals, propsParams, propFallbackVars,
      new Set([...resolving, siblingMemo.name]),
    )
  }
  const sig = signals.find(s => s.getter === name)
  if (sig) return signalSeedValueGo(ctx, sig, propsParams, propFallbackVars, undefined)
  return propsParams.some(p => p.name === name) ? env.propRef(name) : null
}

/**
 * () => !<operand> — a negation memo (`() => !open()`, `() => !tags()`,
 * `() => !props.label`). JS `!` is `!Boolean(x)`: `bf.Truthy` is the
 * runtime's `Boolean(x)` (nil/absent falsy, a non-nil EMPTY slice/map
 * truthy) — the same decision the template-position `!` makes through
 * `lowerJsNot`'s `not (bf_truthy x)`.
 */
function negationArm(env: SeedEmitEnv, body: ParsedExpr): SeedArmResult {
  if (body.kind !== 'unary' || body.op !== '!') return undefined
  const operand = resolveComparisonOperandGo(
    env.ctx, body.argument, env.signals, env.propsParams, env.propFallbackVars,
    new Set([...env.resolving, env.currentMemoName]),
  )
  return operand === null ? undefined : `!bf.Truthy(${operand})`
}

const EQUALITY_OPS: ReadonlySet<string> = new Set(['===', '!==', '==', '!='])

/**
 * () => getter() === 'lit' / !== 'lit' — a selection memo. Resolves to a Go
 * bool when the signal's initial value is itself a string literal, read off
 * the seed's parsed tree whatever its quote style (`"a"`, `'it\'s'`).
 */
function selectionArm(env: SeedEmitEnv, body: ParsedExpr): SeedArmResult {
  if (body.kind !== 'binary' || !EQUALITY_OPS.has(body.op)) return undefined
  if (body.right.kind !== 'literal' || body.right.literalType !== 'string') return undefined
  const depName = getterCallName(body.left)
  const seed = depName ? env.signals.find(sg => sg.getter === depName)?.parsed : undefined
  if (seed?.kind !== 'literal' || seed.literalType !== 'string') return undefined
  const equal = String(seed.value) === String(body.right.value)
  return String(body.op.startsWith('!') ? !equal : equal)
}

/**
 * () => props.X ?? false — a boolean passthrough memo. Go's bool zero value
 * IS the `?? false` fallback, so the raw input field carries it exactly.
 */
function boolPassthroughArm(env: SeedEmitEnv, body: ParsedExpr): SeedArmResult {
  if (body.kind !== 'logical' || body.op !== '??') return undefined
  if (body.right.kind !== 'literal' || body.right.value !== false) return undefined
  const propName = propsMemberName(body.left)
  return propName ? env.propRef(propName) : undefined
}

/**
 * () => props.X !== undefined (or !=/===/==) — the "controlled component"
 * idiom's `isControlled` memo (#2260). Distinguishing "caller passed a
 * value" from "caller omitted the prop" needs the nillable `interface{}`
 * representation `collectPresenceCheckedPropNames`/`resolvePropGoType`
 * flip `props.X` to; the input field's Go zero value for `interface{}` IS
 * `nil`, so a plain nil-check is exact (no `bf_nullish`-style helper
 * needed — this is presence, not a `??` fallback).
 *
 * Guarded on the field ACTUALLY being nillable-flipped — a presence check
 * against a CONCRETE-typed field (a required prop, or an optional one this
 * memo's shape didn't trigger the flip for, e.g. via
 * `collectPresenceCheckedPropNames`'s primitive-only / no-default gate)
 * can't be tested this way (`x != nil` doesn't even compile against a
 * `string`/`bool` field) — the caller's zero-value default applies instead
 * of invalid Go. Reads the RAW `in.<Field>` directly — NOT through
 * `propRef`, which prefers a hoisted `?? <fallback>` local when one exists:
 * that local already collapsed "absent" into the fallback value at hoist
 * time, so it's never nil and testing it here would be nonsensical (and,
 * being concretely typed, wouldn't compile against `nil` either).
 */
function presenceCheckArm(env: SeedEmitEnv, body: ParsedExpr): SeedArmResult {
  if (body.kind !== 'binary' || !EQUALITY_OPS.has(body.op)) return undefined
  const other =
    body.right.kind === 'identifier' && body.right.name === 'undefined' ? body.left :
    body.left.kind === 'identifier' && body.left.name === 'undefined' ? body.right : null
  const propName = other ? propNameForPropsBinding(env.ctx, other) : null
  const param = propName ? env.propsParams.find(p => p.name === propName) : undefined
  if (!propName || !param || !env.ctx.state.nillablePropNames.has(propName)) return undefined
  const isNe = body.op === '!==' || body.op === '!='
  // `nillablePropNames` stays keyed by the LOCAL name (a source-level
  // set); the emitted field is caller-facing (#2525).
  return `in.${capitalizeFieldName(param.sourceName ?? propName)} ${isNe ? '!=' : '=='} nil`
}

/** A string-literal or module-string-const ternary branch → its Go string literal, else null. */
function stringBranchGo(ctx: GoEmitContext, b: ParsedExpr): string | null {
  if (b.kind === 'literal' && b.literalType === 'string') return JSON.stringify(b.value)
  if (b.kind === 'identifier') {
    const constVal = ctx.state.moduleStringConsts.get(b.name)
    return constVal !== undefined ? JSON.stringify(constVal) : null
  }
  return null
}

/**
 * () => cond() ? A : B where each branch is a module string const or a
 * string literal, and `cond` is a signal/memo this resolver can evaluate.
 */
function stringTernaryArm(env: SeedEmitEnv, body: ParsedExpr): SeedArmResult {
  if (body.kind !== 'conditional') return undefined
  const condName = getterCallName(body.test)
  if (!condName) return undefined
  const t = stringBranchGo(env.ctx, body.consequent)
  const f = stringBranchGo(env.ctx, body.alternate)
  if (t === null || f === null) return undefined
  const condGo = ternaryConditionGo(env, condName)
  if (condGo === 'true') return t
  if (condGo === 'false') return f
  return condGo === null ? undefined : `func() string { if ${condGo} { return ${t} }; return ${f} }()`
}

/** A string ternary's getter condition → its constructor value, else null. */
function ternaryConditionGo(env: SeedEmitEnv, condName: string): string | null {
  const { ctx, signals, propsParams, propFallbackVars, resolving } = env
  const condSignal = signals.find(sg => sg.getter === condName)
  if (condSignal) return signalSeedValueGo(ctx, condSignal, propsParams, propFallbackVars, undefined)
  const condMemo = (ctx.state.currentMemos ?? []).find(m => m.name === condName)
  // A condition memo already on the resolution stack (self- or
  // mutually-referencing ternaries) falls back to null — the same
  // zero-value default as any other unresolved shape — instead of
  // recursing forever.
  if (!condMemo || resolving.has(condMemo.name)) return null
  return computeMemoInitialValueOrNull(
    ctx, condMemo, signals, propsParams, propFallbackVars,
    new Set([...resolving, condMemo.name]),
  )
}

/**
 * () => cond() ? branchA() : branchB() — a ternary whose CONDITION and
 * BOTH branches are getter calls (signals/memos), not string literals
 * (#2260's `isPressed = isControlled() ? controlledPressed() :
 * internalPressed()`). `resolveGetterValueAsGo` resolves each — a
 * presence-check memo like `isControlled` above already yields a Go
 * `bool` expression, so the condition needs no extra wrapping.
 *
 * GATED to both branches being boolean-typed signals/memos
 * (`isBooleanTypedGetter`) — `getterCallName` only checks call SHAPE,
 * not type, so an ungated version would also match a derived
 * string/number memo (`label = isActive() ? activeLabel() :
 * inactiveLabel()`) and hardcode an invalid `func() bool { return
 * "..." }()` (Copilot review finding on the initial version of this
 * branch).
 */
function booleanGetterTernaryArm(env: SeedEmitEnv, body: ParsedExpr): SeedArmResult {
  if (body.kind !== 'conditional') return undefined
  const { ctx, signals, propsParams, propFallbackVars, resolving } = env
  const condName = getterCallName(body.test)
  const tName = getterCallName(body.consequent)
  const fName = getterCallName(body.alternate)
  if (!condName || !tName || !fName) return undefined
  if (!isBooleanTypedGetter(ctx, tName, signals) || !isBooleanTypedGetter(ctx, fName, signals)) return undefined
  const condGo = resolveGetterValueAsGo(ctx, condName, signals, propsParams, propFallbackVars, resolving)
  const tGo = resolveGetterValueAsGo(ctx, tName, signals, propsParams, propFallbackVars, resolving)
  const fGo = resolveGetterValueAsGo(ctx, fName, signals, propsParams, propFallbackVars, resolving)
  if (condGo === null || tGo === null || fGo === null) return undefined
  return `func() bool { if ${condGo} { return ${tGo} }; return ${fGo} }()`
}

/**
 * () => <ref> <*|+|-|/> <non-negative int> over a Go number (a boxed operand
 * took {@link boxedArithmeticArm}). The operand must be a non-negative
 * integer literal; float/negative bodies fall through unchanged.
 */
function literalArithmeticArm(env: SeedEmitEnv, body: ParsedExpr): SeedArmResult {
  if (body.kind !== 'binary' || !['*', '+', '-', '/'].includes(body.op)) return undefined
  const value = nonNegativeIntLiteral(body.right)
  if (value === null) return undefined
  const operator = body.op
  const operand = String(value)
  // A `/` body computes through `bf.Div` whatever the dividend's form.
  if (operator === '/') return literalDivisionGo(env, body.left, operand) ?? undefined
  // <length read> <*|+|-> N — `bf.Length(...)` is a Go `int` call
  // expression, a single operand under any binary operator (no grouping
  // needed).
  const { ctx, signals, propsParams, propFallbackVars, propRef, resolving } = env
  const lengthGo = resolveLengthReadGo(ctx, body.left, signals, propsParams, propFallbackVars, propRef, resolving)
  if (lengthGo !== null) return `${lengthGo} ${operator} ${operand}`
  return getterLiteralArithmeticGo(env, body.left, operator, operand)
    ?? propLiteralArithmeticGo(env, body.left, operator, operand)
    ?? undefined
}

/**
 * getter() <op> N — the signal's (or, #2168 memo-chain, another memo's) Go
 * initial value <op> N. `resolveGetterValueAsGo` checks `signals` first
 * (`doubled = createMemo(() => count() * 2)`), then falls back to
 * `ctx.state.currentMemos` and recurses — needed for a memo derived from
 * ANOTHER memo (`label = createMemo(() => doubled() + 1)`).
 */
function getterLiteralArithmeticGo(env: SeedEmitEnv, left: ParsedExpr, operator: string, operand: string): string | null {
  const depName = getterCallName(left)
  if (!depName) return null
  const depInitial = resolveGetterValueAsGo(env.ctx, depName, env.signals, env.propsParams, env.propFallbackVars, env.resolving)
  // `resolveGetterValueAsGo` can return an IIFE (`func() string { ... }()`
  // / `func() interface{} { ... }()`, e.g. a memo that shadows `props.X
  // ?? <lit>`, #2075) rather than a plain atom — none of those return
  // types support Go's `<op>` arithmetic operators, so splicing one in
  // bare would emit invalid Go (Copilot review, #2200: e.g. `operator
  // is not defined on interface{}`/`string`). Bail (fall through to the
  // caller's zero-value default) rather than emit broken arithmetic.
  if (depInitial === null || depInitial.startsWith('func(')) return null
  // A signal's own initial value is always a simple atom (a literal,
  // `in.Field`, a hoisted var) — never needs grouping. A MEMO's initial
  // value can itself be a compound expression from this exact arm one
  // level up (`"3 * 2"`), and splicing that in bare under a DIFFERENT
  // outer operator can silently invert precedence (a memo chain shaped
  // `inner = () => count() + 1` then `outer = () => inner() * 2` would fold
  // to `3 + 1 * 2` = 5 in Go, vs JS's `(3+1)*2` = 8). Parenthesize whenever
  // `depInitial` is compound (contains whitespace — a simple atom never
  // does) so precedence is preserved regardless of which operator
  // combination a memo chain uses. A simple atom is left bare so existing
  // exact-text expectations (`Doubled: 3 * 2,`) don't gain a no-op paren.
  const wrapped = /\s/.test(depInitial) ? `(${depInitial})` : depInitial
  return `${wrapped} ${operator} ${operand}`
}

/**
 * props.X <op> N — hoisted var if any, else the input field (asserting int
 * when the field lowers to interface{}); var <op> N — a destructured prop's
 * input field (no hoisted-var lookup).
 */
function propLiteralArithmeticGo(env: SeedEmitEnv, left: ParsedExpr, operator: string, operand: string): string | null {
  const propName = propsMemberName(left)
  const memberParam = propName ? env.propsParams.find(p => p.name === propName) : undefined
  if (propName && memberParam) {
    const hoisted = env.propFallbackVars.get(propName)
    if (hoisted) return `${hoisted.varName} ${operator} ${operand}`
    return `${intFieldRead(env.ctx, memberParam, capitalizeFieldName(propName))} ${operator} ${operand}`
  }
  const param = left.kind === 'identifier' ? env.propsParams.find(p => p.name === left.name) : undefined
  if (!param) return null
  return `${intFieldRead(env.ctx, param, capitalizeFieldName(param.sourceName ?? param.name))} ${operator} ${operand}`
}

/** `in.<Field>`, asserted `.(int)` when the prop's field lowers to `interface{}`. */
function intFieldRead(ctx: GoEmitContext, param: SeedPropParam, fieldName: string): string {
  const boxed = param.type !== undefined && typeInfoToGo(ctx, param.type, param.defaultValue, param.parsed) === 'interface{}'
  return boxed ? `in.${fieldName}.(int)` : `in.${fieldName}`
}

/**
 * () => items().length / items()?.length ?? 0 / props.items.length — the
 * length of the constructor-time value (`bf.Length(in.Items)`).
 */
function lengthReadArm(env: SeedEmitEnv, body: ParsedExpr): SeedArmResult {
  const { ctx, signals, propsParams, propFallbackVars, propRef, resolving } = env
  return resolveLengthReadGo(ctx, body, signals, propsParams, propFallbackVars, propRef, resolving) ?? undefined
}

/**
 * () => getter() — the signal's (or another memo's, #2168 memo-chain) Go
 * initial value, a boxed memo's included.
 */
function identityGetterArm(env: SeedEmitEnv, body: ParsedExpr): SeedArmResult {
  const simpleDep = getterCallName(body)
  if (!simpleDep) return undefined
  return resolveGetterValueAsGo(env.ctx, simpleDep, env.signals, env.propsParams, env.propFallbackVars, env.resolving) ?? undefined
}

/** () => props.X — the prop value (hoisted-aware). */
function propReadArm(env: SeedEmitEnv, body: ParsedExpr): SeedArmResult {
  const simpleProp = propsMemberName(body)
  return simpleProp && env.propsParams.some(p => p.name === simpleProp) ? env.propRef(simpleProp) : undefined
}

/** () => var — a destructured prop, the input field directly. */
function destructuredPropReadArm(env: SeedEmitEnv, body: ParsedExpr): SeedArmResult {
  if (body.kind !== 'identifier') return undefined
  const param = env.propsParams.find(p => p.name === body.name)
  return param ? `in.${capitalizeFieldName(param.sourceName ?? body.name)}` : undefined
}

/**
 * () => <a> + <b> + … — a string-concatenation chain whose every leaf is a
 * string literal, a prop reference, or a `.map(cb).join(sep)` chain
 * (#2492's `joined` memo: `title + ':' + items().map((title) =>
 * title.a).join(',')`). Doesn't grow into a general `binary` catalogue
 * entry — only fires for a pure `+` tree resolvable end-to-end via
 * `resolveStringConcatChainGo`; any other leaf shape falls through to the
 * caller's zero-value default, same as any other unsupported shape.
 */
function stringConcatArm(env: SeedEmitEnv, body: ParsedExpr): SeedArmResult {
  if (body.kind !== 'binary' || body.op !== '+') return undefined
  const { ctx, signals, propsParams, propFallbackVars, propRef, resolving } = env
  return resolveStringConcatChainGo(ctx, body, signals, propsParams, propFallbackVars, propRef, resolving) ?? undefined
}

/**
 * () => <object>.map(cb).join(sep) as the memo's WHOLE body (no `+`
 * concatenation) — `map-object-literal-body`'s `ids` memo: `rows().map(t
 * => ({ id: t.id, done: false })).map(r => r.id).join(',')`. The `+`-chain
 * arm above only reaches `matchMapJoinChain` as ONE leaf of a
 * concatenation; a bare chain memo never entered it (#2696 review).
 */
function mapJoinChainArm(env: SeedEmitEnv, body: ParsedExpr): SeedArmResult {
  const bareChain = matchMapJoinChain(body)
  if (!bareChain) return undefined
  return mapJoinChainToGo(env.ctx, bareChain, env.signals, env.propsParams, env.propFallbackVars) ?? undefined
}

/**
 * The parsed-body arms in match order. The first arm whose verdict isn't
 * `undefined` decides the seed.
 */
const PARSED_BODY_ARMS: readonly ((env: SeedEmitEnv, body: ParsedExpr) => SeedArmResult)[] = [
  boxedArithmeticArm,
  envGetArm,
  envGetDefaultArm,
  filterArm,
  negationArm,
  selectionArm,
  boolPassthroughArm,
  presenceCheckArm,
  stringTernaryArm,
  booleanGetterTernaryArm,
  literalArithmeticArm,
  lengthReadArm,
  identityGetterArm,
  propReadArm,
  destructuredPropReadArm,
  stringConcatArm,
  mapJoinChainArm,
]

/**
 * `<expr> + <expr> + …` chain whose every leaf resolves to a Go string
 * expression: a string literal, a prop reference (`propRef`, hoisted-aware),
 * or a `.map(cb).join(sep)` chain ({@link matchMapJoinChain} /
 * {@link mapJoinChainToGo} — `value-lowering.ts`, #2492). Recurses on nested
 * `+` so a left-associative chain (`a + b + c` parses as `(a + b) + c`)
 * resolves leaf-by-leaf.
 *
 * @returns the concatenated Go expression, or null when any leaf isn't one
 *   of the three shapes above
 */
/**
 * Whether a signal certainly holds a plain JS string: declared `string`, seeded
 * with a string literal, or seeded from a required `string` prop. A nullable
 * union is excluded — `bf.String(nil)` is `""` where JS concatenates
 * `"undefined"`.
 */
function isPlainStringSignal(
  signal: { type?: TypeInfo; parsed?: ParsedExpr },
  propsParams: { name: string; type?: TypeInfo; optional?: boolean }[],
): boolean {
  if (signal.type?.kind === 'primitive' && signal.type.primitive === 'string') return true
  const seed = signal.parsed
  if (seed?.kind === 'literal' && seed.literalType === 'string') return true
  const propName = seed ? (propsMemberName(seed) ?? (seed.kind === 'identifier' ? seed.name : null)) : null
  const prop = propName ? propsParams.find(p => p.name === propName) : undefined
  return prop?.type?.kind === 'primitive' && prop.type.primitive === 'string' && !prop.optional
}

function resolveStringConcatChainGo(
  ctx: GoEmitContext,
  expr: ParsedExpr,
  signals: { getter: string; initialValue: JsSourceText; type?: TypeInfo; parsed?: ParsedExpr }[],
  propsParams: { name: string; sourceName?: string; type?: TypeInfo; defaultValue?: string }[],
  propFallbackVars: ReadonlyMap<string, PropFallbackVar>,
  propRef: (propName: string) => string,
  resolving: ReadonlySet<string> = new Set(),
): string | null {
  if (expr.kind === 'binary' && expr.op === '+') {
    const l = resolveStringConcatChainGo(ctx, expr.left, signals, propsParams, propFallbackVars, propRef, resolving)
    const r = resolveStringConcatChainGo(ctx, expr.right, signals, propsParams, propFallbackVars, propRef, resolving)
    return l !== null && r !== null ? `${l} + ${r}` : null
  }

  if (expr.kind === 'literal' && expr.literalType === 'string') {
    return JSON.stringify(expr.value)
  }

  // A string-typed signal or memo read (`s() + '!'`, #3367): its constructor
  // value, through `bf.String` so the leaf is a Go `string` whatever field
  // type carries it. Only a plain `string` type — a nullable union would
  // print `""` where JS concatenates `"undefined"`.
  const getter = getterCallName(expr)
  if (getter && !resolving.has(getter)) {
    const inner = new Set([...resolving, getter])
    const signal = signals.find(sig => sig.getter === getter)
    if (signal) {
      if (!isPlainStringSignal(signal, propsParams)) return null
      // A string-literal seed lowers from its parsed value, whatever the
      // source quote style (`'can\'t'`, a backtick literal) — the raw-text
      // seed lowering is not quote-safe here.
      const seed = signal.parsed
      if (seed?.kind === 'literal' && seed.literalType === 'string') return JSON.stringify(seed.value)
      const value = resolveGetterValueAsGo(ctx, getter, signals, propsParams, propFallbackVars, inner)
      return value === null ? null : `bf.String(${value})`
    }
    // A memo that is itself such a chain (`label = () => s() + '!'`).
    const memo = ctx.state.currentMemos?.find(m => m.name === getter)
    if (memo?.parsed) {
      const chain = resolveStringConcatChainGo(ctx, memo.parsed, signals, propsParams, propFallbackVars, propRef, inner)
      return chain === null ? null : `(${chain})`
    }
  }

  const propName = propsMemberName(expr) ?? (expr.kind === 'identifier' ? expr.name : null)
  if (propName && propsParams.some(p => p.name === propName)) {
    return propRef(propName)
  }

  const chain = matchMapJoinChain(expr)
  if (chain) {
    return mapJoinChainToGo(ctx, chain, signals, propsParams, propFallbackVars)
  }

  return null
}

/**
 * Pattern-matching core of `computeMemoInitialValue`.
 *
 * @returns the memo's SSR initial value as a Go expression, or `null` when no
 *   pattern applies. Callers with a typed field to fill use the
 *   zero-value-defaulting wrapper above; callers that can OMIT the field (a
 *   child-instance prop init, where Go's zero values then apply with the right
 *   type) use this directly.
 */
export function computeMemoInitialValueOrNull(
  ctx: GoEmitContext,
  memo: { name: string; computation: JsSourceText; deps: string[]; parsed?: ParsedExpr; parsedBlock?: ParsedStatement[]; parsedBlockComplete?: boolean },
  signals: { getter: string; initialValue: JsSourceText; type?: TypeInfo; parsed?: ParsedExpr }[],
  propsParams: { name: string; sourceName?: string; type?: TypeInfo; defaultValue?: string }[],
  propFallbackVars: ReadonlyMap<string, PropFallbackVar> = EMPTY_PROP_FALLBACK_VARS,
  /**
   * Memo names currently being resolved on this call stack — guards against
   * unbounded recursion when memos reference each other (mutually, or a
   * self-reference). Callers that start a fresh top-level computation seed
   * this with `memo.name`; recursive calls extend it with the sibling memo
   * about to be entered. A candidate already in the set resolves to `null`
   * (the shape's usual "unsupported" fallback) instead of recursing.
   */
  resolving: ReadonlySet<string> = new Set(),
): string | null {
  const computation = memo.computation

  // () => `...${expr}...` — template-literal memo (the classes memo). Builds a
  // Go string concatenation; null when any interpolation isn't representable.
  const tmplMemo = computeTemplateLiteralMemoInitialValue(ctx, memo, propsParams)
  if (tmplMemo !== null) return tmplMemo

  // Expression-bodied memo shapes, matched structurally on `parsed`.
  if (memo.parsed) {
    const fromParsed = memoInitialFromParsedBody(ctx, memo.parsed, signals, propsParams, propFallbackVars, memo.name, resolving)
    if (fromParsed !== null) return fromParsed
  }

  // () => <operand> ===/!== 'lit' ? A : B, where each branch is a string
  // literal/module-const and <operand> is a getter call, an inline
  // nullish-defaulted prop (`props.X ?? 'horizontal'`), or a bare `props.X`.
  const cmpTernary = computeComparisonTernaryGo(
    ctx,
    memo.parsed,
    signals,
    propsParams,
    propFallbackVars,
    resolving,
  )
  if (cmpTernary !== null) return cmpTernary

  // Block-body memo that early-returns a module-const array when a guard signal
  // is falsy: `() => { const k = getter(); if (!k) return MODULE_ARRAY; … }`.
  // When the signal starts null the SSR value is that array; its literal value
  // (not the identifier) is passed to the baker so it reduces to a Go slice.
  const blockReturn = resolveBlockBodyMemoModuleConst(ctx, memo, signals)
  if (blockReturn !== null && blockReturn.constValue && blockReturn.constType) {
    return convertInitialValue(ctx,
      blockReturn.constValue,
      blockReturn.constType,
      propsParams,
      blockReturn.constParsed,
    )
  }

  // Object-returning block-body memo derived from `searchParams()`. Computes a
  // Go `map[string]interface{}` whose values are lowered from the request
  // query, so `.Params.Sort` etc. resolve at execute time instead of reading a
  // nil map; null for any unsupported shape (→ nil fallback).
  const objMemo = computeObjectMemoInitialValue(ctx, memo)
  if (objMemo !== null) return objMemo

  return null
}

/**
 * Resolve a signal/memo getter NAME to a Go value expression, for use as the
 * condition operand of another memo's ternary. Handles a plain signal, a
 * prop-shadow memo `() => props.X ?? 'lit'` (→ a nil/empty-tolerant field
 * read), else recurses.
 *
 * @returns the Go expression, or null when the shape isn't representable
 */
export function resolveGetterValueAsGo(
  ctx: GoEmitContext,
  name: string,
  signals: { getter: string; initialValue: JsSourceText; type?: TypeInfo; parsed?: ParsedExpr }[],
  propsParams: { name: string; sourceName?: string; type?: TypeInfo; defaultValue?: string }[],
  propFallbackVars: ReadonlyMap<string, PropFallbackVar>,
  resolving: ReadonlySet<string> = new Set(),
): string | null {
  const signal = signals.find(s => s.getter === name)
  if (signal) {
    return signalSeedValueGo(ctx, signal, propsParams, propFallbackVars, signal.type)
  }
  const memo = (ctx.state.currentMemos ?? []).find(m => m.name === name)
  if (memo) {
    // Already on the resolution stack (self- or mutually-referencing
    // ternary operands) — fall back to null rather than recurse forever.
    if (resolving.has(memo.name)) return null
    const fb = memoPropFallback(ctx, memo)
    if (fb && capitalizeFieldName(fb.propName) === capitalizeFieldName(memo.name)) {
      const fbParam = propsParams.find(p => p.name === fb.propName)
      const field = `in.${capitalizeFieldName(fbParam?.sourceName ?? fb.propName)}`
      return `func() interface{} { v := interface{}(${field}); if v == nil || v == "" { return ${fb.goFallback} }; return v }()`
    }
    return computeMemoInitialValueOrNull(
      ctx, memo, signals, propsParams, propFallbackVars, new Set([...resolving, memo.name]),
    )
  }
  const param = propsParams.find(p => p.name === name)
  if (param) {
    const hoisted = propFallbackVars.get(name)
    return hoisted ? hoisted.varName : `in.${capitalizeFieldName(param.sourceName ?? name)}`
  }
  return null
}

/**
 * Resolve a string-ternary memo whose condition is a literal comparison —
 * `() => <operand> === 'lit' ? A : B` (or `!==`) — to a Go runtime conditional.
 * Branches must be string literals/module-string-consts; the operand resolves
 * via `resolveComparisonOperandGo`.
 *
 * @returns the Go conditional, or null when the shape isn't supported
 */
export function computeComparisonTernaryGo(
  ctx: GoEmitContext,
  parsed: ParsedExpr | undefined,
  signals: { getter: string; initialValue: JsSourceText; type?: TypeInfo; parsed?: ParsedExpr }[],
  propsParams: { name: string; sourceName?: string; type?: TypeInfo; defaultValue?: string }[],
  propFallbackVars: ReadonlyMap<string, PropFallbackVar>,
  resolving: ReadonlySet<string> = new Set(),
): string | null {
  // Matches any `conditional` `parsed` — an expression-bodied ternary or, since
  // #2040, a block-bodied memo whose value `if` / early-return folded to one.
  if (!parsed || parsed.kind !== 'conditional') return null
  const cond = parsed.test
  if (cond.kind !== 'binary' || !(cond.right.kind === 'literal' && cond.right.literalType === 'string')) {
    return null
  }
  const isEq = cond.op === '===' || cond.op === '=='
  const isNe = cond.op === '!==' || cond.op === '!='
  if (!isEq && !isNe) return null

  const t = stringBranchGo(ctx, parsed.consequent)
  const f = stringBranchGo(ctx, parsed.alternate)
  if (t === null || f === null) return null

  const condGo = resolveComparisonOperandGo(
    ctx,
    cond.left,
    signals,
    propsParams,
    propFallbackVars,
    resolving,
  )
  if (condGo === null) return null

  // `consequent` fires when the comparison holds; for `!==` the branches swap.
  const eqBranch = isEq ? t : f
  const neBranch = isEq ? f : t
  return `func() string { if ${condGo} == ${JSON.stringify(cond.right.value)} { return ${eqBranch} }; return ${neBranch} }()`
}

/**
 * Resolve the left operand of a string-ternary memo's comparison condition to a
 * Go expression: a zero-arg getter call (a signal/prop-shadow memo), an inline
 * `props.X ?? 'def'` (folds the default), or a bare `props.X`.
 *
 * @returns the Go expression, or null for anything else
 */
export function resolveComparisonOperandGo(
  ctx: GoEmitContext,
  node: ParsedExpr,
  signals: { getter: string; initialValue: JsSourceText; type?: TypeInfo; parsed?: ParsedExpr }[],
  propsParams: { name: string; sourceName?: string; type?: TypeInfo; defaultValue?: string }[],
  propFallbackVars: ReadonlyMap<string, PropFallbackVar>,
  resolving: ReadonlySet<string> = new Set(),
): string | null {
  // getter(): a signal or memo getter call.
  if (node.kind === 'call' && node.callee.kind === 'identifier' && node.args.length === 0) {
    return resolveGetterValueAsGo(ctx, node.callee.name, signals, propsParams, propFallbackVars, resolving)
  }
  // props.X ?? 'def' — nil/empty-tolerant field read with the default folded in.
  if (node.kind === 'logical' && node.op === '??' && node.right.kind === 'literal' && node.right.literalType === 'string') {
    const propName = propsAccessNameFromParsed(ctx, node.left)
    if (propName) {
      const field = `in.${capitalizeFieldName(propName)}`
      return `func() interface{} { v := interface{}(${field}); if v == nil || v == "" { return ${JSON.stringify(node.right.value)} }; return v }()`
    }
  }
  // Bare props.X.
  const direct = propsAccessNameFromParsed(ctx, node)
  if (direct) return `in.${capitalizeFieldName(direct)}`
  return null
}

/**
 * `ParsedExpr` counterpart of `propsAccessName`: if `node` is a
 * `<propsObjectName>.<name>` member access, return `<name>`, else null.
 */
function propsAccessNameFromParsed(ctx: GoEmitContext, node: ParsedExpr): string | null {
  if (node.kind !== 'member' || node.computed) return null
  if (node.object.kind !== 'identifier') return null
  if (!ctx.state.propsObjectName || node.object.name !== ctx.state.propsObjectName) return null
  return node.property
}

/**
 * #2448: every INPUT prop name a constructor-evaluated `parsed` expression
 * reads, either via a `<propsObjectName>.<name>` member access (object-props
 * signature, e.g. `props.n`) or a bare identifier bound to a destructured
 * prop (no `propsObjectName`).
 *
 * Two kinds of expression reach here, because `New<Comp>Props` bakes BOTH
 * into the struct at construction time: a `createMemo` body and a
 * `createSignal` INITIAL VALUE (`const [dbl] = createSignal(props.n)` emits
 * `Dbl: in.N`, exactly as `createMemo(() => props.n * 2)` emits
 * `Dbl: in.N * 2`). Either one goes stale under a per-row override, so both
 * feed the dependency map.
 *
 * Feeds `GoTemplateAdapter.childDerivedFieldDeps` (built by
 * `recordDerivedFieldDeps`, `go-template-adapter.ts`) so a parent overriding
 * one of THESE props per row (`bf_with_props`, #2445) can be refused loudly
 * instead of silently leaving the derived field stale — see that map's
 * docstring.
 *
 * Structural counterpart of {@link freeVarsInBody}: that walk reports a
 * member's OBJECT identifier only (`props`), treating the property name as
 * non-referential (fine for its own free-var-substitution purpose). Here the
 * PROPERTY name is exactly what's wanted, so a `member` node contributes it
 * once its object resolves to the props binding — walking stops at that
 * first `propsObjectName.<name>` hop, so a deeper chain (`props.a.b`) still
 * contributes only its BASE prop `a` (mirrors `collectPropRefs` in
 * `ssr-defaults.ts`, the same first-level-only rule, for the same reason: an
 * adapter that later re-derives a nested field still needs the base field
 * seeded).
 *
 * This is a best-effort STRUCTURAL walk over the child's OWN analysis-time
 * `parsed` tree — not a re-derivation of the Go initializer text, which
 * isn't available yet at registration time (the cross-file shape pre-pass,
 * #2131, runs before any component's codegen).
 */
export function collectPropsReadByCtorInit(
  body: ParsedExpr,
  propsObjectName: string | null,
  propNames: ReadonlySet<string>,
): Set<string> {
  const found = new Set<string>()
  const visit = (e: ParsedExpr, bound: ReadonlySet<string>): void => {
    switch (e.kind) {
      case 'identifier':
        // Destructured signature only: a bare identifier bound to a
        // destructured prop param IS the reference (`(props) => props.n`
        // has no bare `n` — that shape is the `member` branch below).
        if (!propsObjectName && propNames.has(e.name) && !bound.has(e.name)) found.add(e.name)
        return
      case 'member':
        if (
          propsObjectName &&
          !e.computed &&
          e.object.kind === 'identifier' &&
          e.object.name === propsObjectName
        ) {
          found.add(e.property)
          return
        }
        visit(e.object, bound)
        return
      case 'index-access':
        visit(e.object, bound)
        visit(e.index, bound)
        return
      case 'binary':
      case 'logical':
        visit(e.left, bound)
        visit(e.right, bound)
        return
      case 'unary':
        visit(e.argument, bound)
        return
      case 'conditional':
        visit(e.test, bound)
        visit(e.consequent, bound)
        visit(e.alternate, bound)
        return
      case 'call':
        visit(e.callee, bound)
        e.args.forEach(a => visit(a, bound))
        return
      case 'template-literal':
        for (const p of e.parts) if (p.type === 'expression') visit(p.expr, bound)
        return
      case 'array-literal':
        e.elements.forEach(el => visit(el, bound))
        return
      case 'object-literal':
        for (const p of e.properties) visit(p.kind === 'spread' ? p.expr : p.value, bound)
        return
      case 'array-method':
        visit(e.object, bound)
        e.args.forEach(a => visit(a, bound))
        if (e.method === 'flat' && e.depthExpr) visit(e.depthExpr, bound)
        return
      case 'arrow': {
        const inner = e.params.length === 0 ? bound : new Set([...bound, ...e.params])
        visit(e.body, inner)
        return
      }
      // Non-referential leaves — nothing to collect.
      case 'literal':
      case 'regex':
      case 'unsupported':
        return
      default: {
        // Exhaustiveness pin. A NEW `ParsedExpr` kind that lands without a
        // case here would silently contribute no dependencies, and this
        // walk's whole job is to answer "does this memo read that prop?" —
        // a missed dependency is a MISSED REFUSAL, i.e. the silently-stale
        // derived field #2448 exists to prevent. Fail the build instead:
        // `never` makes the omission a compile error at the point the kind
        // is added, the same drift defence `PARSED_EXPR_KINDS` gives the
        // registry (`expression-parser.ts`).
        const _exhaustive: never = e
        void _exhaustive
        return
      }
    }
  }
  visit(body, new Set())
  return found
}

/**
 * The `props.X ?? fallback` a memo's value reads, matched on the analyzer's
 * parsed tree (`MemoInfo.parsed`), or null.
 */
export function memoPropFallback(
  ctx: GoEmitContext,
  memo: { parsed?: ParsedExpr },
): ReturnType<GoEmitContext['extractPropFallbackFromParsed']> {
  return ctx.extractPropFallbackFromParsed(memo.parsed)
}
