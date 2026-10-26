/**
 * Constructor-time Go values for a child component's props (#3425): the
 * value-resolution steps `lowerChildInputFields` (`props/child-input-fields.ts`)
 * tries for one caller-side prop value before it lands in the child's
 * `New<Child>Props(<Child>Input{...})` literal. Free functions over a
 * {@link GoEmitContext}:
 *
 * - {@link templatePartsToGoCode} — a template literal's parsed parts.
 * - {@link resolveLocalGetterAsGo} — a bare local signal/memo getter's seed.
 * - {@link unboxNillablePropRef} — a nillable prop's `in.<Field>` unboxed into
 *   a concrete child field.
 * - {@link evaluateChildPropValue} — a value computed by the runtime evaluator
 *   (or read off this component's own rest bag), typed for its destination.
 */

import { inlineComputedConsts, type ComponentIR, type IRTemplatePart, type JsSourceText, type ParsedExpr, type ParsedStatement, type TypeInfo } from '@barefootjs/jsx'

import type { GoEmitContext } from '../emit-context.ts'
import { capitalizeFieldName } from '../lib/go-naming.ts'
import type { ChildComponentShape, PropFallbackVar } from '../lib/types.ts'
import { routesToRestBag } from '../lib/types.ts'
import { computeMemoInitialValueOrNull, evalExprGo, evaluatedAsGoType } from '../memo/memo-compute.ts'
import { signalSeedGo } from '../type/state-fields.ts'
import { unboxToGoScalar } from './value-lowering.ts'

/**
 * Convert a template literal's parsed parts into a `string`-typed Go
 * expression in `NewXxxProps` scope (destructured prop refs → `in.FieldName`),
 * or null so the caller falls back to `resolveDynamicPropValue`. A `string`
 * part emits a Go literal; a `lookup` (`${MAP[KEY]}` over a `Record<T,string>`,
 * key must be a bare prop ident) emits a switch-on-key IIFE. `ternary` opts out
 * — the element-attribute path handles it via `{{if}}`.
 */
export function templatePartsToGoCode(
  ctx: GoEmitContext,
  parts: IRTemplatePart[],
  propsParams: { name: string; sourceName?: string }[]
): string | null {
  const segments: string[] = []
  let usesFmt = false
  for (const part of parts) {
    if (part.type === 'string') {
      segments.push(JSON.stringify(part.value))
      continue
    }
    if (part.type === 'lookup') {
      const lookup = lookupPartToGoCode(part, propsParams)
      if (lookup === null) return null
      segments.push(lookup.code)
      usesFmt ||= lookup.usesFmt
      continue
    }
    // ternary or future part kinds — opt out so the caller falls back to the
    // bare-expression path.
    return null
  }
  // Set only once the whole literal lowered: an opted-out literal falls back
  // to another path and must not leave `fmt` imported.
  if (usesFmt) ctx.state.usesFmt = true
  if (segments.length === 0) return '""'
  return segments.join(' + ')
}

/**
 * One `lookup` part of {@link templatePartsToGoCode}: a switch-on-key IIFE
 * (and whether it needs `fmt`), or null when the key isn't a bare prop.
 */
function lookupPartToGoCode(
  part: Extract<IRTemplatePart, { type: 'lookup' }>,
  propsParams: { name: string; sourceName?: string }[],
): { code: string; usesFmt: boolean } | null {
  const keyExpr = part.key.trim()
  const param = propsParams.find(p => p.name === keyExpr)
  if (!param) return null
  // Input field is caller-facing (#2525); `keyExpr` is the LOCAL prop
  // binding used in the source expression.
  const fieldName = capitalizeFieldName(param.sourceName ?? keyExpr)
  const caseEntries = Object.entries(part.cases)
  if (caseEntries.length === 0) return { code: '""', usesFmt: false }
  const lines: string[] = []
  lines.push('func() string {')
  // `fmt.Sprint` is type-tolerant: the key field is `interface{}` when the
  // analyzer typed the prop, but a `string` when the shared inherited-prop
  // augmentation synthesised it — a `.(string)` assertion would compile
  // for the former only.
  lines.push(`\t\t\tswitch fmt.Sprint(in.${fieldName}) {`)
  for (const [k, v] of caseEntries) {
    lines.push(`\t\t\tcase ${JSON.stringify(k)}: return ${JSON.stringify(v)}`)
  }
  lines.push('\t\t\t}')
  lines.push('\t\t\treturn ""')
  lines.push('\t\t}()')
  return { code: lines.join('\n'), usesFmt: true }
}

/**
 * `value` unboxed into a child's concrete scalar Input field when it is
 * the bare `in.<Field>` of a prop this component flipped to `interface{}`
 * (`resolvePropGoType`, #3422) — reached by a direct passthrough
 * (`text={props.text}`) or an identity memo over it (`text={relayed()}`).
 * Any other value, or an unknown / non-scalar destination, is unchanged.
 */
