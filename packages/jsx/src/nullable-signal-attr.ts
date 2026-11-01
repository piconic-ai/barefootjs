/**
 * Nullish-attribute omission for signal reads (#3304).
 *
 * Hono omits an attribute whose value is `undefined` or `null`
 * (`title={s()}` with `s()` undefined renders no `title`). A DSL adapter
 * emits `name="<value>"` unconditionally, so a nil value renders
 * `title=""` unless the adapter guards the attribute on a nil check. Each
 * DSL adapter already guards a bare reference to a no-default optional prop
 * that way; this module is the one decision for the signal half, which
 * every adapter consults instead of re-deriving it.
 *
 * Only the SSR value matters here — a signal's SSR value is its initial
 * value — and the guard is presence-only: a non-nil value renders exactly
 * as it did unguarded, so over-including a signal never changes output for
 * a non-nil value.
 */

import type { ParsedExpr } from './expression-parser.ts'
import { isBooleanResultParsed } from './adapters/boolean-result.ts'
import { BindingScope } from './scope/binding-scope.ts'
import type { ComponentIR, IRMetadata, MemoInfo, SignalInfo, TypeInfo } from './types.ts'

function isNullishType(type: TypeInfo): boolean {
  return type.kind === 'primitive' && (type.primitive === 'undefined' || type.primitive === 'null')
}

/** `T | undefined` / `T | null`, or bare `undefined` / `null`. */
function admitsNullish(type: TypeInfo): boolean {
  if (isNullishType(type)) return true
  return type.kind === 'union' && (type.unionTypes ?? []).some(isNullishType)
}

/** `undefined` / `null` as a parsed initial value. */
export function isNullishLiteral(expr: ParsedExpr | undefined): boolean {
  if (!expr) return false
  if (expr.kind === 'identifier') return expr.name === 'undefined'
  return expr.kind === 'literal' && expr.literalType === 'null'
}

/**
 * Whether the signal's SSR value can be nullish. The witness is its type
 * admitting `undefined`/`null` (a zero-arg `createSignal<T>()` is typed
 * `T | undefined`, #3215), or, for an untyped signal, a literal `undefined` /
 * `null` initial value.
 */
export function isNullableSignal(signal: SignalInfo): boolean {
  if (admitsNullish(signal.type)) return true
  return signal.type.kind === 'unknown' && isNullishLiteral(signal.parsed)
}

/**
 * Getter names of the component's signals whose SSR value can be nullish:
 * a nullable signal (`isNullableSignal`), or one whose seed can evaluate to
 * an absent optional prop (`createSignal(props.label)`,
 * `createSignal(wide ? props.label : 'narrow')`, #3567). The seed is read in
 * the form the SSR seed plan resolved it to, so a hop through a
 * component-scope const counts too.
 */
export function collectNullableSignalGetters(ir: ComponentIR): Set<string> {
  const absentReads = collectAbsentPropSeedReads(ir)
  return new Set(
    (ir.metadata.signals ?? []).filter(s => isNullableSignal(s) || absentReads.has(s.getter)).map(s => s.getter),
  )
}

/**
 * For each signal whose seed can evaluate to an absent optional prop, the
 * props (by param name) it can read whole (#3567). The seed is read in the
 * form the SSR seed plan resolved it to. A backend that types a prop by
 * value (Go) flips each of these props to a nillable field so the absence
 * survives into the signal.
 */
export function collectAbsentPropSeedReads(ir: ComponentIR): Map<string, Set<string>> {
  const nullableProps = collectNullablePropReads(ir)
  const out = new Map<string, Set<string>>()
  if (nullableProps.size === 0) return out
  const resolved = new Map<string, ParsedExpr>()
  for (const step of ir.metadata.ssrSeedPlan?.steps ?? []) {
    if (step.kind === 'derived' && step.origin === 'signal') resolved.set(step.name, step.parsed)
  }
  for (const s of ir.metadata.signals ?? []) {
    const reads = new Set<string>()
    collectSeedPropReads(resolved.get(s.getter) ?? s.parsed, nullableProps, reads)
    if (reads.size > 0) out.set(s.getter, reads)
  }
  return out
}

/**
 * Reads of a prop that can be absent at SSR time (optional or typed with
 * `undefined` / `null`, no default, not a rest param): the name a read
 * uses (the binding name, or `<propsObjectName>.<key>` for a member read)
 * mapped to the param name.
 */
