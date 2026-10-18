/**
 * Signal and memo state fields: their Go field TYPE and their constructor
 * SEED, in one place (#3425).
 *
 * A `createSignal` / `createMemo` becomes a field on the `<Name>Props`
 * struct (`emitPropsDataFields`) and an initializer in `New<Name>Props`
 * (`generateNewPropsFunction`). The two must agree: the NaN fix (#3390)
 * needed `inferMemoType` and the memo seed to agree on `interface{}`, the
 * struct-field fix (#3419) needed the field, the constructor seed and the
 * child input to agree. So the decisions live here as free functions over a
 * {@link GoEmitContext}, and the struct generator and the constructor
 * generator both call them; a representation change is made once.
 *
 * - {@link signalFieldGoType} — the signal field's Go type.
 * - {@link inferMemoType} — the memo field's Go type.
 * - {@link signalSeedGo} — the signal's constructor-time value.
 * - {@link collectPropFallbackVars} — the hoisted `props.X ?? N` locals the
 *   signal seed, the memo seed and the prop field share.
 * - {@link isNillableSeedSignal} — the #3323 nil-preserving seed shape both
 *   the field type and the seed consult.
 */

import type { ComponentIR, MemoInfo, ParsedExpr, ParsedStatement, TypeInfo } from '@barefootjs/jsx'

import type { GoEmitContext } from '../emit-context.ts'
import { resolveSignalParsedThroughSeedPlan } from '../lib/compile-state.ts'
import { goPropDefault } from '../lib/go-emit.ts'
import { GO_KEYWORDS, capitalizeFieldName } from '../lib/go-naming.ts'
import type { PropFallbackVar } from '../lib/types.ts'
import { findNestedComponents } from '../analysis/component-tree.ts'
import { isBooleanMemo, isListFilterMemo, isStringTernaryMemo } from '../memo/memo-type.ts'
import { resolveBlockBodyMemoModuleConst } from '../memo/memo-value.ts'
import { isBoxedNumericMemoBody, isEvaluatedMemo, memoArithmeticYieldsNaN } from '../memo/memo-compute.ts'
import { NULLISH_SCALAR_GO_TYPES, bareSeedPropName, buildPropTypeOverrides, resolvePropGoType } from '../props/prop-types.ts'
import { propMemberSeedGoType } from '../value/prop-member-seed.ts'
import { convertInitialValue } from '../value/value-lowering.ts'
import { typeInfoToGo } from './type-codegen.ts'

/** The minimal signal shape these decisions read (the IR's `SignalInfo` is not exported). */
export interface StateSignal {
  getter: string
  initialValue: string
  type: TypeInfo
  parsed?: ParsedExpr
}

/** The minimal props-param shape these decisions read. */
export interface StatePropParam {
  name: string
  type: TypeInfo
  defaultValue?: string
  parsed?: ParsedExpr
  optional?: boolean
}

/** The minimal memo shape `inferMemoType` reads. */
export interface StateMemo {
  name: string
  computation: string
  type: TypeInfo
  deps: string[]
  bodyIsTemplateLiteral?: boolean
  parsed?: ParsedExpr
  parsedBlock?: ParsedStatement[]
}

/** A nullable signal seeded whole from a prop flipped to `interface{}` for it (#3323). */
export function isNillableSeedSignal(ctx: GoEmitContext, signal: { parsed?: ParsedExpr }): boolean {
  const name = bareSeedPropName(ctx, signal.parsed)
  return name !== null && ctx.state.nullableSignalSeedPropNames.has(name)
}

/**
 * The Go type of a signal's Props-struct field, decided in this order:
 *
 * 1. A synthesised struct type wins outright — the signal is an untyped
 *    object array we gave a concrete element type.
 * 2. A signal seeded from a member of an object-typed prop
 *    (`createSignal(initial.items)`) takes the Go type of the Input field
 *    path its seed reads (`in.Initial.Items`), so the baked value is always
 *    assignable to it.
 * 3. Seeded whole from an optional prop flipped to `interface{}` so the
 *    signal stays nil when the caller omits it (#3323).
 * 4. Seeded from a prop: the "prop type wins" heuristic helps when the
 *    signal infer is less specific than the prop (e.g. `createSignal(
 *    props.todos)` wants `[]Todo`, not `interface{}`). It HURTS when the
 *    initial expression transforms the prop type — `createSignal(
 *    (props.todos ?? []).length)` is a `number`, not the prop's `[]Todo`.
 *    So a specific signal type overrides a less-specific prop type in
 *    either direction, and `.length` / `.some()` / `.every()` chains land
 *    on their actual Go type.
 * 5. Otherwise the signal's own inferred type.
 */
