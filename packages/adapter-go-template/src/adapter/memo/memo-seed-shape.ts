/**
 * Memo seed classification — decide, without emitting anything, which value
 * shape a memo body's SSR seed has, walking memo reads (`total() * 2`,
 * `() => eighth()`) through one shadow-aware recursion.
 *
 * The memo field's Go type (`inferMemoType`, type/state-fields.ts) and the
 * constructor seed (`memoInitialFromParsedBody`, memo-compute.ts) both read
 * this classification, so the representation a seed is spelled in and the
 * field it is assigned to can't disagree (#3423). The shape predicates the
 * emitter shares (getter calls, prop references, length reads) live here too.
 */

import type { ParsedExpr, TypeInfo } from '@barefootjs/jsx'
import { arithmeticOperandIsUndefined, bareGetterCallName, NULL_COERCING_ARITHMETIC_OPS } from '@barefootjs/jsx'

import type { GoEmitContext } from '../emit-context.ts'
import { typeInfoToGo } from '../type/type-codegen.ts'

/** A bare zero-arg getter call (`count()`) → its name, else null. */
export function getterCallName(e: ParsedExpr): string | null {
  return e.kind === 'call' && e.callee.kind === 'identifier' && e.args.length === 0
    ? e.callee.name
    : null
}

/** A `props.X` member access → the prop name, else null. */
export function propsMemberName(e: ParsedExpr): string | null {
  return e.kind === 'member' &&
    !e.computed &&
    e.object.kind === 'identifier' &&
    e.object.name === 'props'
    ? e.property
    : null
}

/**
 * A memo-body length read → its receiver, else null. Recognised shapes:
 *
 * - `<recv>.length` (non-optional access);
 * - `<recv>.length ?? 0` / `<recv>?.length ?? 0` (and `|| 0`) — the
 *   nullish-guarded form (`posts()?.length ?? 0`, a `createQuery` value).
 *   A nullish receiver yields `0` in JS, which is exactly what the
 *   constructor's `bf.Length` returns for a nil value, so the guard folds
 *   away. Only a literal `0` fallback folds: any other fallback would need
 *   "absent" told apart from "empty", which a Go nil slice can't carry.
 *
 * A bare `<recv>?.length` (no fallback) is NOT recognised: an absent
 * receiver renders `undefined` (empty text) in JS, not `0`.
 */
export function lengthReadReceiver(e: ParsedExpr): ParsedExpr | null {
  if (
    e.kind === 'logical' &&
    (e.op === '??' || e.op === '||') &&
    e.right.kind === 'literal' &&
    e.right.literalType === 'number' &&
    e.right.value === 0
  ) {
    const inner = e.left
    return inner.kind === 'member' && !inner.computed && inner.property === 'length' ? inner.object : null
  }
  return e.kind === 'member' && !e.computed && !e.optional && e.property === 'length' ? e.object : null
}

/**
 * Whether a length read's receiver is one the constructor can evaluate: a
 * zero-arg getter call naming a signal or memo (`items()`, a `createQuery`
 * value), or a prop reference (`props.items`, a destructured `items`). The
 * structural half of `resolveLengthReadGo` (memo-compute.ts), used where the decision
 * must be made without emitting (the memo field's Go type classifier,
 * {@link numericMemoOperands}).
 */
export function isResolvableLengthRead(
  ctx: GoEmitContext,
  e: ParsedExpr,
  signals: { getter: string }[],
  propsParams: { name: string }[],
): boolean {
  const recv = lengthReadReceiver(e)
  if (!recv) return false
  const getter = getterCallName(recv)
  if (getter) return signals.some(s => s.getter === getter) || (ctx.state.currentMemos ?? []).some(m => m.name === getter)
  const propName = propNameForPropsBinding(ctx, recv)
  return propName !== null && propsParams.some(p => p.name === propName)
}

/**
 * A prop reference resolved against the component's ACTUAL props-object
 * binding (`ctx.state.propsObjectName` — may be a non-`props` name, or
 * `null` for a destructured signature), else null. Mirrors
 * `collectPresenceCheckedPropNames`'s (prop-types.ts) exact shape so the
 * presence-check codegen branch below can't drift from the collector that
 * decides which props got the nillable flip in the first place — unlike
 * `propsMemberName` (hardcoded to the literal name `props`), which only
 * matches the conventional object-props signature.
 */