function collectNullablePropReads(ir: ComponentIR): ReadonlyMap<string, string> {
  const names = new Map<string, string>()
  const objectName = ir.metadata.propsObjectName
  for (const p of ir.metadata.propsParams) {
    if (p.isRest || p.defaultValue !== undefined) continue
    if (!p.optional && !(p.type && admitsNullish(p.type))) continue
    names.set(objectName ? `${objectName}.${p.sourceName ?? p.name}` : p.name, p.name)
  }
  return names
}

/** A required string / number / boolean, or a union of them: a value that is never nullish. */
function isNonNullishScalar(type: TypeInfo | undefined): boolean {
  if (!type) return false
  if (type.kind === 'union') return (type.unionTypes ?? []).length > 0 && (type.unionTypes ?? []).every(isNonNullishScalar)
  return type.kind === 'primitive' && (type.primitive === 'string' || type.primitive === 'number' || type.primitive === 'boolean')
}

/**
 * Whether `expr` is never `undefined` / `null` at SSR, so JS `expr ?? y` is
 * `expr`, even when it is `false`, `''` or `0`: a boolean-result expression
 * (a comparison, `!`, a boolean literal, `isBooleanResultParsed`), or a read
 * of a required (not optional, not rest) prop declared as a string, number
 * or boolean, or a union of them, read as its binding (`flag`) or as
 * `<propsObjectName>.<key>`, with no binding shadowing the read.
 */
export function isNeverNullishOperand(
  expr: ParsedExpr,
  metadata: Pick<IRMetadata, 'propsParams' | 'propsObjectName'>,
  isBound: (name: string) => boolean,
): boolean {
  if (isBooleanResultParsed(expr)) return true
  const objectName = metadata.propsObjectName
  let matches: (p: IRMetadata['propsParams'][number]) => boolean
  if (objectName && expr.kind === 'member' && !expr.computed && expr.object.kind === 'identifier' && expr.object.name === objectName) {
    if (isBound(objectName)) return false
    matches = p => (p.sourceName ?? p.name) === expr.property
  } else if (!objectName && expr.kind === 'identifier') {
    if (isBound(expr.name)) return false
    matches = p => p.name === expr.name
  } else {
    return false
  }
  const param = metadata.propsParams.find(matches)
  return !!param && !param.optional && !param.isRest && isNonNullishScalar(param.declaredType ?? param.type)
}

/**
 * The params of `nullableProps` (`NullishAttrContext.nullableProps`) that
 * `expr`'s value can be read whole from (`collectSeedPropReads`): the props
 * whose absence an attribute bound to `expr` omits it for. A backend that
 * types a prop by value (Go) makes these props nillable.
 */
export function nullablePropsYieldedBy(
  expr: ParsedExpr | undefined,
  nullableProps: ReadonlyMap<string, string>,
): Set<string> {
  const out = new Set<string>()
  collectSeedPropReads(expr, nullableProps, out)
  return out
}

/**
 * Add to `out` the params of `nullableProps` a seed's value can be read
 * whole from: a bare read, a ternary branch, the right operand of `??` /
 * `||`, or either operand of `&&`. A call, a member read past the prop, or
 * any other shape produces its own value, so it does not count.
 */
function collectSeedPropReads(
  expr: ParsedExpr | undefined,
  nullableProps: ReadonlyMap<string, string>,
  out: Set<string>,
): void {
  if (!expr) return
  const add = (key: string): void => {
    const param = nullableProps.get(key)
    if (param !== undefined) out.add(param)
  }
  switch (expr.kind) {
    case 'identifier':
      add(expr.name)
      return
    case 'member':
      if (!expr.computed && expr.object.kind === 'identifier') add(`${expr.object.name}.${expr.property}`)
      return
    case 'conditional':
      collectSeedPropReads(expr.consequent, nullableProps, out)
      collectSeedPropReads(expr.alternate, nullableProps, out)
      return
    case 'logical':
      if (expr.op === '&&') collectSeedPropReads(expr.left, nullableProps, out)
      collectSeedPropReads(expr.right, nullableProps, out)
      return
    default:
      return
  }
}

/**
 * The getter an attribute value reads when the whole value is a bare,
 * zero-argument getter call (`s()`); `null` for any other shape. A member
 * read, a ternary or a template literal around the call is not matched:
 * the attribute's presence then depends on more than the signal.
 */
export function bareGetterCallName(parsed: ParsedExpr | undefined): string | null {
  if (!parsed || parsed.kind !== 'call' || parsed.args.length !== 0) return null
  return parsed.callee.kind === 'identifier' ? parsed.callee.name : null
}