export function signalFieldGoType(
  ctx: GoEmitContext,
  signal: StateSignal,
  propsParamMap: ReadonlyMap<string, StatePropParam>,
): string {
  const synthType = ctx.state.synthStructTypes.get(signal.getter)
  if (synthType) return typeInfoToGo(ctx, synthType)
  const memberSeedType = propMemberSeedGoType(ctx, signal)
  if (memberSeedType) return memberSeedType
  if (isNillableSeedSignal(ctx, signal)) return 'interface{}'
  const referencedProp = seedingProp(ctx, signal, propsParamMap)
  const signalGoType = typeInfoToGo(ctx, signal.type, signal.initialValue, signal.parsed)
  if (!referencedProp) {
    return signalGoType === 'interface{}' ? numericArithmeticSeedGoType(ctx, signal.parsed, propsParamMap) ?? signalGoType : signalGoType
  }
  const propGoType = typeInfoToGo(ctx, referencedProp.type, referencedProp.defaultValue, referencedProp.parsed)
  if (propGoType.includes('interface{}')) return signalGoType
  // Both sides resolved but disagree — trust the signal's inferred shape
  // (based on the literal expression text, including the trailing accessor).
  if (!signalGoType.includes('interface{}') && signalGoType !== propGoType) return signalGoType
  return propGoType
}

/**
 * The Go number type of an arithmetic seed over numeric props and literals
 * (`props.n * 2`, `n - 1`), so its evaluated value (#3519) is stored as a
 * number rather than an `interface{}` holding a float64, which the template
 * would print in Go's exponent notation. `float64` when an operand's
 * resolved field type or a literal is fractional, else `int`: a product or
 * difference of integers is an integer. Null for any other seed. `+` (which
 * may concatenate), `/` (a fraction) and `%` (`NaN` for a zero divisor) are
 * left untyped.
 */
function numericArithmeticSeedGoType(
  ctx: GoEmitContext,
  parsed: ParsedExpr | undefined,
  propsParamMap: ReadonlyMap<string, StatePropParam>,
): 'int' | 'float64' | null {
  let float = false
  const leaf = (e: ParsedExpr): boolean => {
    if (e.kind === 'literal') {
      if (typeof e.value !== 'number') return false
      if (!Number.isInteger(e.value)) float = true
      return true
    }
    const name =
      e.kind === 'identifier' ? e.name :
      e.kind === 'member' && e.object.kind === 'identifier' && e.object.name === ctx.state.propsObjectName ? e.property :
      null
    const prop = name === null ? undefined : propsParamMap.get(name)
    if (!prop) return false
    // The prop's resolved field type: `.toFixed()` or a fractional caller
    // widens an `int` prop to `float64` (`buildPropTypeOverrides`).
    const goType = ctx.state.propTypeOverrides.get(prop.name) ?? typeInfoToGo(ctx, prop.type, prop.defaultValue, prop.parsed)
    if (goType === 'float64') float = true
    return goType === 'int' || goType === 'float64'
  }
  const visit = (e: ParsedExpr): boolean =>
    e.kind === 'binary' && (e.op === '*' || e.op === '-') ? visit(e.left) && visit(e.right) : leaf(e)
  if (!parsed || parsed.kind !== 'binary' || !visit(parsed)) return null
  return float ? 'float64' : 'int'
}

/**
 * The prop a signal's initial value reads — `props.X` / a destructured `x`
 * by name, or through the `props.X ?? …` / `x ?? …` seed shape — else
 * undefined.
 */
function seedingProp(
  ctx: GoEmitContext,
  signal: StateSignal,
  propsParamMap: ReadonlyMap<string, StatePropParam>,
): StatePropParam | undefined {
  const direct = propsParamMap.get(signal.initialValue)
  if (direct) return direct
  const propName = ctx.extractPropNameFromInitialValue(signal.initialValue, signal.parsed)
  return propName ? propsParamMap.get(propName) : undefined
}