export function propNameForPropsBinding(ctx: GoEmitContext, e: ParsedExpr): string | null {
  const propsObject = ctx.state.propsObjectName
  if (e.kind === 'member' && !e.computed && e.object.kind === 'identifier' && e.object.name === propsObject) {
    return e.property
  }
  if (!propsObject && e.kind === 'identifier') return e.name
  return null
}

/**
 * Whether a memo body is `-` / `*` / `/` / `%` / `**` arithmetic whose result
 * is `NaN` at SSR: an operand is certainly `undefined`
 * (`arithmeticOperandIsUndefined`, which follows identity memos), is itself
 * such arithmetic, or reads a memo whose body is (`doubled() * 2` with
 * `doubled = () => s() * 2`). JS gives `NaN` whatever the other operand is
 * (#3390); a Go seed would read the undefined signal as `0`.
 */
export function memoArithmeticYieldsNaN(ctx: GoEmitContext, expr: ParsedExpr): boolean {
  const nullishCtx = ctx.state.nullishAttrCtx
  const visiting = new Set<string>()
  const yieldsNaN = (e: ParsedExpr): boolean => {
    if (e.kind !== 'binary' || !NULL_COERCING_ARITHMETIC_OPS.has(e.op)) return false
    return isNaNOperand(e.left) || isNaNOperand(e.right)
  }
  const isNaNOperand = (e: ParsedExpr): boolean => {
    if (arithmeticOperandIsUndefined(e, nullishCtx) || yieldsNaN(e)) return true
    const getter = e.kind === 'identifier' ? e.name : bareGetterCallName(e)
    const memo = getter === null ? undefined : nullishCtx.memos.get(getter)
    if (!memo?.parsed || visiting.has(getter!)) return false
    visiting.add(getter!)
    const result = yieldsNaN(memo.parsed)
    visiting.delete(getter!)
    return result
  }
  return yieldsNaN(expr)
}

/** Numeric atoms supported by the shared-runtime memo path. Its result is
 * boxed (`any`), preserving integer and fractional values alike. The field
 * classifier and constructor use this same decision. */
function numericMemoOperands(
  ctx: GoEmitContext,
  body: ParsedExpr | undefined,
  signals: { getter: string; type?: TypeInfo }[],
  propsParams: { name: string; type?: TypeInfo; optional?: boolean }[],
): readonly [ParsedExpr, ParsedExpr] | null {
  if (!body || body.kind !== 'binary' || !['+', '-', '*'].includes(body.op)) return null
  const numericAtom = (expr: ParsedExpr): boolean => {
    if (isResolvableLengthRead(ctx, expr, signals, propsParams)) return true
    const getter = getterCallName(expr)
    if (getter) {
      const type = signals.find(s => s.getter === getter)?.type
        ?? ctx.state.currentMemos?.find(m => m.name === getter)?.type
      return type?.kind === 'primitive' && type.primitive === 'number'
    }
    const name = propNameForPropsBinding(ctx, expr)
    const prop = name ? propsParams.find(p => p.name === name) : undefined
    return prop?.type?.kind === 'primitive' && prop.type.primitive === 'number' && !prop.optional
  }
  return numericAtom(body.left) && numericAtom(body.right) ? [body.left, body.right] : null
}

/** `+ - * /` → the shared arithmetic runtime helper that boxes its result. */
export const BOXED_ARITHMETIC_HELPER: Readonly<Record<string, string>> = { '+': 'Add', '-': 'Sub', '*': 'Mul', '/': 'Div' }

/** A non-negative integer literal operand → its value, else null. */
export function nonNegativeIntLiteral(e: ParsedExpr): number | null {
  if (e.kind !== 'literal' || e.literalType !== 'number' || typeof e.value !== 'number') return null
  return Number.isInteger(e.value) && e.value >= 0 ? e.value : null
}

/**
 * Why a memo body's constructor value is the shared arithmetic runtime's boxed
 * `any` (`bf.Add` / `bf.Sub` / `bf.Mul` / `bf.Div`) rather than a Go number.
 * The memo field is then `interface{}` so the boxed value assigns.
 */
