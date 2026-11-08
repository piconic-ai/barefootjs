/**
 * Prop-type resolution: decide each prop's Go struct-field type.
 *
 * Free functions over a {@link GoEmitContext}, shared by the Input/Props struct
 * generators and the nillable-field set so they can't drift.
 */

import type { ComponentIR, IRMetadata, ParsedExpr } from '@barefootjs/jsx'
import {
  BindingScope,
  arithmeticOperandCoercion,
  collectOperandTyping,
  rewriteNilReadings,
  isNullishTest,
  asCallbackMethodCall,
  collectAbsentPropSeedReads,
  collectNullishAttrContext,
  nullablePropsYieldedBy,
  parseExpression,
  hasComputedDefault,
  inDefaultReadOrder,
  isBooleanAttr,
  isNullableSignal,
} from '@barefootjs/jsx'

import type { GoEmitContext } from '../emit-context.ts'
import { propsObjectKeyRead, resolveSignalParsedThroughSeedPlan } from '../lib/compile-state.ts'
import { applyGoFallback, GO_NATIVE_SAFE, goUndefinedTest } from '../lib/go-emit.ts'
import { capitalizeFieldName } from '../lib/go-naming.ts'
import { collapseLiteralUnion, literalNumberValue, typeInfoToGo, withoutNilMembers } from '../type/type-codegen.ts'
import { bakeSourceKeyedObjectAsGoMap, parsedLiteralToGo } from '../value/parsed-literal-to-go.ts'
import { isOptInputParam, optInputRead } from './input-opt.ts'
import { evalExprGo, evaluatedAsGoType } from '../memo/memo-compute.ts'

/**
 * Build a map from prop name to a better Go type inferred from signals. When a
 * signal is initialized from a prop (`createSignal(props.initial ?? 0)`), the
 * signal's type annotation may be more specific than the prop's `TypeInfo`.
 *
 * Two trigger conditions, mirroring `emitPropsDataFields`'s identical
 * signal-vs-prop reconciliation for the PROPS struct field (`generate - Go
 * struct types` — "Let a specific signal type override a less-specific prop
 * type in either direction"), so the Input/Props field type this override
 * feeds (via `resolvePropGoType`) and the constructor's baked VALUE
 * (`convertInitialValue`'s `seedPassthroughPropName` prop-passthrough
 * shortcut) never disagree about which type is authoritative:
 *
 *   1. A generic prop type (containing `interface{}`) — the historical case.
 *   2. #2674: BOTH sides resolve to a CONCRETE type that DISAGREES — e.g. an
 *      inline array-element prop type (`initialTodos: Array<{ id, text,
 *      done }>`) now independently synthesizes its OWN named struct
 *      (`TodoAppInitialTodosItem`) rather than falling to `interface{}`, but
 *      a signal seeded from it via a shape-widening transform
 *      (`createSignal<Todo[]>((props.initialTodos ?? []).map(t => ({...t,
 *      editing: false})))`, `Todo` carrying an EXTRA `editing` field) still
 *      wants the signal's own `Todo` element type. Before #2674 this case
 *      was unreachable — every inline object/array prop type WAS
 *      `interface{}`-containing, so case 1 always fired — leaving the
 *      passthrough shortcut safe by accident (prop and signal Go types were
 *      always forced equal). Widening to case 2 restores that same
 *      equality now that a prop's own type can independently resolve to
 *      something concrete but narrower.
 */
export function buildPropTypeOverrides(ctx: GoEmitContext, ir: ComponentIR): Map<string, string> {
  const overrides = new Map<string, string>()
  for (const signal of ir.metadata.signals) {
    const propNames = [signal.initialValue]
    const extracted = seedPassthroughPropName(ctx, signal.parsed)
    if (extracted) propNames.push(extracted)

    for (const propName of propNames) {
      const param = ir.metadata.propsParams.find(p => p.name === propName)
      if (!param) continue
      const propGoType = typeInfoToGo(ctx, param.type, param.defaultValue, param.parsed)
      const signalGoType = typeInfoToGo(ctx, signal.type, signal.initialValue, signal.parsed)
      if (signalGoType.includes('interface{}')) continue // never widen TO something less resolved
      if (propGoType.includes('interface{}') || signalGoType !== propGoType) {
        overrides.set(propName, signalGoType)
      }
    }
  }

  return overrides
}

/**
 * Whether `goType` is a scalar a prop's field holds as it is: a primitive or
 * a string-union alias (`type Tone = string`), as opposed to a slice, map,
 * pointer or struct, which is nillable already.
 */
