/**
 * Which content slots may carry raw markup at INITIAL render — decided once
 * (#2795, consolidating three copies of the same one-liner that were
 * "trusted by comment" to agree with `emit-reactive.ts`'s writer kind).
 *
 * Every non-conditional `ctx.dynamicElements` entry gets a claim-plan
 * writer of `kind: 'markup'` on the REACTIVE side (`emit-reactive.ts`),
 * because its expression may resolve to a live Node or to a `bfMarkup()`-
 * branded JSX-prop value (#1663, #2651). The initial-render template must
 * make the same call for the same slots — `escapeTextOrMarkup` instead of
 * `escapeText` (`safe-html.ts`'s `spliceChildValue`, arm 3) — so first paint
 * and first update agree on whether the slot unwraps a branded value.
 * `client-template-escape-soundness.test.ts` pins that the two sets are
 * equal on emitted output.
 */

import type { ClientJsContext } from './types.ts'

/** The claim-writer kind every `ctx.dynamicElements` slot is emitted with. */
export const DYNAMIC_ELEMENT_WRITER_KIND = 'markup' as const

/** Slot ids whose initial-render splice must be `escapeTextOrMarkup`. */
export function markupSlotIdsOf(ctx: Pick<ClientJsContext, 'dynamicElements'>): ReadonlySet<string> {
  return new Set(ctx.dynamicElements.map(e => e.slotId))
}
