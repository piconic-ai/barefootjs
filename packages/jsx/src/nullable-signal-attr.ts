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
import { BindingScope } from './scope/binding-scope.ts'
import type { ComponentIR, MemoInfo, SignalInfo, TypeInfo } from './types.ts'

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
  /** Props declared as a number that may be `null` or absent (`n: number |
   * null`, `n?: number`), by the name a read uses: the binding name, and
   * `<propsObjectName>.<key>` for a member read (#3474), mapped to what the
   * engine's nil stands for there (`NullableNumberPropNil`, #3533). */
  readonly nullableNumberProps?: ReadonlyMap<string, NullableNumberPropNil>
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
    nullableNumberProps: collectNullableNumberProps(ir),
  }
}

/**
 * What the nil of a number prop that admits `null` / `undefined` and no other
 * family stands for (`NullableNumberPropNil`); `null` for any other type.
 */
function nullableNumberPropNil(type: TypeInfo | undefined, optional: boolean): NullableNumberPropNil | null {
  if (!type) return null
  const members = type.kind === 'union' ? (type.unionTypes ?? []) : [type]
  const families = new Set(members.map(m => (m.kind === 'primitive' ? m.primitive : m.kind)))
  const admitsNull = families.has('null')
  const admitsAbsent = optional || families.has('undefined')
  families.delete('null')
  families.delete('undefined')
  if (!(admitsNull || admitsAbsent) || families.size !== 1 || !families.has('number')) return null
  if (admitsNull && admitsAbsent) return 'either'
  return admitsNull ? 'null' : 'undefined'
}

function collectNullableNumberProps(ir: ComponentIR): ReadonlyMap<string, NullableNumberPropNil> {
  const names = new Map<string, NullableNumberPropNil>()
  const objectName = ir.metadata.propsObjectName
  for (const p of ir.metadata.propsParams) {
    if (p.isRest || p.defaultValue !== undefined) continue
    const nil = nullableNumberPropNil(p.declaredType ?? p.type, p.optional)
    if (nil !== null) names.set(objectName ? `${objectName}.${p.sourceName ?? p.name}` : p.name, nil)
  }
  return names
}

/**
 * Whether an attribute value's SSR value can be `undefined` / `null`, so a
 * DSL adapter must guard the attribute on a nil check to omit it the way
 * Hono does (#3322) — the derived-value half of the bare-signal guard
 * (`nullableSignalAttrGetter`, #3304). Matches a value that reaches a
 * nullish value through:
 *
 * - a read of a nullable signal or of a memo whose type or body can be
 *   nullish (`label()` with `label = createMemo(() => s())`);
 * - an optional member read (`user()?.name`), an index or computed-key read
 *   (`pair[1]`, `row[key]`), or a member read of a value that can itself be
 *   nullish;
 * - a ternary branch, or an `??` / `||` / `&&` operand the result can be;
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
  if (!ctx.nullableNumberProps?.size) return null
  if (expr.kind === 'identifier') return shadowed(expr.name) ? null : (ctx.nullableNumberProps.get(expr.name) ?? null)
  if (expr.kind === 'member' && !expr.computed && expr.object.kind === 'identifier' && !shadowed(expr.object.name)) {
    return ctx.nullableNumberProps.get(`${expr.object.name}.${expr.property}`) ?? null
  }
  return null
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
 * leaves a non-nil operand's value as it is. */
export type ArithmeticCoercion = 'null' | 'undefined' | null

/**
 * The one decision behind every DSL adapter's arithmetic over a nullish
 * operand (#3474). An operand known to be `null` / `undefined`
 * (`arithmeticOperandIsNull` / `arithmeticOperandIsUndefined`), or a
 * nullable number prop, whose nil reads as its type says
 * (`NullableNumberPropNil`, #3533), is coerced under the operators JS
 * applies `ToNumber` to ({@link NULL_COERCING_ARITHMETIC_OPS}), and under
 * `+` when the other operand is a number literal, where `+` cannot
 * concatenate. Unary minus applies `ToNumber` too: it passes `'-'` with no
 * `other`. Each adapter only spells the coercion; one whose engine already
 * reads nil as `0` spells `'null'` as the operand itself.
 */
