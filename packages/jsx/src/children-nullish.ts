/**
 * The parts of a `??` / `||` read of the children prop, shared by the Phase 1
 * classifier (`IRExpression.childrenRead`, #3539, #3554) and the emitters
 * that splice the children markup and escape only the fallback.
 */

import type { ParsedExpr } from './expression-parser.ts'

/**
 * Split a left-nested chain of one fallback operator (`??` or `||`) into the
 * value it reads first and the fallback taken when that value is nullish
 * (`??`) or falsy (`||`): `(c ?? x) ?? y` reads `c`, else `x ?? y`, the same
 * as `c ?? (x ?? y)`. `null` when `parsed` is not a `op` chain.
 */
export function fallbackChainParts(
  parsed: ParsedExpr,
  op: '??' | '||',
): { head: ParsedExpr; fallback: ParsedExpr } | null {
  if (parsed.kind !== 'logical' || parsed.op !== op) return null
  const fallbacks: ParsedExpr[] = []
  let head: ParsedExpr = parsed
  while (head.kind === 'logical' && head.op === op) {
    fallbacks.unshift(head.right)
    head = head.left
  }
  const fallback = fallbacks.reduceRight((right, left) => ({ kind: 'logical', op, left, right }))
  return { head, fallback }
}

/** {@link fallbackChainParts} of a `??` chain. */
export function nullishChainParts(parsed: ParsedExpr): { head: ParsedExpr; fallback: ParsedExpr } | null {
  return fallbackChainParts(parsed, '??')
}