function isScalarPropGoType(ctx: GoEmitContext, goType: string): boolean {
  return NULLISH_SCALAR_GO_TYPES.has(goType) || ctx.state.localTypeAliases.has(goType)
}

/**
 * Concrete scalar Go types eligible for the nullish (`??`) nillable flip in
 * `resolvePropGoType`. Only these can round-trip through an `interface{}`
 * field and back via a constructor type assertion / `bf.ToInt`-style
 * coercion (see the fallback-var emission in `generateNewPropsFunction`).
 */
export const NULLISH_SCALAR_GO_TYPES: ReadonlySet<string> = new Set(['string', 'int', 'float64', 'bool'])

/**
 * The parsed initializers of a component's own (non-module) value consts,
 * the ones a template reads as their initializer (#3494); a function or JSX
 * const is never inlined, so a `??` in its body consumes nothing here.
 */
function computedConstInitializers(ir: ComponentIR): unknown[] {
  return (ir.metadata.localConstants ?? [])
    .filter(c => !c.isModule && !c.containsArrow && !c.isFunctionValue && !c.isJsx && !c.isJsxFunction)
    .map(c => c.parsed)
}

/**
 * The reads whose value a `??` left operand can yield, so whose nil the `??`
 * tests: the operand itself, or, through a `??` / `&&` / `||` or a ternary,
 * each operand or branch that can be its value (`a ?? b ?? c` tests `b` too,
 * #3824 step 7).
 */
function nullishTestedReads(left: ParsedExpr): ParsedExpr[] {
  if (left.kind === 'logical') return [...nullishTestedReads(left.left), ...nullishTestedReads(left.right)]
  if (left.kind === 'conditional') return [...nullishTestedReads(left.consequent), ...nullishTestedReads(left.alternate)]
  return [left]
}

/**
 * Names of OPTIONAL no-default props that directly seed a nullable signal
 * (`createSignal<string | undefined>(props.initial)`) — #3323.
 *
 * The signal's SSR value is the prop's: `undefined` when the caller omits
 * it. A concrete scalar field reads that absence as its zero value (`""`,
 * `0`), so the signal could never be nil and an attribute bound to it
 * (`title={label()}`) would render `title=""` where Hono omits it. These
 * props take the same `interface{}` flip as `??` consumption
 * (`resolvePropGoType`); the signal's own field follows the prop's type
 * and joins the nil-guarded getters (`collectNillableSignalGetters`).
 */
export function collectNullableSignalSeedPropNames(ctx: GoEmitContext, ir: ComponentIR): Set<string> {
  const optionalParams = new Set(
    ir.metadata.propsParams.filter(p => p.optional && p.defaultValue == null).map(p => p.name),
  )
  const names = new Set<string>()
  if (optionalParams.size === 0) return names
  for (const signal of ir.metadata.signals) {
    if (!isNullableSignal(signal)) continue
    const name = bareSeedPropName(ctx, signal.parsed)
    if (name !== null && optionalParams.has(name)) names.add(name)
  }
  // A seed that can evaluate to an absent optional prop, read whole or
  // through a ternary branch or a `??` / `||` / `&&` operand (#3567), reads
  // that prop the same way: its field must hold the prop's JS value for the
  // seed to. A primitive prop and a slice, map or object one hold it
  // (`resolvePropGoType`), so the signal does too: an omitted prop seeds
  // `undefined`, an explicit `null` seeds `null`.
  const primitiveParams = new Set(
    ir.metadata.propsParams
      .filter(p => optionalParams.has(p.name) && (p.type?.kind === 'primitive' || isNonScalarPropGoType(ctx, typeInfoToGo(ctx, p.type, p.defaultValue, p.parsed))))
      .map(p => p.name),
  )
  for (const reads of collectAbsentPropSeedReads(ir).values()) {
    for (const name of reads) if (primitiveParams.has(name)) names.add(name)
  }
  return names
}

/** The prop a signal seed reads whole (`initial` / `props.initial`), else null. */
export function bareSeedPropName(ctx: GoEmitContext, parsed: ParsedExpr | undefined): string | null {
  if (!parsed) return null
  const propsObject = ctx.state.propsObjectName
  if (parsed.kind === 'identifier') return propsObject ? null : parsed.name
  if (
    parsed.kind === 'member' &&
    !parsed.computed &&
    parsed.object.kind === 'identifier' &&
    parsed.object.name === propsObject
  ) {
    return parsed.property
  }
  return null
}