export function arithmeticOperandCoercion(
  op: string,
  operand: ParsedExpr | undefined,
  other: ParsedExpr | undefined,
  ctx: NullishAttrContext,
  isShadowed: (name: string) => boolean = () => false,
): ArithmeticCoercion {
  if (!isNumericArithmetic(op, other)) return null
  const seed = arithmeticOperandSeed(operand, ctx, isShadowed)
  if (seed === 'absent') return 'undefined'
  // `'either'` is refused (`arithmeticOperandNilIsAmbiguous`); the spelling
  // keeps the `null` reading so the refused template stays well-formed.
  return seed === 'either' ? 'null' : seed
}

/**
 * Whether an arithmetic operand reads a number prop whose type admits both
 * `null` and absence (`n?: number | null`), directly or through a memo
 * (#3700). JS reads the omitted prop as `undefined` (`NaN` in arithmetic)
 * and a `null` one as `0`; a template engine holds both as one nil and the
 * type cannot say which, so no spelling of {@link arithmeticOperandCoercion}
 * renders both. Template adapters refuse such an operand instead of
 * rendering one reading silently. Same operators and scope as
 * {@link arithmeticOperandCoercion}.
 */
export function arithmeticOperandNilIsAmbiguous(
  op: string,
  operand: ParsedExpr | undefined,
  other: ParsedExpr | undefined,
  ctx: NullishAttrContext,
  isShadowed: (name: string) => boolean = () => false,
): boolean {
  return isNumericArithmetic(op, other) && arithmeticOperandSeed(operand, ctx, isShadowed) === 'either'
}

/**
 * Every arithmetic operand in `expr` that {@link arithmeticOperandNilIsAmbiguous}
 * matches, for a whole expression a template adapter lowers without visiting
 * each operator through its emitter (a memo body, a `.filter()` predicate, an
 * expression the runtime evaluator runs). Operands of binary operators and of
 * unary minus count. `scope` is where the expression is read; each arrow in
 * it enters its params as a callback frame (`BindingScope.enterCallback`),
 * so they shadow within its body only.
 */
export function ambiguousNilArithmeticOperands(
  expr: ParsedExpr,
  ctx: NullishAttrContext,
  scope: BindingScope = BindingScope.EMPTY,
): ParsedExpr[] {
  const found: ParsedExpr[] = []
  const visit = (e: ParsedExpr, at: BindingScope): void => {
    if (e.kind === 'arrow') {
      visit(e.body, at.enterCallback(e.params))
      return
    }
    for (const [op, operand, other] of arithmeticOperandsOf(e)) {
      if (arithmeticOperandNilIsAmbiguous(op, operand, other, ctx, at.asShadowPredicate())) found.push(operand)
    }
    for (const child of parsedExprChildren(e)) visit(child, at)
  }
  if (!ctx.nullableNumberProps?.size) return found
  visit(expr, scope)
  return found
}

/** The `[op, operand, other]` triples of an arithmetic node's operands. */
function arithmeticOperandsOf(e: ParsedExpr): Array<[string, ParsedExpr, ParsedExpr | undefined]> {
  if (e.kind === 'binary') return [[e.op, e.left, e.right], [e.op, e.right, e.left]]
  if (e.kind === 'unary' && e.op === '-') return [['-', e.argument, undefined]]
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

/** The operators {@link arithmeticOperandCoercion} applies `ToNumber` under. */
function isNumericArithmetic(op: string, other: ParsedExpr | undefined): boolean {
  return NULL_COERCING_ARITHMETIC_OPS.has(op) || (op === '+' && isNumberLiteral(other))
}

function isNumberLiteral(expr: ParsedExpr | undefined): boolean {
  if (expr?.kind === 'unary' && expr.op === '-') return isNumberLiteral(expr.argument)
  return expr?.kind === 'literal' && expr.literalType === 'number'
}
