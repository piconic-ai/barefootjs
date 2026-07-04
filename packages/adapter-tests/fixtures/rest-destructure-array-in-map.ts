import { createFixture } from '../src/types'

/**
 * Array rest destructure in a `.map()` callback (`[first, ...tail]`).
 *
 * Counterpart to `rest-destructure-object-in-map`. The Hono / CSR emit
 * path lowers the rest binding to `__bfItem().slice(n)`; since #2087 the
 * template adapters lower it too (a per-item local bound to the runtime
 * `slice` helper — the exact JS slice, so `tail.length` composes through
 * each adapter's member emitter). Previously refused with BF104 (#1310).
 */
export const fixture = createFixture({
  id: 'rest-destructure-array-in-map',
  description: 'Array rest destructure in .map() callback (#1310)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

type Row = readonly [string, string, string]
export function RestArray() {
  const [rows, setRows] = createSignal<Row[]>([
    ['r1', 'a', 'b'],
    ['r2', 'c', 'd'],
  ])
  return (
    <ul onClick={() => setRows(r => r)}>
      {rows().map(([first, ...tail]) => (
        <li key={first}>{first}:{String(tail.length)}</li>
      ))}
    </ul>
  )
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s2">
      <li data-key="r1"><!--bf:s0-->r1<!--/-->:<!--bf:s1-->2<!--/--></li>
      <li data-key="r2"><!--bf:s0-->r2<!--/-->:<!--bf:s1-->2<!--/--></li>
    </ul>
  `,
})