/**
 * The prop a signal seed passes through (#3540), read off the parsed seed:
 * `props.X` on the left of `??` / `||` (or `x ?? …` in a destructured
 * component), and the row seed `(props.X ?? []).map(cb)`, which bakes as the
 * prop's own rows (the shape example apps seed a list from; a mapped field
 * the prop lacks starts at its Go zero value). Its consumers type the
 * signal's field and the prop's field alike, and seed the signal from the
 * prop; a bare `props.X` / `x` is `bareSeedPropName`'s. Null for any other
 * seed, which the runtime evaluator computes or which refuses.
 */
export function seedPassthroughPropName(ctx: GoEmitContext, parsed: ParsedExpr | undefined): string | null {
  if (!parsed) return null
  const propsObject = ctx.state.propsObjectName
  const fallbackOf = (e: ParsedExpr): string | null => {
    if (e.kind !== 'logical' || (e.op !== '??' && e.op !== '||')) return null
    if (!propsObject) return e.left.kind === 'identifier' ? e.left.name : null
    return bareSeedPropName(ctx, e.left)
  }
  if (!propsObject) return fallbackOf(parsed)
  const direct = bareSeedPropName(ctx, parsed) ?? fallbackOf(parsed)
  if (direct !== null) return direct
  const rows = asCallbackMethodCall(parsed)
  return rows?.method === 'map' ? fallbackOf(rows.object) : null
}

/**
 * The prop a bare attribute or text value reads whole: a bare identifier
 * (`rows`), or a props-object key (`props.rows` / `props['rows']`,
 * `propsObjectKeyRead`). Null for any other value, or an unparsed one.
 */
function barePropReadName(propsObject: string | null, parsed: ParsedExpr | undefined): string | null {
  if (!parsed) return null
  if (parsed.kind === 'identifier') return parsed.name
  return propsObjectKeyRead(propsObject, parsed)
}

/**
 * The props an omittable attribute's value reads whole: a bare read, and a
 * prop the value can be read whole from (`on && 'y'`, a ternary branch),
 * whose absence omits the attribute (`attrValueMayBeNullish`).
 */
function omittableAttrPropReads(
  attr: { name: string; value: Record<string, unknown> },
  propsObject: string | null,
  nullableProps: ReadonlyMap<string, string>,
): string[] {
  if (isBooleanAttr(attr.name)) return []
  if (attr.value?.kind !== 'expression' || attr.value.presenceOrUndefined) return []
  const parsed = attr.value.parsed as ParsedExpr | undefined
  const bare = barePropReadName(propsObject, parsed)
  return [...(bare === null ? [] : [bare]), ...nullablePropsYieldedBy(parsed, nullableProps)]
}

/**
 * Resolve a prop param's Go struct-field type using the SAME logic
 * `generatePropsStruct` / `generateInputStruct` use: a `propTypeOverrides` entry
 * wins, otherwise `typeInfoToGo(param.type, param.defaultValue, param.parsed)`.
 * Factored out so
 * the nillable-field set (`collectNillablePropNames`) can't drift from the
 * emitted field types.
 */
/**
 * The Go value of a destructured prop binding with its destructure default
 * applied, read off the input struct: the props field it initializes and the
 * runtime evaluator's environment both read it (#3540). Null when the binding
 * has no literal default.
 *
 * The input field may be `interface{}` although the binding's own type is
 * concrete: the Input struct declares a caller-facing field once, typed by its
 * first `propsParams` entry, and a second binding of the same name (a renamed
 * body destructure `{ label: text = 'none' }` beside a raw `props.label` read
 * under `??`) can lose that nillable flip (#2943). The zero-value check of
 * `applyGoFallback` would not compile there, so it nil-checks and asserts back
 * to the binding's type instead.
 */