/**
 * The signal getter whose nil check should guard this attribute, or `null`
 * when the attribute is not a bare read of a nullable signal. `nullable` is
 * the set `collectNullableSignalGetters` built for the component.
 */
export function nullableSignalAttrGetter(
  parsed: ParsedExpr | undefined,
  nullable: ReadonlySet<string>,
): string | null {
  const getter = bareGetterCallName(parsed)
  return getter !== null && nullable.has(getter) ? getter : null
}

/**
 * What `attrValueMayBeNullish` needs to know about the component: its
 * nullable signal getters and its memos by name.
 */
export interface NullishAttrContext {
  readonly nullableSignals: ReadonlySet<string>
  /** Signals seeded with a literal `null`: their SSR value is `null`, not
   * `undefined` (`arithmeticOperandIsNull`). */
  readonly nullSeededSignals?: ReadonlySet<string>
  /** Signals seeded with `undefined` (`createSignal(undefined)` or a
   * zero-arg `createSignal()`): their SSR value is `undefined`, not `null`
   * (`arithmeticOperandIsUndefined`). */
  readonly undefinedSeededSignals?: ReadonlySet<string>
  readonly memos: ReadonlyMap<string, MemoInfo>
  /** Props that can be absent or `null` at SSR (no default, optional or
   * typed with `undefined` / `null`), by the name a read uses
   * (`collectNullablePropReads`). */
  readonly nullableProps?: ReadonlyMap<string, string>
  /** Props declared as a number that may be `null` or absent (`n: number |
   * null`, `n?: number`), by the name a read uses: the binding name, and
   * `<propsObjectName>.<key>` for a member read (#3474), mapped to what the
   * engine's nil stands for there (`NullableNumberPropNil`, #3533). */
  readonly nullableNumberProps?: ReadonlyMap<string, NullableNumberPropNil>
  /** Props declared as a string or a boolean that may be `null` or absent
   * (`s?: string`, `b: boolean | null`), keyed like {@link nullableNumberProps}.
   * Read only for a relational operand (#3824 step 3): JS converts it with
   * ToNumber unless both sides are strings, so its nil's reading decides the
   * comparison (`undefined < 1` is false, `null < 1` is true). */
  readonly nullableScalarProps?: ReadonlyMap<string, NullableScalarProp>
}

/** A string or boolean prop's nil reading ({@link NullishAttrContext.nullableScalarProps}). */
export interface NullableScalarProp {
  readonly family: 'string' | 'boolean'
  readonly nil: NullableNumberPropNil
}

/**
 * What a nullable number prop's nil stands for at SSR (#3533). JS reads an
 * absent prop as `undefined` (`NaN` in arithmetic) and a `null` one as `0`,
 * while a template engine holds both as the same nil, so the declared type
 * decides. A prop whose type admits `null` (`n: number | null`) reads its
 * nil as `null`. A prop that can only be absent (`n?: number`,
 * `n: number | undefined`) reads it as `undefined`; a present value, `0`
 * included, is unaffected. A prop that admits both (`n?: number | null`,
 * `n: number | null | undefined`) is `'either'`: the type cannot say which
 * one its nil stands for, so arithmetic over it is refused
 * (`arithmeticOperandNilIsAmbiguous`).
 */
export type NullableNumberPropNil = 'null' | 'undefined' | 'either'

export function collectNullishAttrContext(ir: ComponentIR): NullishAttrContext {
  const signals = ir.metadata.signals ?? []
  return {
    nullableSignals: collectNullableSignalGetters(ir),
    nullSeededSignals: new Set(
      signals.filter(s => s.parsed?.kind === 'literal' && s.parsed.literalType === 'null').map(s => s.getter),
    ),
    undefinedSeededSignals: new Set(
      signals.filter(s => s.parsed?.kind === 'identifier' && s.parsed.name === 'undefined').map(s => s.getter),
    ),
    memos: new Map((ir.metadata.memos ?? []).map(m => [m.name, m])),
    nullableProps: collectNullablePropReads(ir),
    nullableNumberProps: collectNullableNumberProps(ir),
    nullableScalarProps: collectNullableScalarProps(ir),
  }
}

/**
 * What the nil of a number prop that admits `null` / `undefined` and no other
 * family stands for (`NullableNumberPropNil`); `null` for any other type.
 */