export type BoxedArithmeticSeed =
  /** Two numeric operands ({@link numericMemoOperands}): `list().length + count()` → `bf.Add(…)`. */
  | { kind: 'numeric-operands'; op: string; left: ParsedExpr; right: ParsedExpr }
  /**
   * `<getter()> / N`, `props.X / N` or `<destructured prop> / N` (`N` a
   * non-negative integer literal): Go's `/` on an int operand truncates where
   * JS yields a fraction (`1234567890 / 8` is `154320986.25`), and a zero `N`
   * is IEEE division (`Infinity`, #3692), so it computes through `bf.Div`
   * (#3379).
   */
  | { kind: 'literal-division'; dividend: ParsedExpr; divisor: number }
  /**
   * `props.X <+|-|*> N` or `<destructured prop> <+|-|*> N` (`N` a
   * non-negative integer literal) over a prop whose input field is nillable
   * only because of how the component consumes it (a `??`, a bare attribute,
   * …; `collectNillablePropNames`), not its declared type. Its field is then
   * `interface{}`, which Go cannot multiply by an int, so the body goes
   * through the runtime helper (`bf.Mul(in.N, 2)`). A prop whose declared
   * type already lowers to `interface{}` keeps its `.(int)` assertion.
   */
  | { kind: 'nillable-prop-literal'; op: string; left: ParsedExpr; propName: string; operand: number }
  /** An identity read of a boxed memo (`() => eighth()`): passes the boxed value through. */
  | { kind: 'boxed-memo-identity'; dep: string }
  /**
   * `<getter()> <op> N` over a boxed memo (`total() * 2` where `total` is
   * `bf.Add(…)`): Go has no `any * int`, so the same runtime helper does the
   * arithmetic (`bf.Mul(<total>, 2)`).
   */
  | { kind: 'boxed-memo-literal'; op: string; dep: string; operand: number }

/**
 * Classify a memo body as one of the {@link BoxedArithmeticSeed} shapes, else
 * null. The memo-chain cases recurse into the read memo's own body through
 * {@link isBoxedMemoRead}; `seen` holds the memos already on that walk, so a
 * self- or mutually-referencing chain ends instead of recursing forever.
 */
export function classifyBoxedArithmetic(
  ctx: GoEmitContext,
  body: ParsedExpr | undefined,
  signals: { getter: string; type?: TypeInfo }[],
  propsParams: { name: string; type?: TypeInfo; optional?: boolean; defaultValue?: string; parsed?: ParsedExpr }[],
  seen: ReadonlySet<string> = new Set(),
): BoxedArithmeticSeed | null {
  if (!body) return null
  return numericOperandsSeed(ctx, body, signals, propsParams)
    ?? literalDivisionSeed(body, propsParams)
    ?? nillablePropLiteralSeed(ctx, body, propsParams)
    ?? boxedMemoChainSeed(ctx, body, signals, propsParams, seen)
}

/**
 * Whether a memo body's constructor value is boxed
 * ({@link classifyBoxedArithmetic} matches). The one decision both the memo
 * field's Go type (`interface{}`) and the constructor emission consult.
 */
export function isBoxedNumericMemoBody(
  ctx: GoEmitContext,
  body: ParsedExpr | undefined,
  signals: { getter: string; type?: TypeInfo }[],
  propsParams: { name: string; type?: TypeInfo; optional?: boolean; defaultValue?: string; parsed?: ParsedExpr }[],
): boolean {
  return classifyBoxedArithmetic(ctx, body, signals, propsParams) !== null
}

/**
 * The Go representation a memo's seed needs regardless of its declared type:
 * `'nan'` when the body is arithmetic that is `NaN` at SSR
 * ({@link memoArithmeticYieldsNaN}, seeded `bf.Number(nil)`), `'boxed'` when
 * it computes through the boxed arithmetic runtime
 * ({@link classifyBoxedArithmetic}), else null (the declared or inferred type
 * decides). Both non-null answers need an `interface{}` field.
 */