export function defaultedBindingGo(
  ctx: GoEmitContext,
  param: IRMetadata['propsParams'][number],
  propsParams: IRMetadata['propsParams'],
  propTypeOverrides: Map<string, string>,
): string | null {
  const inputField = capitalizeFieldName(param.sourceName ?? param.name)
  const outputType = resolvePropGoType(ctx, param, propTypeOverrides)
  const fieldOwner = propsParams.find(p => capitalizeFieldName(p.sourceName ?? p.name) === inputField)
  const inputType = fieldOwner ? resolvePropGoType(ctx, fieldOwner, propTypeOverrides) : undefined
  // An array / object literal default on a slice or map binding whose Input
  // field holds the JS value (a raw read shares it): applied to an undefined
  // prop only. On a field of its own the constructor's `in` applies it
  // already (`optDefaultedInputRead`).
  const nonScalarDefault = nonScalarLiteralDefaultGo(ctx, param, outputType)
  if (nonScalarDefault !== null) {
    if (!sharesInputField(param, propsParams) || inputType !== 'interface{}') return null
    return `func() ${outputType} { if bf.IsUndefined(in.${inputField}) { return ${nonScalarDefault} }; return bf.Coerce(*new(${outputType}), in.${inputField}) }()`
  }
  const paramDefault = propLiteralDefaultGo(param)
  if (paramDefault === null) return sharedDependentDefaultGo(ctx, param, propsParams, propTypeOverrides)
  if (inputType === 'interface{}') {
    // The default applies to an undefined prop only: an explicit `null`
    // stays (decision 6).
    const read = outputType === 'interface{}' ? `in.${inputField}` : `bf.Coerce(*new(${outputType}), in.${inputField})`
    return `func() ${outputType} { if ${goUndefinedTest(`in.${inputField}`, inputType)} { return ${paramDefault} }; return ${read} }()`
  }
  return applyGoFallback(`in.${inputField}`, paramDefault)
}

/**
 * The constructor statements that apply a computed destructure default
 * (`hasComputedDefault`): one reading an earlier prop (`{ a, b = a }`,
 * `{ off = false, on = !off }`, `ParamInfo.defaultParts`, #3531) or any other
 * non-literal one (`{ n = 'abc'.length }`), or a non-zero literal one (`{ a = 'x' }`),
 * to the Input itself ({@link appliesDefaultOnNil}), before anything reads
 * it: `if in.B == nil { in.B = <default> }`, one prop at a time in the
 * defaults' read order (`inDefaultReadOrder`). Every later `in.B` read, a
 * signal seed, a memo, a child prop or the Props field, then sees the
 * resolved binding in the field's own Go type, so no reader needs a path of
 * its own. Such a prop's field is nillable: a slice, map or pointer is, and a
 * scalar is flipped to `interface{}` ({@link resolvePropGoType}), so an
 * explicit `false` / `''` / `0` stays the caller's value.
 *
 * A default reading one earlier prop is that prop's resolved Go value
 * (`in.A`, or its own literal default). Any other default is computed by the
 * runtime evaluator, which takes a scalar, or anything into an `interface{}`
 * field. `rawLocals` keeps each caller value `bfCallerProps` reads
 * (`keepsCallerValue`), by Input field, and
 * `unsupported` names the props whose default reads an earlier prop and
 * can't be applied this way (the caller refuses them loudly); any other
 * computed default the evaluator can't build is left unapplied.
 */
export function dependentDefaultNormalization(
  ctx: GoEmitContext,
  propsParams: IRMetadata['propsParams'],
  propTypeOverrides: Map<string, string>,
  keepsCallerValue: (param: IRMetadata['propsParams'][number]) => boolean,
): { lines: string[]; rawLocals: Map<string, string>; unsupported: string[] } {
  const lines: string[] = []
  const rawLocals = new Map<string, string>()
  const unsupported: string[] = []
  for (const param of inDefaultReadOrder(propsParams)) {
    if (param.isRest || !param.parsed || !appliesDefaultOnNil(param)) continue
    // A binding sharing its Input field with another one (a renamed body
    // destructure beside a raw `props.b` read) can't change `in`: the other
    // reads the caller's value. Its own reads take
    // `sharedDependentDefaultGo` instead, refused here like any other default
    // the constructor can't build.
    if (sharesInputField(param, propsParams)) {
      if (param.defaultParts && sharedDependentDefaultGo(ctx, param, propsParams, propTypeOverrides) === null) unsupported.push(param.name)
      continue
    }
    const field = capitalizeFieldName(param.sourceName ?? param.name)
    const goType = resolvePropGoType(ctx, param, propTypeOverrides)
    // A literal default on a field that stays concrete (a string-union prop,
    // a required one) keeps `defaultedBindingGo`'s zero-value test.
    if (!hasComputedDefault(param) && !isNillableGoType(goType)) continue
    const value = isNillableGoType(goType) ? dependentDefaultGo(ctx, param, goType, propsParams, propTypeOverrides) : null
    if (value === null) {
      // A default reading an earlier prop is refused. Any other computed one
      // the evaluator can't build (a callback, a module const) is left
      // unapplied, as before, and tracked as a render divergence.
      if (param.defaultParts) unsupported.push(param.name)
      continue
    }
    if (keepsCallerValue(param)) {
      const raw = `bfCaller${field}`
      rawLocals.set(field, raw)
      lines.push(`\t${raw} := in.${field}`)
    }
    lines.push(`\tif ${defaultAppliesTest(param, field, goType)} {`)
    lines.push(`\t\tin.${field} = ${value}`)
    lines.push('\t}')
  }
  if (lines.length > 0) lines.push('')
  return { lines, rawLocals, unsupported }
}