function nullablePrimitivePropNil(
  type: TypeInfo | undefined,
  optional: boolean,
): { family: string; nil: NullableNumberPropNil } | null {
  if (!type) return null
  const members = type.kind === 'union' ? (type.unionTypes ?? []) : [type]
  const families = new Set(members.map(m => (m.kind === 'primitive' ? m.primitive : m.kind)))
  const admitsNull = families.has('null')
  const admitsAbsent = optional || families.has('undefined')
  families.delete('null')
  families.delete('undefined')
  if (!(admitsNull || admitsAbsent) || families.size !== 1) return null
  const [family] = [...families] as [string]
  if (admitsNull && admitsAbsent) return { family, nil: 'either' }
  return { family, nil: admitsNull ? 'null' : 'undefined' }
}

/** Each no-default prop whose declared type `pick` accepts, keyed by the name a read uses. */
function collectNullablePrimitiveProps<T>(
  ir: ComponentIR,
  pick: (read: { family: string; nil: NullableNumberPropNil }) => T | null,
): ReadonlyMap<string, T> {
  const names = new Map<string, T>()
  const objectName = ir.metadata.propsObjectName
  for (const p of ir.metadata.propsParams) {
    if (p.isRest || p.defaultValue !== undefined) continue
    const read = nullablePrimitivePropNil(p.declaredType ?? p.type, p.optional)
    const picked = read === null ? null : pick(read)
    if (picked !== null) names.set(objectName ? `${objectName}.${p.sourceName ?? p.name}` : p.name, picked)
  }
  return names
}

function collectNullableNumberProps(ir: ComponentIR): ReadonlyMap<string, NullableNumberPropNil> {
  return collectNullablePrimitiveProps(ir, read => (read.family === 'number' ? read.nil : null))
}

function collectNullableScalarProps(ir: ComponentIR): ReadonlyMap<string, NullableScalarProp> {
  return collectNullablePrimitiveProps(ir, ({ family, nil }) =>
    family === 'string' || family === 'boolean' ? { family, nil } : null,
  )
}

/**
 * Whether an attribute value's SSR value can be `undefined` / `null`, so a
 * DSL adapter must guard the attribute on a nil check to omit it the way
 * Hono does (#3322) — the derived-value half of the bare-signal guard
 * (`nullableSignalAttrGetter`, #3304). Matches a value that reaches a
 * nullish value through:
 *
 * - a read of a nullable signal or of a memo whose type or body can be
 *   nullish (`label()` with `label = createMemo(() => s())`), or of a prop
 *   that can be absent (`props.on && 'y'`);
 * - an optional member read (`user()?.name`), an index or computed-key read
 *   (`pair[1]`, `row[key]`), or a member read of a value that can itself be
 *   nullish;
 * - a ternary branch, or an `??` / `||` / `&&` operand the result can be;
 * - a method call that reads `undefined` when nothing is there
 *   (`word.at(-1)`, `items.find(...)`, {@link methodMayReturnUndefined});
 * - a literal `undefined` / `null`.
 *
 * Like the bare-signal guard it is presence-only: a non-nil value renders
 * exactly as unguarded, so over-including a value never changes output for
 * a present value (`''`, `0` and `false` still render). `isShadowed` names
 * a getter a loop binding hides at the attribute site, which is then not
 * the signal / memo; a memo's own body is read in its declaration scope.
 */
export function attrValueMayBeNullish(
  parsed: ParsedExpr | undefined,
  ctx: NullishAttrContext,
  isShadowed: (name: string) => boolean = () => false,
): boolean {
  const visiting = new Set<string>()
  // `shadowed` is the scope the expression is read in: the attribute site's
  // loop bindings at the top level, none inside a memo body — its getters
  // resolve where the memo is declared, not where it is read.
  const walk = (expr: ParsedExpr, shadowed: (name: string) => boolean): boolean => {
    if (readsUndefinedLeaf(expr, ctx, shadowed)) return true
    switch (expr.kind) {
      case 'identifier':
        return expr.name === 'undefined'
      case 'literal':
        return expr.literalType === 'null'
      case 'call': {
        const getter = bareGetterCallName(expr)
        if (getter === null || shadowed(getter)) return false
        if (ctx.nullableSignals.has(getter)) return true
        const memo = ctx.memos.get(getter)
        if (!memo || visiting.has(getter)) return false
        if (admitsNullish(memo.type)) return true
        visiting.add(getter)
        const result = memo.parsed !== undefined && walk(memo.parsed, () => false)
        visiting.delete(getter)
        return result
      }
      // A computed key or an index (`pair[1]`, `row[key]`) reads `undefined`
      // when it is out of range or absent (#3497).
      case 'member':
        return expr.optional || expr.computed || walk(expr.object, shadowed)
      case 'index-access':
        return true
      case 'conditional':
        return walk(expr.consequent, shadowed) || walk(expr.alternate, shadowed)
      case 'logical':
        return expr.op === '&&'
          ? walk(expr.left, shadowed) || walk(expr.right, shadowed)
          : walk(expr.right, shadowed)
      default:
        return false
    }
  }
  return parsed !== undefined && walk(parsed, isShadowed)
}

