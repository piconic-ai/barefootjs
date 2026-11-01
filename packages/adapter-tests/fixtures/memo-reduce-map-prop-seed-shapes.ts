import { createFixture } from '../src/types'

/**
 * Siblings of `memo-reduce-map-prop-seed`: the props-object form, an
 * explicit memo generic, a `.map(...)` memo of strings as a loop source,
 * a `.reduceRight(...)` with a string seed, and a `.reduce(...)` over a
 * signal's array. Each is seeded on the server render.
 */
export const fixture = createFixture({
  id: 'memo-reduce-map-prop-seed-shapes',
  description: 'Memos over `.reduce(...)` / `.reduceRight(...)` / `.map(...)` with a props object, a memo generic, string rows and a signal receiver are seeded on SSR',
  source: `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'
export function MemoReduceMapPropSeedShapes(props: { items: { n: number; label: string }[] }) {
  const [rows, setRows] = createSignal([1, 2.5])
  const doubled = createMemo<number[]>(() => props.items.map(it => it.n * 2))
  const labels = createMemo(() => props.items.map(it => it.label))
  const total = createMemo<number>(() => props.items.reduce((acc, it) => acc + it.n, 0))
  const sum = createMemo(() => rows().reduce((a, b) => a + b, 0))
  const names = createMemo(() => props.items.reduceRight((a, it) => a + it.label, ''))
  return (
    <div data-total={total()} onClick={() => setRows([3])}>
      <span>{total()}</span>
      <span>{sum()}</span>
      <span>{names()}</span>
      <ul>{doubled().map(n => <li key={n}>{n}</li>)}</ul>
      <ol>{labels().map(l => <li key={l}>{l}</li>)}</ol>
    </div>
  )
}
`,
  props: { items: [{ n: 2, label: 'a' }, { n: 3.5, label: 'b' }] },
  expectedHtml: `
    <div bf-s="test" bf="s10" data-total="5.5">
      <span bf="s1"><!--bf:s0-->5.5<!--/--></span>
      <span bf="s3"><!--bf:s2-->3.5<!--/--></span>
      <span bf="s5"><!--bf:s4-->ba<!--/--></span>
      <ul bf="s7">
        <li data-key="4"><!--bf:s6-->4<!--/--></li>
        <li data-key="7"><!--bf:s6-->7<!--/--></li>
      </ul>
      <ol bf="s9">
        <li data-key="a"><!--bf:s8-->a<!--/--></li>
        <li data-key="b"><!--bf:s8-->b<!--/--></li>
      </ol>
    </div>
  `,
})