/** Whether another binding reads `param`'s caller-facing Input field (`{ b: local = a }` beside `props.b`). */
function sharesInputField(param: IRMetadata['propsParams'][number], propsParams: IRMetadata['propsParams']): boolean {
  const key = param.sourceName ?? param.name
  return propsParams.some(p => p !== param && !p.isRest && (p.sourceName ?? p.name) === key)
}

/**
 * {@link defaultedBindingGo} for a binding with a computed default
 * (`hasComputedDefault`) whose Input field another binding also reads, so the default is
 * not applied to `in` (`dependentDefaultNormalization`): the binding's own
 * value, the default when the field is nil. Null for any other binding, or
 * when the field can't tell an absent prop apart.
 */
function sharedDependentDefaultGo(
  ctx: GoEmitContext,
  param: IRMetadata['propsParams'][number],
  propsParams: IRMetadata['propsParams'],
  propTypeOverrides: Map<string, string>,
): string | null {
  if (!hasComputedDefault(param) || !param.parsed || !sharesInputField(param, propsParams)) return null
  const key = param.sourceName ?? param.name
  const owner = propsParams.find(p => !p.isRest && (p.sourceName ?? p.name) === key) ?? param
  const inputType = resolvePropGoType(ctx, owner, propTypeOverrides)
  const outputType = resolvePropGoType(ctx, param, propTypeOverrides)
  if (!isNillableGoType(inputType)) return null
  const value = dependentDefaultGo(ctx, param, outputType, propsParams, propTypeOverrides)
  if (value === null) return null
  const field = `in.${capitalizeFieldName(key)}`
  const read = outputType === inputType || outputType === 'interface{}' ? field : `bf.Coerce(*new(${outputType}), ${field})`
  return `func() ${outputType} { if ${goUndefinedTest(field, inputType)} { return ${value} }; return ${read} }()`
}

/**
 * A binding's value as an evaluator environment entry when only the runtime
 * evaluator can build its destructure default (one that passes a callback,
 * `{ b: local = ['y', ''].filter((x) => x !== '') }`): the caller's value,
 * or the evaluated default when the Input field is nil. Null for a binding
 * without such a default, or when the field can't tell an absent prop apart.
 */
export function evaluatedDefaultBindingGo(
  ctx: GoEmitContext,
  param: IRMetadata['propsParams'][number],
  propsParams: IRMetadata['propsParams'],
  propTypeOverrides: Map<string, string>,
): string | null {
  if (param.defaultValue === undefined || !param.parsed || param.defaultParts) return null
  const key = param.sourceName ?? param.name
  const owner = propsParams.find(p => !p.isRest && (p.sourceName ?? p.name) === key) ?? param
  const ownerType = resolvePropGoType(ctx, owner, propTypeOverrides)
  if (!isNillableGoType(ownerType)) return null
  const value = evalExprGo(ctx, param.parsed, [], propsParams, new Map(), new Set())
  if (value === null) return null
  const field = `in.${capitalizeFieldName(key)}`
  return `func() any { if ${goUndefinedTest(field, ownerType)} { return ${value} }; return ${field} }()`
}

function isNillableGoType(goType: string): boolean {
  return goType === 'interface{}' || goType === 'any' || goType.startsWith('[]') || goType.startsWith('map[') || goType.startsWith('*')
}