/** A method call that can miss (`methodMayReturnUndefined`), or a read of a prop that can be absent. */
function readsUndefinedLeaf(expr: ParsedExpr, ctx: NullishAttrContext, shadowed: (name: string) => boolean): boolean {
  return methodMayReturnUndefined(expr) || readsNullableProp(expr, ctx, shadowed)
}

/**
 * A read of a prop that can be absent (`NullishAttrContext.nullableProps`):
 * its binding (`on`) or `props.<key>`, unless a binding shadows the name.
 */
function readsNullableProp(expr: ParsedExpr, ctx: NullishAttrContext, shadowed: (name: string) => boolean): boolean {
  if (!ctx.nullableProps?.size) return false
  if (expr.kind === 'identifier') return !shadowed(expr.name) && ctx.nullableProps.has(expr.name)
  if (expr.kind !== 'member' || expr.computed || expr.object.kind !== 'identifier' || shadowed(expr.object.name)) return false
  return ctx.nullableProps.has(`${expr.object.name}.${expr.property}`)
}

/** Array / string methods that read `undefined` when nothing matches. */
const UNDEFINED_ON_MISS_METHODS: ReadonlySet<string> = new Set(['find', 'findLast'])

/**
 * Whether `expr` is a method call that reads `undefined` for some receiver:
 * `.at(i)` out of range (an empty string or array included, `''.at(-1)`),
 * or `.find()` / `.findLast()` with no matching element.
 */
function methodMayReturnUndefined(expr: ParsedExpr): boolean {
  if (expr.kind === 'array-method') return expr.method === 'at'
  return (
    expr.kind === 'call' &&
    expr.callee.kind === 'member' &&
    !expr.callee.computed &&
    UNDEFINED_ON_MISS_METHODS.has(expr.callee.property)
  )
}

/**
 * Whether an arithmetic operand's SSR value is certainly `null` — a literal
 * `null`, a read of a signal seeded with `null`, or a memo whose body is
 * such a read (`same = () => s()`). JS `ToNumber(null)` is `0` but
 * `ToNumber(undefined)` is `NaN`, and a template engine holds both as one
 * nil, so only a value known to be `null` may be coerced to `0` (#3350).
 * A bare identifier is read as the getter call: a memo seed lowers `s()` to
 * `s` before the adapter sees it.
 */
export function arithmeticOperandIsNull(
  parsed: ParsedExpr | undefined,
  ctx: NullishAttrContext,
  isShadowed: (name: string) => boolean = () => false,
): boolean {
  const seed = arithmeticOperandSeed(parsed, ctx, isShadowed)
  return seed === 'null' || seed === 'either'
}

/**
 * Whether an arithmetic operand's SSR value is certainly `undefined` — the
 * literal `undefined`, a read of a signal seeded with `undefined` (or a
 * zero-arg `createSignal()`), or a memo whose body is such a read. JS
 * `ToNumber(undefined)` is `NaN`, so adapters coerce such an operand with
 * their JS `Number()` helper, which maps the engine's nil to `NaN` (#3390).
 */
export function arithmeticOperandIsUndefined(
  parsed: ParsedExpr | undefined,
  ctx: NullishAttrContext,
  isShadowed: (name: string) => boolean = () => false,
): boolean {
  return arithmeticOperandSeed(parsed, ctx, isShadowed) === 'undefined'
}

/**
 * What an arithmetic operand's SSR nil stands for: `'null'` / `'undefined'`
 * when the operand is that value (a nullable number prop's `null` reading
 * included), `'absent'` when it is a number prop that may be absent
 * (`n?: number`), whose nil is `undefined` but which may hold a number,
 * `'either'` when it is a number prop whose nil may be either
 * (`n?: number | null`).
 */
type OperandSeed = 'null' | 'undefined' | 'absent' | 'either' | null

