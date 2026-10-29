/**
 * Which values may hold a JS boolean that the backend received as data, for
 * backends whose own stringification of such a value differs from JS's
 * `String(boolean)`: Perl decodes a JSON `false` to an object that prints
 * `0` (and `true` prints `1`). Unlike `collectBooleanValueNames`, the value
 * need not be a boolean every time — an optional prop, a `boolean | string`
 * union or a `??` fallback may also be absent or another type — so the
 * backend routes it through its JS `String` helper, which prints every value
 * kind as JS does, rather than through `bool_str`.
 */

import type { ParsedExpr } from '../expression-parser.ts'
import type { IRMetadata, TypeInfo } from '../types.ts'

/** Whether a declared type admits a boolean: `boolean`, a boolean literal, or a union with such a member. */
function admitsBoolean(type: TypeInfo | null | undefined): boolean {
  if (!type) return false
  if (type.kind === 'primitive') return type.primitive === 'boolean'
  return type.kind === 'union' && (type.unionTypes ?? []).some(admitsBoolean)
}

/**
 * Signals, memos and props whose declared type admits a boolean, optional or
 * not, plus signals seeded with a boolean literal and no declared type.
 * `names` holds the bare spellings (a getter, a memo, a destructured prop),
 * `props` the caller-facing keys a `props.<key>` member reads. Whether a
 * binding shadows a name is the caller's scope question.
 */
export function collectBooleanCarrierNames(
  metadata: Pick<IRMetadata, 'signals' | 'memos' | 'propsParams' | 'propsObjectName'>,
): { names: Set<string>; props: Set<string> } {
  const names = new Set<string>()
  const props = new Set<string>()
  for (const signal of metadata.signals) {
    const seed = signal.initialValue?.trim()
    const untyped = !signal.type || signal.type.kind === 'unknown'
    if (admitsBoolean(signal.type) || (untyped && (seed === 'true' || seed === 'false'))) names.add(signal.getter)
  }
  for (const memo of metadata.memos ?? []) {
    if (admitsBoolean(memo.type)) names.add(memo.name)
  }
  for (const param of metadata.propsParams) {
    // A destructured union-typed prop keeps its written type in `declaredType`.
    if (!admitsBoolean(param.declaredType ?? param.type)) continue
    props.add(param.sourceName ?? param.name)
    if (!metadata.propsObjectName) names.add(param.name)
  }
  return { names, props }
}

/**
 * Whether `expr` may evaluate to the value of a name `isCarrierName`
 * accepts — a zero-argument getter call, a `props.<key>` member or a bare
 * identifier — read directly, as an operand of `??` / `||` / `&&` (JS
 * returns an operand, not a coerced boolean), or as a ternary branch.
 */
export function mayYieldBooleanCarrier(
  expr: ParsedExpr | null | undefined,
  isCarrierName: (name: string, componentProperty?: boolean) => boolean,
): boolean {
  if (!expr) return false
  switch (expr.kind) {
    case 'logical':
      return mayYieldBooleanCarrier(expr.left, isCarrierName) || mayYieldBooleanCarrier(expr.right, isCarrierName)
    case 'conditional':
      return mayYieldBooleanCarrier(expr.consequent, isCarrierName) || mayYieldBooleanCarrier(expr.alternate, isCarrierName)
    case 'call':
      return expr.callee.kind === 'identifier' && expr.args.length === 0 && isCarrierName(expr.callee.name)
    case 'member':
      return !expr.computed && expr.object.kind === 'identifier' && expr.object.name === 'props' && isCarrierName(expr.property, true)
    case 'identifier':
      return isCarrierName(expr.name)
    default:
      return false
  }
}