/** The Go value of `param`'s literal or computed default, in its field's type `goType`; null when it can't be built. */
function dependentDefaultGo(
  ctx: GoEmitContext,
  param: IRMetadata['propsParams'][number],
  goType: string,
  propsParams: IRMetadata['propsParams'],
  propTypeOverrides: Map<string, string>,
): string | null {
  const parsed = param.parsed!
  // A literal default (`{ a = 'x' }`) is its own Go literal.
  if (!hasComputedDefault(param)) return propLiteralDefaultGo(param)
  const ref = parsed.kind === 'identifier' ? propsParams.find(p => !p.isRest && p.name === parsed.name) : undefined
  if (ref) {
    const refType = resolvePropGoType(ctx, ref, propTypeOverrides)
    if (goType !== 'interface{}' && goType !== 'any' && refType !== goType) return null
    // An earlier dependent prop is already resolved on `in`; a literal
    // default applies here.
    return defaultedBindingGo(ctx, ref, propsParams, propTypeOverrides) ?? `in.${capitalizeFieldName(ref.sourceName ?? ref.name)}`
  }
  const evaluated = evalExprGo(ctx, parsed, [], propsParams, new Map(), new Set())
  return evaluated === null ? null : evaluatedAsGoType(evaluated, goType)
}

/**
 * Whether prop `propName` of the component being compiled lowers to a
 * concrete Go `string` input field, so `in.<Field>` is a Go string operand
 * as it is. A nillable (`interface{}`) or number field is not: a
 * concatenation over it is computed by the evaluator instead.
 */
export function isConcreteStringPropField(ctx: GoEmitContext, propName: string): boolean {
  const binding = ctx.state.currentPropsParams.find(p => p.name === propName)
  return binding !== undefined && resolvePropGoType(ctx, binding, ctx.state.propTypeOverrides) === 'string'
}

/**
 * Whether prop `propName` is a string prop whose field holds the JS value
 * (`interface{}`: `bf.Undefined` for an omitted prop, nil for `null`), so a
 * concatenation spells it through `bf.ToString`.
 */
export function isNillableStringPropField(ctx: GoEmitContext, propName: string): boolean {
  const binding = ctx.state.currentPropsParams.find(p => p.name === propName)
  if (!binding || resolvePropGoType(ctx, binding, ctx.state.propTypeOverrides) !== 'interface{}') return false
  return typeInfoToGo(ctx, binding.type) === 'string' || ctx.state.localTypeAliases.has(typeInfoToGo(ctx, binding.type))
}

export function resolvePropGoType(
  ctx: GoEmitContext,
  param: IRMetadata['propsParams'][number],
  propTypeOverrides: Map<string, string>,
): string {
  const base = propTypeOverrides.get(param.name) ?? typeInfoToGo(ctx, param.type, param.defaultValue, param.parsed)
  // An OPTIONAL prop typed as a named struct (`opts?: EmblaOptionsType`) lowers
  // to `map[string]interface{}`, not the value struct: a value struct is always
  // truthy in Go templates (so a `{{if .Opts}}`-guarded attribute could never be
  // omitted), whereas a nil/empty map is falsy and round-trips through `bf_json`
  // with only the supplied keys — matching JS `JSON.stringify` of a partial
  // object instead of a zero-filled struct.
  // Gate on `localStructFields` (an actual generated struct), NOT
  // `localTypeNames` — the latter also covers string-union aliases
  // (`placement?: 'top' | 'right' | …`), which must stay their scalar Go type.
  // An OPTIONAL non-scalar prop without a default (a slice, a map, an object
  // type) holds its JS value as well (`interface{}`, read off its Input's
  // `bf.Opt[T]` by `optInputRead`): `bf.Undefined` for an omitted prop, nil
  // for an explicit `null`. A typed slice or map could only hold nil for
  // both. A reader that needs the typed value takes it through `bf.Coerce`
  // (`nillableAwarePropRef`), so the two collapse only where nothing can
  // tell them apart. A defaulted one keeps its type: its default applies to
  // an undefined prop only (`optDefaultedInputRead`), so its nil is `null`.
  if (param.optional && param.defaultValue == null && isNonScalarPropGoType(ctx, base)) {
    return 'interface{}'
  }
  if (param.optional && ctx.state.localStructFields.has(base)) {
    return 'map[string]interface{}'
  }
  // An OPTIONAL scalar prop without a default lowers to `interface{}`: the
  // field holds the JS value (spec/js-undefined-value.md §3, rollout step
  // U8), `bf.Undefined` for an omitted prop and nil for an explicit `null`,
  // read off its Input's `bf.Opt[T]` (`optInputRead`). A concrete
  // `string` / `float64` field could hold neither. A literal default
  // (`{ tag = 'z' }`, `{ n = 0 }`, `{ on = true }`) and a default that reads
  // an earlier prop (`{ off = false, on = off }`, #3531) apply to an
  // undefined prop only (`appliesDefaultOnNil`,
  // `dependentDefaultNormalization`), which the constructor tells apart the
  // same way: an explicit `null` and an explicit `false` / `''` / `0` stay
  // the caller's value.
  if (param.optional && (param.defaultValue == null || appliesDefaultOnNil(param)) && isScalarPropGoType(ctx, base)) {
    return 'interface{}'
  }
  return base
}