function arithmeticOperandSeed(
  parsed: ParsedExpr | undefined,
  ctx: NullishAttrContext,
  isShadowed: (name: string) => boolean,
): OperandSeed {
  const visiting = new Set<string>()
  const walk = (expr: ParsedExpr, shadowed: (name: string) => boolean): OperandSeed => {
    if (expr.kind === 'literal') return expr.literalType === 'null' ? 'null' : null
    if (expr.kind === 'identifier' && expr.name === 'undefined' && !shadowed('undefined')) return 'undefined'
    const prop = nullableNumberPropRead(expr, ctx, shadowed)
    if (prop !== null) return prop === 'undefined' ? 'absent' : prop
    const getter = expr.kind === 'identifier' ? expr.name : bareGetterCallName(expr)
    if (getter === null || shadowed(getter)) return null
    if (ctx.nullSeededSignals?.has(getter)) return 'null'
    if (ctx.undefinedSeededSignals?.has(getter)) return 'undefined'
    const memo = ctx.memos.get(getter)
    if (!memo?.parsed || visiting.has(getter)) return null
    visiting.add(getter)
    const result = walk(memo.parsed, () => false)
    visiting.delete(getter)
    return result
  }
  return parsed === undefined ? null : walk(parsed, isShadowed)
}

/**
 * What the nil of a read of a prop declared as a nullable number stands for
 * (`NullableNumberPropNil`), or `null` when the read is not such a prop.
 */
function nullableNumberPropRead(
  expr: ParsedExpr,
  ctx: NullishAttrContext,
  shadowed: (name: string) => boolean,
): NullableNumberPropNil | null {
  return propReadIn(ctx.nullableNumberProps, expr, shadowed)
}

/** The entry of `props` (keyed as {@link NullishAttrContext.nullableNumberProps}) that `expr` reads, or `null`. */
function propReadIn<T>(
  props: ReadonlyMap<string, T> | undefined,
  expr: ParsedExpr,
  shadowed: (name: string) => boolean,
): T | null {
  if (!props?.size) return null
  if (expr.kind === 'identifier') return shadowed(expr.name) ? null : (props.get(expr.name) ?? null)
  if (expr.kind === 'member' && !expr.computed && expr.object.kind === 'identifier' && !shadowed(expr.object.name)) {
    return props.get(`${expr.object.name}.${expr.property}`) ?? null
  }
  return null
}

/**
 * The string or boolean prop (`NullishAttrContext.nullableScalarProps`) a
 * relational operand reads, directly or through a memo whose body is such a
 * read, or `null`.
 */
function scalarPropRead(
  parsed: ParsedExpr | undefined,
  ctx: NullishAttrContext,
  isShadowed: (name: string) => boolean,
): NullableScalarProp | null {
  if (!ctx.nullableScalarProps?.size || parsed === undefined) return null
  const visiting = new Set<string>()
  const walk = (expr: ParsedExpr, shadowed: (name: string) => boolean): NullableScalarProp | null => {
    const prop = propReadIn(ctx.nullableScalarProps, expr, shadowed)
    if (prop !== null) return prop
    const getter = expr.kind === 'identifier' ? expr.name : bareGetterCallName(expr)
    if (getter === null || shadowed(getter)) return null
    const memo = ctx.memos.get(getter)
    if (!memo?.parsed || visiting.has(getter)) return null
    visiting.add(getter)
    const result = walk(memo.parsed, () => false)
    visiting.delete(getter)
    return result
  }
  return walk(parsed, isShadowed)
}

/**
 * Arithmetic operators JS applies `ToNumber` to, so a `null` operand reads
 * as `0` (`null * 2` is `0`). A template engine's native operator rejects a
 * nil operand instead and the render throws (#3350), so adapters coerce an
 * operand that `arithmeticOperandIsNull` matches. `+` is excluded: it
 * concatenates when either side is a string.
 */
export const NULL_COERCING_ARITHMETIC_OPS: ReadonlySet<string> = new Set(['-', '*', '/', '%', '**'])

/** How a DSL adapter coerces an arithmetic operand (#3474): `'null'` reads a
 * nil as `0` (JS `ToNumber(null)`), `'undefined'` reads it as `NaN`
 * (`ToNumber(undefined)`), `null` leaves the operand as is. Either coercion
 * leaves a non-nil operand's value as it is: the operand is a number, so the
 * runtime's JS `Number()` may spell `'undefined'`.
 *
 * `'undefined-keep'` (#3824 step 3) also reads a nil as `NaN`, but the
 * operand is a string or boolean relational operand, which must reach the
 * relational helper unconverted (`'a' < 'b'` compares strings), so the
 * adapter spells it as a nil test: `NaN` when nil, the operand otherwise.
 * `NaN` makes the comparison false, as `undefined < x` is in JS for any `x`. */
export type ArithmeticCoercion = 'null' | 'undefined' | 'undefined-keep' | null

