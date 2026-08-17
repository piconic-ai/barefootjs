import { createFixture } from '../src/types'

/**
 * The sound escape for `rich-prop-client-read`'s BF049 refusal (#2643):
 * instead of declaring the prop `Map`-typed (which can never survive the
 * `bf-p` JSON boundary), pass an already-serializable value — an entries
 * array — and reconstruct the `Map` client-side, inside the handler that
 * actually needs it. `entries: [string, number][]` is a plain JSON array,
 * so it round-trips through `bf-p` intact on every adapter; `new
 * Map(entries)` then rebuilds the exact same `Map` the refused fixture's
 * `data` prop was trying (and failing) to carry directly.
 */
export const fixture = createFixture({
  id: 'rich-prop-precompute',
  description: 'BF049 escape: pass entries as a plain array and rebuild the Map client-side',
  source: `
'use client'
export function RichPropPrecompute({ entries }: { entries: [string, number][] }) {
  return <button onClick={() => console.log(new Map(entries).get('x'))}>go</button>
}
`,
  props: { entries: [['x', 1]] },
  expectedHtml: `
    <button bf-s="test" bf="s0">go</button>
  `,
})
