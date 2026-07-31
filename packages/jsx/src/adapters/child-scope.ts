/**
 * Whether a child component derives its `bf-s` scope id from its parent
 * scope + mount slot (`${parentScopeId}_${slotId}`) rather than getting a
 * freshly randomized one (`${name}_${random}`).
 *
 * A component derives from its slot unless it is the DIRECT root of a loop
 * row (`IRComponent.loopItemRoot`, set once in `jsx-to-ir.ts`'s loop
 * builder) — a row root owns its own per-row identity, matching Hono's
 * reference behaviour (#2444). Every backend (Hono, each DSL adapter, and
 * both CSR template emitters) MUST consult this single predicate instead of
 * re-deriving the fact from a mutable "am I inside a loop" flag, which is
 * what caused #2444: such flags stay true for an entire loop subtree and
 * can't distinguish a row root from a component nested below it.
 */

import type { IRComponent } from '../types.ts'

export function derivesScopeFromSlot(
  comp: Pick<IRComponent, 'slotId' | 'loopItemRoot'>
): boolean {
  return comp.slotId != null && comp.loopItemRoot !== true
}