/**
 * The one decision behind every DSL adapter's arithmetic over a nullish
 * operand (#3474). An operand known to be `null` / `undefined`
 * (`arithmeticOperandIsNull` / `arithmeticOperandIsUndefined`), or a
 * nullable number prop, whose nil reads as its type says
 * (`NullableNumberPropNil`, #3533), is coerced under the operators JS
 * applies `ToNumber` to ({@link NULL_COERCING_ARITHMETIC_OPS}), and under
 * `+` when the other operand is a number literal, where `+` cannot
 * concatenate. Unary minus and unary plus apply `ToNumber` too: each passes
 * its operator (`'-'` / `'+'`) with no `other`. Each adapter only spells the
 * coercion; one whose engine already reads nil as `0` spells `'null'` as the
 * operand itself.
 */
export function arithmeticOperandCoercion(
  op: string,
  operand: ParsedExpr | undefined,
  other: ParsedExpr | undefined,
  ctx: NullishAttrContext,
  isShadowed: (name: string) => boolean = () => false,
): ArithmeticCoercion {
  if (RELATIONAL_OPS.has(op)) return relationalOperandCoercion(operand, ctx, isShadowed)
  if (!isNumericArithmetic(op, other)) return null
  const seed = arithmeticOperandSeed(operand, ctx, isShadowed)
  if (seed === 'absent') return 'undefined'
  // `'either'` is refused (`arithmeticOperandNilIsAmbiguous`); the spelling
  // keeps the `null` reading so the refused template stays well-formed.
  return seed === 'either' ? 'null' : seed
}

/** The relational operators, whose operands JS converts with ToNumber unless both are strings. */
const RELATIONAL_OPS: ReadonlySet<string> = new Set(['<', '<=', '>', '>='])

/**
 * The coercion of a relational operand (#3824 step 3). The runtime's
 * relational helpers read a nil operand as JS `null` (`0`), so only an operand
 * whose nil reads as `undefined` needs spelling: it goes through `NaN`, which
 * makes the comparison false, as `undefined < 1` is in JS. A nil whose
 * reading the type leaves open (`n?: number | null`) is refused as it is in
 * arithmetic (`arithmeticOperandNilIsAmbiguous`, #3700); the spelling keeps
 * the helper's `null` reading so the refused template stays well-formed.
 */
function relationalOperandCoercion(
  operand: ParsedExpr | undefined,
  ctx: NullishAttrContext,
  isShadowed: (name: string) => boolean,
): ArithmeticCoercion {
  const seed = arithmeticOperandSeed(operand, ctx, isShadowed)
  if (seed === 'absent' || seed === 'undefined') return 'undefined'
  if (seed !== null) return null
  // A string or boolean prop that may only be absent (`s?: string`): its nil
  // is `undefined` too, but a present value must reach the helper as it is.
  return scalarPropRead(operand, ctx, isShadowed)?.nil === 'undefined' ? 'undefined-keep' : null
}

/**
 * Whether an arithmetic operand reads a number prop whose type admits both
 * `null` and absence (`n?: number | null`), directly or through a memo
 * (#3700). JS reads the omitted prop as `undefined` (`NaN` in arithmetic)
 * and a `null` one as `0`; a template engine holds both as one nil and the
 * type cannot say which, so no spelling of {@link arithmeticOperandCoercion}
 * renders both. Template adapters refuse such an operand instead of
 * rendering one reading silently. Same operators and scope as
 * {@link arithmeticOperandCoercion}, relational operators included: they
 * apply ToNumber too (`undefined < 1` is false, `null < 1` is true). Under a
 * relational operator a string or boolean prop admitting both
 * (`s?: string | null`) is ambiguous for the same reason
 * ({@link ambiguousNilFamily}).
 */
export function arithmeticOperandNilIsAmbiguous(
  op: string,
  operand: ParsedExpr | undefined,
  other: ParsedExpr | undefined,
  ctx: NullishAttrContext,
  isShadowed: (name: string) => boolean = () => false,
): boolean {
  return ambiguousNilFamily(op, operand, other, ctx, isShadowed) !== null
}

/** The declared family of a prop whose nil an operator cannot read ({@link ambiguousNilFamily}). */
export type AmbiguousNilFamily = 'number' | 'string' | 'boolean'

/**
 * The declared family of the prop behind an operand that
 * {@link arithmeticOperandNilIsAmbiguous} matches, or `null` when it does
 * not match: `'number'` for a numeric `either` operand of arithmetic or a
 * comparison, `'string'` / `'boolean'` for a string or boolean `either`
 * operand of a comparison (#3824 step 3).
 */