/**
 * When the constructor applies `param`'s destructure default to `in.<field>`
 * (`dependentDefaultNormalization`): the prop is undefined. A typed field's
 * nil is `null`, which keeps it, so the Input's own state tells an undefined
 * prop apart there.
 */
function defaultAppliesTest(param: IRMetadata['propsParams'][number], field: string, goType: string): string {
  return isOptInputParam(param) && goType !== 'interface{}'
    ? `input.${field}.IsUndefined()`
    : goUndefinedTest(`in.${field}`, goType)
}

/**
 * The Go value of `param`'s array or object literal destructure default
 * (`{ items = [] }`, `{ opts = { a: 'x' } }`) on a slice, map or `interface{}`
 * field of Go type `goType`: never nil, so it stays apart from an explicit `null`. Null
 * for any other default or field.
 */
export function nonScalarLiteralDefaultGo(
  ctx: GoEmitContext,
  param: IRMetadata['propsParams'][number],
  goType: string,
): string | null {
  const parsed = param.parsed
  if (param.isRest || param.defaultValue == null || !parsed || hasComputedDefault(param)) return null
  const boxed = goType === 'interface{}'
  if (parsed.kind === 'array-literal' && (boxed || goType.startsWith('[]'))) return arrayLiteralDefaultGo(ctx, param, parsed, goType)
  if (parsed.kind === 'object-literal' && (boxed || goType.startsWith('map['))) {
    return bakeSourceKeyedObjectAsGoMap(ctx, parsed) ?? evaluatedLiteralGo(ctx, parsed, goType)
  }
  return null
}

/** {@link nonScalarLiteralDefaultGo} for an array literal default. */
function arrayLiteralDefaultGo(
  ctx: GoEmitContext,
  param: IRMetadata['propsParams'][number],
  parsed: Extract<ParsedExpr, { kind: 'array-literal' }>,
  goType: string,
): string | null {
  const boxed = goType === 'interface{}'
  const type = param.type ? withoutNilMembers(param.type) : undefined
  // An empty one is an empty slice, which `parsedLiteralToGo` leaves to the
  // field's nil.
  if (parsed.elements.length === 0) {
    const sliceType = boxed ? (type ? typeInfoToGo(ctx, type) : '') : goType
    return `${sliceType.startsWith('[]') ? sliceType : '[]interface{}'}{}`
  }
  const go = parsedLiteralToGo(ctx, parsed, type)
  if (go !== null && (boxed ? go.startsWith('[]') : go.startsWith(goType + '{'))) return go
  return evaluatedLiteralGo(ctx, parsed, goType)
}

/**
 * Literal data no Go literal spells for `goType` (an object row of an
 * `[]interface{}` field), built by the runtime evaluator and shaped as
 * `goType` by `bf.Coerce`.
 */
function evaluatedLiteralGo(ctx: GoEmitContext, parsed: ParsedExpr, goType: string): string | null {
  const evaluated = evalExprGo(ctx, parsed, [], [], new Map(), new Set())
  if (evaluated === null) return null
  return goType === 'interface{}' ? evaluated : `bf.Coerce(*new(${goType}), ${evaluated})`
}

/**
 * How the constructor's `in` reads the Input field of `param`, a prop with an
 * array or object literal default on a slice, map or `interface{}` field of its own
 * (`nonScalarLiteralDefaultGo`): the default when the prop is undefined, its
 * value (nil for `null`) otherwise. Null for any other prop, which
 * `optInputRead` reads.
 */
export function optDefaultedInputRead(
  ctx: GoEmitContext,
  param: IRMetadata['propsParams'][number],
  propsParams: IRMetadata['propsParams'],
  goType: string,
): string | null {
  if (sharesInputField(param, propsParams)) return null
  const value = nonScalarLiteralDefaultGo(ctx, param, goType)
  if (value === null) return null
  const field = capitalizeFieldName(param.sourceName ?? param.name)
  return `func() ${goType} { if input.${field}.IsUndefined() { return ${value} }; return ${optInputRead(field, goType)} }()`
}

