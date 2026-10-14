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

/** Getter names of the component's signals whose SSR value can be nullish. */
export function collectNullableSignalGetters(ir: ComponentIR): Set<string> {
  return new Set((ir.metadata.signals ?? []).filter(isNullableSignal).map(s => s.getter))
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
   * `<propsObjectName>.<key>` for a member read (#3474). */
  readonly nullableNumberProps?: ReadonlySet<string>
}

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

/** Whether `type` is a number that admits `null` / `undefined` and no other family. */
function isNullableNumberType(type: TypeInfo | undefined, optional: boolean): boolean {
  if (!type) return false
  const members = type.kind === 'union' ? (type.unionTypes ?? []) : [type]
  const families = new Set(members.map(m => (m.kind === 'primitive' ? m.primitive : m.kind)))
  const nullable = optional || families.has('null') || families.has('undefined')
  families.delete('null')
  families.delete('undefined')
  return nullable && families.size === 1 && families.has('number')
}

function collectNullableNumberProps(ir: ComponentIR): ReadonlySet<string> {
  const names = new Set<string>()
  const objectName = ir.metadata.propsObjectName
  for (const p of ir.metadata.propsParams) {
    if (p.isRest || p.defaultValue !== undefined || !isNullableNumberType(p.type, p.optional)) continue
    names.add(objectName ? `${objectName}.${p.sourceName ?? p.name}` : p.name)
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
 * - an optional member read (`user()?.name`), or a member read of a value
 *   that can itself be nullish;
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
      case 'member':
        return expr.optional || walk(expr.object, shadowed)
      case 'index-access':
        return walk(expr.object, shadowed)
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
  return arithmeticOperandSeed(parsed, ctx, isShadowed) === 'null'
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

function arithmeticOperandSeed(
  parsed: ParsedExpr | undefined,
  ctx: NullishAttrContext,
  isShadowed: (name: string) => boolean,
): 'null' | 'undefined' | null {
  const visiting = new Set<string>()
  const walk = (expr: ParsedExpr, shadowed: (name: string) => boolean): 'null' | 'undefined' | null => {
    if (expr.kind === 'literal') return expr.literalType === 'null' ? 'null' : null
    if (expr.kind === 'identifier' && expr.name === 'undefined' && !shadowed('undefined')) return 'undefined'
    const prop = nullableNumberPropRead(expr, ctx, shadowed)
    if (prop) return 'null'
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
 * A read of a prop declared as a nullable number. Its SSR value may be
 * `null` or absent; it is coerced like a `null` operand. JS reads an absent
 * prop as `undefined` (`NaN` in arithmetic), which a template engine cannot
 * tell from `null` (the `omitted-optional-number-arithmetic` limitation).
 */
function nullableNumberPropRead(
  expr: ParsedExpr,
  ctx: NullishAttrContext,
  shadowed: (name: string) => boolean,
): boolean {
  if (!ctx.nullableNumberProps?.size) return false
  if (expr.kind === 'identifier') return !shadowed(expr.name) && ctx.nullableNumberProps.has(expr.name)
  if (expr.kind === 'member' && !expr.computed && expr.object.kind === 'identifier' && !shadowed(expr.object.name)) {
    return ctx.nullableNumberProps.has(`${expr.object.name}.${expr.property}`)
  }
  return false
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
 * (`ToNumber(undefined)`), `null` leaves the operand as is. */
export type ArithmeticCoercion = 'null' | 'undefined' | null

/**
 * The one decision behind every DSL adapter's arithmetic over a nullish
 * operand (#3474). An operand known to be `null` / `undefined`
 * (`arithmeticOperandIsNull` / `arithmeticOperandIsUndefined`, or a nullable
 * number prop) is coerced under the operators JS applies `ToNumber` to
 * ({@link NULL_COERCING_ARITHMETIC_OPS}), and under `+` when the other
 * operand is a number literal, where `+` cannot concatenate. Each adapter
 * only spells the coercion; one whose engine already reads nil as `0`
 * spells `'null'` as the operand itself.
 */
export function arithmeticOperandCoercion(
  op: string,
  operand: ParsedExpr | undefined,
  other: ParsedExpr | undefined,
  ctx: NullishAttrContext,
  isShadowed: (name: string) => boolean = () => false,
): ArithmeticCoercion {
  const numeric = NULL_COERCING_ARITHMETIC_OPS.has(op) || (op === '+' && isNumberLiteral(other))
  return numeric ? arithmeticOperandSeed(operand, ctx, isShadowed) : null
}

function isNumberLiteral(expr: ParsedExpr | undefined): boolean {
  if (expr?.kind === 'unary' && expr.op === '-') return isNumberLiteral(expr.argument)
  return expr?.kind === 'literal' && expr.literalType === 'number'
}