/**
 * A memo's arithmetic body (`*`, `/`, `+`, `-`) is a number when one of its
 * dependency signals is number-typed, either through the prop that seeds it
 * or through its own inferred type.
 */
function isNumericArithmeticMemo(
  ctx: GoEmitContext,
  memo: StateMemo,
  signals: StateSignal[],
  propsParamMap: Map<string, StatePropParam>,
): boolean {
  const c = memo.computation
  if (!c.includes('*') && !c.includes('/') && !c.includes('+') && !c.includes('-')) return false
  for (const dep of memo.deps) {
    const signal = signals.find(s => s.getter === dep)
    if (!signal) continue
    const referencedProp = seedingProp(ctx, signal, propsParamMap)
    if (referencedProp) {
      const propType = typeInfoToGo(ctx, referencedProp.type, referencedProp.defaultValue, referencedProp.parsed)
      if (propType === 'int' || propType === 'float64') return true
    }
    const signalType = propMemberSeedGoType(ctx, signal) ??
      typeInfoToGo(ctx, signal.type, signal.initialValue, signal.parsed)
    if (signalType === 'int' || signalType === 'float64') return true
  }
  return false
}

/**
 * The Go type of a memo's Props-struct field (and so the zero value its
 * constructor seed falls back to), decided in this order:
 *
 * 1. A LIST-valued `.filter(arrow)` memo (#2075 — the blog PostList
 *    `visible` shape) is a slice of the receiver's boxed elements, not a
 *    scalar. Decided FIRST, ahead of the memo's declared `type` and every
 *    other heuristic: the analyzer's simple per-memo type inference doesn't
 *    model `.filter`'s predicate shape and can land on a bogus primitive
 *    (observed: `boolean`, from the predicate's own `!`/`||` structure),
 *    which would otherwise sail through the `typeInfoToGo(memo.type) ===
 *    'interface{}'` gates below unchallenged. `bf.FilterEval` (the SSR
 *    constructor lowering, memo-compute.ts) returns `[]any`; the template's
 *    `range` / reflective field access handle the boxed elements the same
 *    way it already handles other `interface{}`-typed slices.
 * 2. A template-literal memo always produces a string. Decided before the
 *    arithmetic heuristic so a class-string `/` (e.g. `ring-ring/50`)
 *    doesn't trip it into `int`. The analyzer classified the body shape
 *    from the arrow AST (`MemoInfo.bodyIsTemplateLiteral`).
 * 3. Arithmetic whose SSR result is `NaN` (#3390) needs a field that can
 *    hold a float64 NaN, whatever the declared `number` type would infer
 *    (`int`).
 * 4. The shared arithmetic runtime returns an integer or float as needed;
 *    keep its boxed result rather than truncating it to an int field.
 * 5. Arithmetic over a number-typed dependency signal → `int`.
 * 6. A string-literal-branch ternary memo (`directionClasses`) is a string
 *    even though its condition has `===`. Decided before the boolean
 *    heuristic so it's typed `string` (zero value `""`), not `interface{}`
 *    (whose nil zero renders `<nil>`).
 * 7. Boolean memo: a comparison/negation/ternary whose dependency signals
 *    are all boolean (`isChecked = isControlled() ? controlledChecked() :
 *    internalChecked()`). Inferring `bool` makes the field render `false`
 *    (not the int `0`) for `aria-checked={isChecked()}`. Only fires when
 *    the declared memo type is unknown so an explicitly-typed memo still
 *    wins.
 * 8. Block-body memo returning a module-const array: the constant's array
 *    type instead of the memo's generic `object`.
 * 9. The memo's declared type. A `number` memo the evaluator computes holds
 *    a boxed JS number, which an `int` field would truncate.
 */