/** Whether `goType` is a slice, a map or a generated struct: a value a template ranges over or reads members of. */
export function isNonScalarPropGoType(ctx: GoEmitContext, goType: string): boolean {
  return goType.startsWith('[]') || goType.startsWith('map[') || ctx.state.localStructFields.has(goType)
}

/**
 * Whether the constructor applies `param`'s destructure default to its Input
 * field when the field is nil (`dependentDefaultNormalization`), which a
 * scalar field is boxed for ({@link resolvePropGoType}): a computed default
 * (`hasComputedDefault`: one reading an earlier prop, `{ a, b = a }`, #3531,
 * or any other non-literal one, `{ n = 'abc'.length }`), or a scalar literal
 * one ({@link hasScalarLiteralDefault}).
 */
export function appliesDefaultOnNil(param: IRMetadata['propsParams'][number]): boolean {
  return hasComputedDefault(param) || hasScalarLiteralDefault(param)
}

/**
 * Whether `param`'s destructure default is a scalar literal (`{ a = 'x' }`,
 * `{ n = 0 }`, `{ on = false }`). The default applies to an undefined prop
 * only, so an explicit `null`, and an explicit `''` / `0` / `false` beside a
 * non-zero default, must stay the caller's value: a concrete field reads
 * all of them as its zero value, which only the JS value can tell apart. A
 * zero default (`{ a = '' }`) is no exception: `null` is not `''`.
 */
function hasScalarLiteralDefault(param: IRMetadata['propsParams'][number]): boolean {
  if (param.defaultValue == null) return false
  return scalarLiteralDefault(param) !== null
}

/**
 * The value of `param`'s destructure default when it is a scalar literal
 * (`'x'`, `2`, `-1e3`, `0x10`, `true`), read off the parsed tree; null for
 * any other shape. The single classification both the nil-boxing decision
 * ({@link hasScalarLiteralDefault}) and the Go literal it applies
 * ({@link propLiteralDefaultGo}) read, so a spelling one accepts the other
 * can always emit.
 */
function scalarLiteralDefault(param: IRMetadata['propsParams'][number]): string | number | boolean | null {
  const parsed = param.parsed
  if (!parsed) return null
  const number = literalNumberValue(parsed)
  if (number !== null) return number
  if (parsed.kind !== 'literal') return null
  if (parsed.literalType === 'string' || parsed.literalType === 'boolean') return parsed.value
  return null
}

/**
 * The Go literal of `param`'s scalar literal destructure default, spelled from
 * its parsed value rather than its source text: `1e3`, `0x10`, `.5`, `1_000`
 * all yield the same number, and a string default carries its decoded value
 * (`'a\nb'` holds a newline), re-quoted for Go. Null when the default is not
 * a scalar literal or has no finite Go spelling.
 *
 * A number is spelled as an untyped FLOAT constant (`2.0`, `0.5`,
 * `100000000000000000000.0`, `1e+21`): boxed into an `interface{}` field it
 * holds a `float64`, the type a JSON-decoded caller number takes and the one
 * `bf.Text` / `bf.String` spell as JS `String(n)` does. An integer
 * constant would box as `int`, and one past int64 (`1e20`) would not
 * compile at all.
 */
export function propLiteralDefaultGo(param: IRMetadata['propsParams'][number]): string | null {
  const value = scalarLiteralDefault(param)
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number' && Number.isFinite(value)) return goFloatConstant(value)
  return null
}

/** `value` as a Go untyped float constant: JS `String` spelling, with `.0` when it has neither a point nor an exponent. */
function goFloatConstant(value: number): string {
  const text = String(value)
  return /[.e]/.test(text) ? text : `${text}.0`
}

/**
 * Build the set of prop NAMES whose resolved Go field type is exactly
 * `interface{}` (nillable, for Hono-style attribute omission). Uses the same
 * `propTypeOverrides` + `resolvePropGoType` pipeline as the struct generators;
 * the caller passes the overrides map it stashed on the compile state.
 * Concrete (`string`/`int`/`bool`/`[]T`/struct) types are excluded.
 */
export function collectNillablePropNames(
  ctx: GoEmitContext,
  ir: ComponentIR,
  propTypeOverrides: Map<string, string>,
): Set<string> {
  const nillable = new Set<string>()
  for (const param of ir.metadata.propsParams) {
    if (resolvePropGoType(ctx, param, propTypeOverrides) === 'interface{}') {
      nillable.add(param.name)
    }
  }
  return nillable
}
