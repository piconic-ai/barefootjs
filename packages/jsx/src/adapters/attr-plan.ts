/**
 * How a DSL adapter emits an intrinsic element's attribute (#3478), as data.
 *
 * Every DSL adapter's `elementAttrEmitter` makes the same decisions for an
 * `{expr}` attribute value and a `{...spread}`; only the spelling differs.
 * {@link planAttrExpression} and {@link planSpreadAttr} make them once. The
 * adapter keeps what is its own: the style-object lowering and the refusal
 * gate before the plan, and, per plan kind, the escape call (`bf.string`,
 * `bf.h`, `e(...)`), the nil and truthy tests, the temporary binding and the
 * hash literal.
 */

import { parseExpression, type ParsedExpr } from '../expression-parser.ts'
import { attrValueMayBeNullish, nullableSignalAttrGetter, type NullishAttrContext } from '../nullable-signal-attr.ts'
import type { ConstantInfo, ExpressionAttr, SpreadAttr } from '../types.ts'
import { isBooleanAttr } from '../html-constants.ts'

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/

/**
 * The emission of an `{expr}` attribute value.
 *
 * - `omit-nullable`: a bare read of an optional, no-default prop or of a
 *   nullable signal (#2248, #3304). The attribute is guarded by a nil test
 *   on the value itself, as Hono drops an `undefined` attribute.
 *   `restKey` marks a closed-type rest-expanded key (`rest.tag`, #3057).
 * - `boolean-attr`: an HTML boolean attribute (`disabled`), present when
 *   the value is truthy.
 * - `presence`: `attr={expr || undefined}` (#1897). The value is bound to a
 *   temporary once and rendered when truthy.
 * - `undefined-alternate`: `attr={cond ? value : undefined}`. The attribute
 *   is rendered when `cond` holds.
 * - `omit-nil`: a value that may reach `null` / `undefined` through a memo,
 *   an optional member read or a ternary branch (#3322). The value is bound
 *   to a temporary once and rendered when not nil.
 * - `plain`: always rendered.
 *
 * `boolStr`: the value is boolean-shaped and goes through `bool_str`, so the
 * bytes match JS `String(boolean)`.
 */
export type AttrExpressionPlan<Ternary> =
  | { kind: 'omit-nullable'; boolStr: boolean; restKey: boolean }
  | { kind: 'boolean-attr' }
  | { kind: 'presence'; boolStr: boolean }
  | { kind: 'undefined-alternate'; ternary: Ternary }
  | { kind: 'omit-nil'; boolStr: boolean }
  | { kind: 'plain'; boolStr: boolean }

export interface AttrPlanContext<Ternary> {
  /** The SolidJS-style props identifier (`function C(props: P)`), if any. */
  propsObjectName: string | null
  /** The destructured `...rest` binding (`function C({ ...rest })`), if any. */
  restPropsName: string | null
  /** Optional, no-default props, by bare name (`collectNullableOptionalProps`). */
  nullableOptionalProps: ReadonlySet<string>
  /** Signal getters whose SSR value may be `undefined` (`collectNullableSignalGetters`). */
  nullableSignalGetters: ReadonlySet<string>
  nullishAttrCtx: NullishAttrContext
  /** A loop binding at the attribute site shadows `name`. */
  isLoopBound(name: string): boolean
  /** The adapter routes this value through `bool_str`. */
  boolStr(expr: string, name: string): boolean
  /** The adapter's parse of `cond ? value : undefined`, or `null`. */
  undefinedAlternateTernary(expr: string): Ternary | null
}

