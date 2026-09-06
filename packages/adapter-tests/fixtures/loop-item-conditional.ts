import { createFixture } from '../src/types'

/**
 * Whole-item loop conditional (#1665): `arr.map(t => cond(t) && <li/>)` makes
 * the conditional the entire loop item, so an item renders 0-or-1 element.
 *
 * The SSR template emits an always-present `<!--bf-loop-i:KEY-->` anchor
 * before each item's conditional content — the true branch as a `bf-c`
 * element, the false branch as the `bf-cond-start/end` marker pair — so
 * `mapArrayAnchored` can track every item (including the empty ones) by its
 * anchor on the client. The `<!--bf-loop:lN-->` boundary markers are stripped
 * by `normalizeHTML`; the per-item anchors and conditional markers are the
 * load-bearing part of this contract.
 *
 * The middle item's key (`b-2`) carries a hyphen deliberately (#2795
 * follow-up): every adapter's `comment()`/`bfComment` primitive splices the
 * key into `<!--bf-loop-i:KEY-->` with no escaping of its own, so a key
 * that could spell `-->` needs `escape_comment_key` (each adapter's own
 * runtime) to neutralize it before this fixture's `expectedHtml` — the
 * `‐` (U+2010) below is that substitution, not a typo. Regenerating this
 * fixture from a build that lacked the fix would show a *raw* hyphen here.
 */
export const fixture = createFixture({
  id: 'loop-item-conditional',
  description: 'Whole-item loop conditional renders per-item anchors + conditional markers (#1665)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function LoopItemConditional() {
  const [items] = createSignal([{ id: 'a' }, { id: 'b-2' }, { id: 'c' }])
  const [sel] = createSignal('b-2')
  return <ul>{items().map(t => sel() === t.id && <li key={t.id}>{t.id}</li>)}</ul>
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s2"><!--bf-loop-i:a--><!--bf-cond-start:s0--><!--bf-cond-end:s0--><!--bf-loop-i:b‐2--><li bf-c="s0" data-key="b-2"><!--bf:s1-->b-2<!--/--></li><!--bf-loop-i:c--><!--bf-cond-start:s0--><!--bf-cond-end:s0--></ul>
  `,
})
