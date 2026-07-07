import { createFixture } from '../src/types'

/**
 * A memo depending on another memo (`total` → `doubled` → signal).
 * The single-memo case is pinned by `memo`; the chain pins the SSR
 * initial-value fold through TWO derivation layers — each adapter's
 * constructor/template must compute `doubled` from `count`, then
 * `label` from `doubled`, in dependency order.
 */
export const fixture = createFixture({
  id: 'memo-chain',
  description: 'Memo derived from another memo SSR-computes both layers',
  source: `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'
export function MemoChain() {
  const [count, setCount] = createSignal(3)
  const doubled = createMemo(() => count() * 2)
  const label = createMemo(() => doubled() + 1)
  return (
    <div>
      <span>{doubled()}</span>
      <span>{label()}</span>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test">
      <span bf="s1"><!--bf:s0-->6<!--/--></span>
      <span bf="s3"><!--bf:s2-->7<!--/--></span>
    </div>
  `,
})