export function unboxNillablePropRef(
  ctx: GoEmitContext,
  value: string,
  propsParams: readonly { name: string; sourceName?: string }[],
  destGoType: string | undefined,
): string {
  if (!destGoType) return value
  const param = propsParams.find(p => value === `in.${capitalizeFieldName(p.sourceName ?? p.name)}`)
  if (!param || !ctx.state.nillablePropNames.has(param.name)) return value
  return unboxToGoScalar(value, destGoType) ?? value
}

/**
 * A child prop read off this component's own rest bag (`rest.tone`, the
 * per-key form a closed `{...rest}` spread onto a child expands to, #3530):
 * the bag's entry, nil when the caller omitted the key, so the child sees
 * the omission. A concrete child field takes the entry converted to its
 * type. Null for any other value.
 */
function restMemberChildPropValue(
  ctx: GoEmitContext,
  value: ParsedExpr,
  propName: string,
  childShape: ChildComponentShape | undefined,
): string | null {
  const restName = ctx.state.restPropsName
  if (
    restName === null || value.kind !== 'member' || value.computed ||
    value.object.kind !== 'identifier' || value.object.name !== restName
  ) {
    return null
  }
  const ref = `in.${capitalizeFieldName(restName)}[${JSON.stringify(value.property)}]`
  if (routesToRestBag(childShape, propName) || childShape?.nillableParamNames.has(propName)) return ref
  const goType = childShape?.paramGoTypes.get(propName)
  return goType === undefined ? null : unboxToGoScalar(ref, goType)
}

/**
 * A child prop value computed by the runtime evaluator over this
 * component's seeds (`evalExprGo`), typed for its destination: a rest-bag
 * entry or a nillable Input field takes the `any` result, a concrete field
 * its JS-coerced Go type (`evaluatedAsGoType`). Null when the value is
 * outside the evaluator's surface or the destination type can't take it.
 */
export function evaluateChildPropValue(
  ctx: GoEmitContext,
  value: ParsedExpr,
  propName: string,
  childShape: ChildComponentShape | undefined,
  ir: ComponentIR,
  propFallbackVars: ReadonlyMap<string, PropFallbackVar>,
): string | null {
  const restRead = restMemberChildPropValue(ctx, value, propName, childShape)
  if (restRead !== null) return restRead
  // A component-scope computed const (`const shown = props.label ?? 'd'`)
  // is read through its value, not its name (#3507) — a const shadowing a
  // prop would otherwise read the prop and drop the const's default.
  const evaluated = evalExprGo(
    ctx, inlineComputedConsts(value, ctx.state.computedConsts), ir.metadata.signals,
    ir.metadata.propsParams, propFallbackVars, new Set(),
  )
  if (evaluated === null) return null
  if (routesToRestBag(childShape, propName) || childShape?.nillableParamNames.has(propName)) return evaluated
  const goType = childShape?.paramGoTypes.get(propName)
  return goType === undefined ? null : evaluatedAsGoType(evaluated, goType)
}

/**
 * Resolve a BARE getter name (a local signal or memo, e.g. `count` in
 * `<Display value={count} />`) against this component's own constructor-
 * time seeding — the SAME value the CALLED form (`count()`) already bakes
 * in `resolveDynamicPropValue`'s `getterMatch` branch, and the signal's own
 * top-level field (`signalSeedGo`). `null` when `name` doesn't name a
 * local signal or memo at all (the caller then tries other resolutions —
 * a passthrough prop, or gives up and omits the field).
 *
 * A memo forwards through `computeMemoInitialValueOrNull` with the REAL
 * `propFallbackVars` (not `undefined`, unlike this function's one caller
 * used to pass) so a memo over a `props.X ?? N`-seeded signal sees the
 * hoisted var too — a strict improvement, not a behavior change for any
 * memo that doesn't reference such a signal.
 */
export function resolveLocalGetterAsGo(
  ctx: GoEmitContext,
  name: string,
  signals: { getter: string; setter: string | null; initialValue: JsSourceText; type: TypeInfo; parsed?: ParsedExpr }[],
  memos: { name: string; computation: JsSourceText; deps: string[]; parsed?: ParsedExpr; parsedBlock?: ParsedStatement[]; parsedBlockComplete?: boolean }[],
  propsParams: { name: string; sourceName?: string }[],
  propFallbackVars: ReadonlyMap<string, PropFallbackVar>,
  nillableDest = false,
): string | null {
  const signal = signals.find(s => s.getter === name)
  if (signal) return signalSeedGo(ctx, signal, propsParams, propFallbackVars, signal.type, nillableDest)

  const memo = memos.find(m => m.name === name)
  if (memo) {
    return (
      ctx.state.hoistedMemoLocals.get(memo.name) ??
      computeMemoInitialValueOrNull(ctx, memo, signals, propsParams, propFallbackVars, new Set([memo.name]))
    )
  }

  return null
}
