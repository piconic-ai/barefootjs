import { createFixture } from '../src/types'

/**
 * Memos computed from an array prop with `.reduce(...)` and `.map(...)`
 * must be seeded on the server render: the reduce memo renders its sum,
 * and the array a map memo returns drives a loop.
 */
export const fixture = createFixture({
  id: 'memo-reduce-map-prop-seed',
  description: 'A memo over `.reduce(...)` and a memo over `.map(...)` used as a loop source are seeded from the prop on SSR',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function MemoReduceMapPropSeed({ items }: { items: { n: number; label: string }[] }) {
  const doubled = createMemo(() => items.map(it => it.n * 2))
  const total = createMemo(() => items.reduce((acc, it) => acc + it.n, 0))
  return <div data-total={total()}><span>{total()}</span><ul>{doubled().map(n => <li key={n}>{n}</li>)}</ul></div>
}
`,
  props: { items: [{ n: 2, label: 'a' }, { n: 3.5, label: 'b' }] },
  expectedHtml: `
    <div bf-s="test" bf="s4" data-total="5.5">
      <span bf="s1"><!--bf:s0-->5.5<!--/--></span>
      <ul bf="s3">
        <li data-key="4"><!--bf:s2-->4<!--/--></li>
        <li data-key="7"><!--bf:s2-->7<!--/--></li>
      </ul>
    </div>
  `,
})