/** Plan an `{expr}` attribute value. */
export function planAttrExpression<Ternary>(
  value: ExpressionAttr,
  name: string,
  ctx: AttrPlanContext<Ternary>,
): AttrExpressionPlan<Ternary> {
  const booleanAttr = isBooleanAttr(name)
  if (!booleanAttr && !value.presenceOrUndefined) {
    const nullable = nullableBareRead(value, ctx)
    if (nullable !== null) return { kind: 'omit-nullable', boolStr: ctx.boolStr(value.expr, name), restKey: nullable.restKey }
  }
  if (booleanAttr) return { kind: 'boolean-attr' }
  if (value.presenceOrUndefined) return { kind: 'presence', boolStr: ctx.boolStr(value.expr, name) }
  const ternary = ctx.undefinedAlternateTernary(value.expr)
  if (ternary) return { kind: 'undefined-alternate', ternary }
  const boolStr = ctx.boolStr(value.expr, name)
  if (attrValueMayBeNullish(value.parsed, ctx.nullishAttrCtx, (n) => ctx.isLoopBound(n))) return { kind: 'omit-nil', boolStr }
  return { kind: 'plain', boolStr }
}

/**
 * Whether the value is a bare read of a nullable optional prop (`id`,
 * `props.id`, `rest.id`) or of a nullable signal (`title()`) that no loop
 * binding shadows (#2488). `restKey`: the read names a rest-expanded key.
 */
function nullableBareRead<Ternary>(value: ExpressionAttr, ctx: AttrPlanContext<Ternary>): { restKey: boolean } | null {
  const bare = value.expr.trim()
  const restKey = ctx.restPropsName !== null && bare.startsWith(`${ctx.restPropsName}.`)
  let normalized = bare
  if (ctx.propsObjectName && bare.startsWith(`${ctx.propsObjectName}.`)) normalized = bare.slice(ctx.propsObjectName.length + 1)
  else if (restKey) normalized = bare.slice(ctx.restPropsName!.length + 1)
  const prop = IDENTIFIER.test(normalized) && ctx.nullableOptionalProps.has(normalized) && !ctx.isLoopBound(normalized)
  const signal = nullableSignalAttrGetter(value.parsed, ctx.nullableSignalGetters)
  if (prop || (signal !== null && !ctx.isLoopBound(signal))) return { restKey }
  return null
}

/**
 * The emission of a `{...spread}` attribute.
 *
 * - `props-object`: `{...props}`, the component's own props object, which no
 *   template scope holds as one value. The adapter enumerates `params` into
 *   a hash literal.
 * - `value`: any other spread. The adapter tries its conditional-spread
 *   lowering (`{...(cond ? {…} : {})}`) on each of `candidates` in order:
 *   the spread's own tree, then the initializer of the function-scope
 *   `const` it names (`const sizeAttrs = size ? {…} : {}`), unless a loop
 *   binding shadows that name (#2489). If none lowers, it spreads the
 *   expression itself.
 */
export type SpreadAttrPlan =
  | { kind: 'props-object'; params: string[] }
  | { kind: 'value'; candidates: Array<ParsedExpr | undefined> }

export interface SpreadPlanContext {
  propsObjectName: string | null
  propsParams: ReadonlyArray<{ name: string }>
  localConstants: readonly ConstantInfo[]
  /** A binding at the spread site shadows `name`. */
  isBound(name: string): boolean
}

/** Plan a `{...spread}` attribute. */
export function planSpreadAttr(value: SpreadAttr, ctx: SpreadPlanContext): SpreadAttrPlan {
  const trimmed = value.expr.trim()
  if (ctx.propsObjectName && ctx.propsObjectName === trimmed) {
    return { kind: 'props-object', params: ctx.propsParams.map((p) => p.name) }
  }
  const candidates: Array<ParsedExpr | undefined> = [value.parsed]
  const init = localConstInitializer(trimmed, ctx)
  if (init !== null) candidates.push(parseExpression(init))
  return { kind: 'value', candidates }
}

/** The initializer text of the function-scope `const` a bare spread names, unless it is itself a bare name. */
function localConstInitializer(name: string, ctx: SpreadPlanContext): string | null {
  if (!IDENTIFIER.test(name) || ctx.isBound(name)) return null
  const init = ctx.localConstants.find((c) => c.name === name && !c.isModule)?.value?.trim()
  return init !== undefined && !IDENTIFIER.test(init) ? init : null
}