export function inferMemoType(
  ctx: GoEmitContext,
  memo: StateMemo,
  signals: StateSignal[],
  propsParamMap: Map<string, StatePropParam>,
): string {
  if (isListFilterMemo(memo)) return '[]any'
  if (memo.bodyIsTemplateLiteral) return 'string'
  if (memo.parsed && memoArithmeticYieldsNaN(ctx, memo.parsed)) return 'interface{}'
  const propsParams = [...propsParamMap.values()]
  if (isBoxedNumericMemoBody(ctx, memo.parsed, signals, propsParams)) return 'interface{}'
  if (isNumericArithmeticMemo(ctx, memo, signals, propsParamMap)) return 'int'
  const declaredIsUnknown = typeInfoToGo(ctx, memo.type) === 'interface{}'
  if (declaredIsUnknown && isStringTernaryMemo(ctx, memo.parsed)) return 'string'
  if (declaredIsUnknown && isBooleanMemo(ctx, memo, signals, propsParamMap)) return 'bool'
  const blockReturn = resolveBlockBodyMemoModuleConst(ctx, memo, signals)
  if (blockReturn?.constType?.kind === 'array') {
    return typeInfoToGo(ctx, blockReturn.constType)
  }
  const declared = typeInfoToGo(ctx, memo.type)
  if (declared === 'int' && isEvaluatedMemo(ctx, memo as MemoInfo, signals, propsParams)) {
    return 'interface{}'
  }
  return declared
}

/**
 * Walk signals to collect prop fallbacks: `createSignal(props.X ?? N)`
 * hoists `N` as a local so the signal, any derived memo, and the prop field
 * share one fallback-applied value. Skips props that already have a
 * destructure-side default (`{ X = N }`) or signals whose fallback resolves
 * to the type's Go zero value (no-op).
 */
export function collectPropFallbackVars(ctx: GoEmitContext, ir: ComponentIR): Map<string, PropFallbackVar> {
  const result = new Map<string, PropFallbackVar>()
  const localTaken = new Set(['scopeID'])
  for (const nested of findNestedComponents(ir.root)) {
    localTaken.add(`${nested.name.charAt(0).toLowerCase()}${nested.name.slice(1)}s`)
  }

  const propTypeOverrides = buildPropTypeOverrides(ctx, ir)
  for (const signal of ir.metadata.signals) {
    const resolvedParsed = resolveSignalParsedThroughSeedPlan(ctx.state, signal)
    let match = ctx.extractPropFallback(signal.initialValue, resolvedParsed)
    // #2683: the idempotent fold above declines a non-idempotent
    // derivation (`(props.count ?? 1) * 2`) at the top level. When that
    // signal's Go field name COLLIDES with the prop's own field — the
    // exact condition under which the props-field loop would otherwise
    // silently drop the derivation and emit the raw prop instead — fall
    // back to the collision-derivation matcher so the coalesced value
    // still gets hoisted; the props-field loop composes the surrounding
    // arithmetic back on top of it (`collisionWrap`). Gated strictly on the
    // collision so a differently-named signal deriving from the same prop
    // (not colliding) is untouched — that path's own dedicated field keeps
    // today's behavior byte-for-byte.
    let collisionWrap: { operator: string; operand: string } | undefined
    if (!match) {
      const collision = ctx.extractCollisionDerivation(resolvedParsed)
      if (collision) {
        const collisionParam = ir.metadata.propsParams.find(p => p.name === collision.propName)
        const collisionField = collisionParam
          ? capitalizeFieldName(collisionParam.sourceName ?? collision.propName)
          : null
        if (collisionField && capitalizeFieldName(signal.getter) === collisionField) {
          match = { propName: collision.propName, goFallback: collision.goFallback }
          collisionWrap = { operator: collision.operator, operand: collision.operand }
        }
      }
    }
    if (!match) continue
    if (result.has(match.propName)) continue
    const param = ir.metadata.propsParams.find(p => p.name === match.propName)
    if (!param) continue
    // A destructure default already wins via applyGoFallback.
    if (goPropDefault(param.defaultValue) !== null) continue
    // `PropFallbackVar.fieldName` is read off the INPUT struct (every
    // consumer does `in.${fieldName}`, #2525) — caller-facing, not
    // `match.propName`'s local binding.
    const fieldName = capitalizeFieldName(param.sourceName ?? match.propName)
    // A `??`-consumed optional scalar lowered to `interface{}` (#2248) —
    // detected off the SAME `resolvePropGoType` pipeline the struct
    // generators use, so this can't drift from the emitted field type. The
    // concrete pre-flip type is what the hoisted local materializes as.
    const concreteType = propTypeOverrides.get(param.name) ?? typeInfoToGo(ctx, param.type, param.defaultValue, param.parsed)
    const nullishLowered =
      NULLISH_SCALAR_GO_TYPES.has(concreteType) &&
      resolvePropGoType(ctx, param, propTypeOverrides) === 'interface{}'
    const zeroLiteral = fallbackZeroLiteral(match.goFallback)
    if (zeroLiteral === null) continue
    // Zero-equivalent fallback is a no-op against the Go zero value
    // (`?? 0`, `?? ''`, `?? false`, `?? 0.0`). Compare against the computed
    // zeroLiteral so spelling variants like `0.0` collapse to the same skip
    // as `0`.
    //
    // NOT a no-op for a nillable-lowered prop (#2248): its `interface{}`
    // field can be nil, and the typed hoisted local is what downstream
    // consumers (`Count: size`, memo env maps) assign from — a nil
    // interface into a concrete field is a compile error, so the local
    // must exist even when the fallback equals the zero value.
    if (!nullishLowered) {
      if (match.goFallback === zeroLiteral) continue
      if (zeroLiteral === '0' && Number(match.goFallback) === 0) continue
    }
    // The JSX-side identifier is the natural local name; suffix with `_` if it
    // collides with a Go keyword or a local we already emit.
    let varName = match.propName
    while (localTaken.has(varName) || GO_KEYWORDS.has(varName)) {
      varName += '_'
    }
    localTaken.add(varName)
    result.set(match.propName, {
      varName,
      fieldName,
      goFallback: match.goFallback,
      zeroLiteral,
      ...(nullishLowered ? { assertType: concreteType } : {}),
      ...(collisionWrap ? { collisionWrap } : {}),
    })
  }
  return result
}