export function ambiguousNilFamily(
  op: string,
  operand: ParsedExpr | undefined,
  other: ParsedExpr | undefined,
  ctx: NullishAttrContext,
  isShadowed: (name: string) => boolean = () => false,
): AmbiguousNilFamily | null {
  const relational = RELATIONAL_OPS.has(op)
  if (!relational && !isNumericArithmetic(op, other)) return null
  if (arithmeticOperandSeed(operand, ctx, isShadowed) === 'either') return 'number'
  if (!relational) return null
  const scalar = scalarPropRead(operand, ctx, isShadowed)
  return scalar?.nil === 'either' ? scalar.family : null
}

/**
 * Every arithmetic operand in `expr` that {@link arithmeticOperandNilIsAmbiguous}
 * matches, for a whole expression a template adapter lowers without visiting
 * each operator through its emitter (a memo body, a `.filter()` predicate, an
 * expression the runtime evaluator runs). Operands of binary operators and of
 * unary minus and plus count. `scope` is where the expression is read; each arrow in
 * it enters its params as a callback frame (`BindingScope.enterCallback`),
 * so they shadow within its body only.
 */
export function ambiguousNilArithmeticOperands(
  expr: ParsedExpr,
  ctx: NullishAttrContext,
  scope: BindingScope = BindingScope.EMPTY,
): ParsedExpr[] {
  return ambiguousNilOperands(expr, ctx, scope).map(found => found.operand)
}

/** {@link ambiguousNilArithmeticOperands}, each operand with its prop's family ({@link ambiguousNilFamily}). */
export function ambiguousNilOperands(
  expr: ParsedExpr,
  ctx: NullishAttrContext,
  scope: BindingScope = BindingScope.EMPTY,
): Array<{ operand: ParsedExpr; family: AmbiguousNilFamily }> {
  const found: Array<{ operand: ParsedExpr; family: AmbiguousNilFamily }> = []
  const visit = (e: ParsedExpr, at: BindingScope): void => {
    if (e.kind === 'arrow') {
      visit(e.body, at.enterCallback(e.params))
      return
    }
    for (const [op, operand, other] of arithmeticOperandsOf(e)) {
      const family = ambiguousNilFamily(op, operand, other, ctx, at.asShadowPredicate())
      if (family !== null) found.push({ operand, family })
    }
    for (const child of parsedExprChildren(e)) visit(child, at)
  }
  if (!ctx.nullableNumberProps?.size && !ctx.nullableScalarProps?.size) return found
  visit(expr, scope)
  return found
}

/** The `[op, operand, other]` triples of an arithmetic node's operands. A
 * unary minus or plus applies ToNumber to its operand and has no `other`. */
function arithmeticOperandsOf(e: ParsedExpr): Array<[string, ParsedExpr, ParsedExpr | undefined]> {
  if (e.kind === 'binary') return [[e.op, e.left, e.right], [e.op, e.right, e.left]]
  if (e.kind === 'unary' && (e.op === '-' || e.op === '+')) return [[e.op, e.argument, undefined]]
  return []
}

/** The value-position sub-expressions of `e` (an arrow's body included). */
function parsedExprChildren(e: ParsedExpr): ParsedExpr[] {
  switch (e.kind) {
    case 'call':
      return [e.callee, ...e.args]
    case 'member':
      return [e.object]
    case 'index-access':
      return [e.object, e.index]
    case 'binary':
    case 'logical':
      return [e.left, e.right]
    case 'unary':
      return [e.argument]
    case 'conditional':
      return [e.test, e.consequent, e.alternate]
    case 'template-literal':
      return e.parts.flatMap(p => (p.type === 'expression' ? [p.expr] : []))
    case 'array-literal':
      return e.elements
    case 'array-method':
      return [e.object, ...e.args, ...(e.method === 'flat' && e.depthExpr ? [e.depthExpr] : [])]
    case 'object-literal':
      return e.properties.map(p => (p.kind === 'spread' ? p.expr : p.value))
    default:
      return []
  }
}

/** The operators {@link arithmeticOperandCoercion} applies `ToNumber` under:
 * a `+` with no `other` is unary plus, which always does. */
function isNumericArithmetic(op: string, other: ParsedExpr | undefined): boolean {
  return NULL_COERCING_ARITHMETIC_OPS.has(op) || (op === '+' && (other === undefined || isNumberLiteral(other)))
}

function isNumberLiteral(expr: ParsedExpr | undefined): boolean {
  if (expr?.kind === 'unary' && expr.op === '-') return isNumberLiteral(expr.argument)
  return expr?.kind === 'literal' && expr.literalType === 'number'
}
