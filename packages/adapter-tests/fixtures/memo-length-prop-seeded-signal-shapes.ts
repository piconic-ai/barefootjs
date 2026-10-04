import { createFixture } from '../src/types'

/**
 * Sibling of `memo-length-prop-seeded-signal`: the length-read shapes a memo
 * over a prop-seeded array signal takes, seeded from a DESTRUCTURED prop.
 * Covers a bare `.length`, arithmetic over it (a literal operand, and a
 * number-typed memo through the shared arithmetic runtime), and the
 * nullish-guarded `?.length ?? 0` form over an optional prop the caller
 * omits (renders `0`, the JS value of `undefined?.length ?? 0`).
 */
export const fixture = createFixture({
  id: 'memo-length-prop-seeded-signal-shapes',
  description: 'Memos over the length of destructured-prop-seeded array signals render the seeded lengths at SSR',
  source: `
'use client'
import { createMemo, createSignal } from '@barefootjs/client'

export function TagSummary({ items, tags }: { items: string[]; tags?: string[] }) {
  const [list] = createSignal(items)
  const [tagList] = createSignal(tags)
  const count = createMemo(() => list().length)
  const doubled = createMemo(() => list().length * 2)
  const remaining = createMemo(() => list().length - 1)
  const total = createMemo(() => list().length + count())
  const tagCount = createMemo(() => tagList()?.length ?? 0)
  return (
    <div>
      <p>{count()} items</p>
      <p>{doubled()} doubled</p>
      <p>{remaining()} remaining</p>
      <p>{total()} total</p>
      <p>{tagCount()} tags</p>
    </div>
  )
}
`,
  props: { items: ['a', 'b', 'c'] },
  expectedHtml: `
    <div bf-s="test">
      <p bf="s1"><!--bf:s0-->3<!--/--> items</p>
      <p bf="s3"><!--bf:s2-->6<!--/--> doubled</p>
      <p bf="s5"><!--bf:s4-->2<!--/--> remaining</p>
      <p bf="s7"><!--bf:s6-->6<!--/--> total</p>
      <p bf="s9"><!--bf:s8-->0<!--/--> tags</p>
    </div>
  `,
})