/**
 * The Go zero literal for a fallback's literal shape, or null when the
 * fallback is not a hoistable literal. Bool fallbacks (`?? true`) hoist
 * against the `false` zero — the same Go-zero conflation the int / string
 * cases accept: the caller can't distinguish "explicit false" from "unset",
 * the documented SSR-default trade-off.
 */
function fallbackZeroLiteral(goFallback: string): string | null {
  if (goFallback === 'true' || goFallback === 'false') return 'false'
  if (/^-?\d+(\.\d+)?$/.test(goFallback)) return '0'
  if (goFallback.startsWith('"')) return '""'
  return null
}

/**
 * The ONE "seed this signal at constructor time" decision — a hoisted
 * `props.X ?? N` fallback var when one applies, else `convertInitialValue`
 * against `bakeType` (default: the signal's own type). Shared by the
 * top-level signal-field loop (this component's OWN field) and
 * `resolveLocalGetterAsGo` (#2925 — a local getter forwarded as a NESTED
 * child's prop): both answer "what Go value does this signal's getter
 * evaluate to at SSR constructor time," and must agree, or a signal passed
 * bare to a child prop could bake a different value than the signal's own
 * field bakes for itself. `bakeType` is a separate parameter (not always
 * `signal.type`) because the two call sites have different DESTINATIONS:
 * the signal's own field may be typed against a synthesized array-of-
 * objects struct (`state.synthStructTypes`), which isn't assignable into an
 * unrelated child's `Input` field — the child-prop caller keeps
 * `signal.type`.
 */
export function signalSeedGo(
  ctx: GoEmitContext,
  signal: StateSignal,
  propsParams: { name: string; sourceName?: string }[],
  propFallbackVars: ReadonlyMap<string, PropFallbackVar>,
  bakeType: TypeInfo = signal.type,
  nillableDest = false,
): string {
  // A computed prop seed (#3519) is evaluated, the same value every reader gets.
  const computed = ctx.computedSignalSeed(signal, propsParams, propFallbackVars)
  if (computed !== null) return computed
  // `props.X ?? N` reuses the hoisted fallback var so signal and memo share
  // one value.
  const fallbackMatch = ctx.extractPropFallback(signal.initialValue, resolveSignalParsedThroughSeedPlan(ctx.state, signal))
  const hoisted = fallbackMatch ? propFallbackVars.get(fallbackMatch.propName) : undefined
  if (hoisted) return hoisted.varName
  // A nillable seed (#3323) stays whole only into an `interface{}`
  // destination: the signal's own field, or a child Input the child itself
  // made nillable (`ChildComponentShape.nillableParamNames`). A concrete
  // child Input keeps the asserted form.
  const ownNillableField = nillableDest && (
    isNillableSeedSignal(ctx, signal) || propMemberSeedGoType(ctx, signal) === 'interface{}')
  return convertInitialValue(ctx, signal.initialValue, bakeType, propsParams, signal.parsed, ownNillableField)
}