export function memoSeedRepresentation(
  ctx: GoEmitContext,
  body: ParsedExpr | undefined,
  signals: { getter: string; type?: TypeInfo }[],
  propsParams: { name: string; type?: TypeInfo; optional?: boolean; defaultValue?: string; parsed?: ParsedExpr }[],
): 'nan' | 'boxed' | null {
  if (body && memoArithmeticYieldsNaN(ctx, body)) return 'nan'
  return isBoxedNumericMemoBody(ctx, body, signals, propsParams) ? 'boxed' : null
}

function numericOperandsSeed(
  ctx: GoEmitContext,
  body: ParsedExpr,
  signals: { getter: string; type?: TypeInfo }[],
  propsParams: { name: string; type?: TypeInfo; optional?: boolean }[],
): BoxedArithmeticSeed | null {
  const operands = numericMemoOperands(ctx, body, signals, propsParams)
  return operands && body.kind === 'binary'
    ? { kind: 'numeric-operands', op: body.op, left: operands[0], right: operands[1] }
    : null
}

function literalDivisionSeed(body: ParsedExpr, propsParams: { name: string }[]): BoxedArithmeticSeed | null {
  if (body.kind !== 'binary' || body.op !== '/') return null
  const divisor = nonNegativeIntLiteral(body.right)
  if (divisor === null) return null
  const left = body.left
  if (getterCallName(left)) return { kind: 'literal-division', dividend: left, divisor }
  const propName = propsMemberName(left) ?? (left.kind === 'identifier' ? left.name : null)
  return propName && propsParams.some(p => p.name === propName) ? { kind: 'literal-division', dividend: left, divisor } : null
}

function nillablePropLiteralSeed(
  ctx: GoEmitContext,
  body: ParsedExpr,
  propsParams: { name: string; type?: TypeInfo; defaultValue?: string; parsed?: ParsedExpr }[],
): BoxedArithmeticSeed | null {
  if (body.kind !== 'binary' || !['+', '-', '*'].includes(body.op)) return null
  const operand = nonNegativeIntLiteral(body.right)
  if (operand === null) return null
  const name = propsMemberName(body.left) ?? (body.left.kind === 'identifier' ? body.left.name : null)
  const param = name ? propsParams.find(p => p.name === name) : undefined
  if (!param?.type || !ctx.state.nillablePropNames.has(param.name)) return null
  if (typeInfoToGo(ctx, param.type, param.defaultValue, param.parsed) === 'interface{}') return null
  return { kind: 'nillable-prop-literal', op: body.op, left: body.left, propName: param.name, operand }
}

function boxedMemoChainSeed(
  ctx: GoEmitContext,
  body: ParsedExpr,
  signals: { getter: string; type?: TypeInfo }[],
  propsParams: { name: string; type?: TypeInfo; optional?: boolean; defaultValue?: string; parsed?: ParsedExpr }[],
  seen: ReadonlySet<string>,
): BoxedArithmeticSeed | null {
  // An identity memo passes its dependency's boxed value through unchanged,
  // so it is boxed exactly when that memo is.
  const identityDep = getterCallName(body)
  if (identityDep && isBoxedMemoRead(ctx, identityDep, signals, propsParams, seen)) {
    return { kind: 'boxed-memo-identity', dep: identityDep }
  }
  if (body.kind !== 'binary' || !(body.op in BOXED_ARITHMETIC_HELPER)) return null
  const operand = nonNegativeIntLiteral(body.right)
  if (operand === null) return null
  const dep = getterCallName(body.left)
  return dep && isBoxedMemoRead(ctx, dep, signals, propsParams, seen)
    ? { kind: 'boxed-memo-literal', op: body.op, dep, operand }
    : null
}

/**
 * The memo-chain step: whether getter `name` reads a memo (not a signal, and
 * not one already on this walk) whose own body is boxed.
 */
function isBoxedMemoRead(
  ctx: GoEmitContext,
  name: string,
  signals: { getter: string; type?: TypeInfo }[],
  propsParams: { name: string; type?: TypeInfo; optional?: boolean; defaultValue?: string; parsed?: ParsedExpr }[],
  seen: ReadonlySet<string>,
): boolean {
  if (seen.has(name) || signals.some(s => s.getter === name)) return false
  const memo = ctx.state.currentMemos?.find(m => m.name === name)
  if (!memo?.parsed) return false
  return classifyBoxedArithmetic(ctx, memo.parsed, signals, propsParams, new Set([...seen, name])) !== null
}
