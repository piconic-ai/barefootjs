import { createFixture } from '../src/types'

/**
 * Nested rest destructure in a `.map()` callback
 * (`{ id, cells: [head, ...rest] }`).
 *
 * Exercises the IR walker recursing into a nested array binding inside an
 * object pattern, where the inner pattern carries the rest token. Same
 * adapter parity contract as the flat-rest fixtures: Hono / CSR lowers it;
 * Go / Mojo refuse the loop destructure with BF104. See #1310.
 */
export const fixture = createFixture({
  id: 'rest-destructure-nested-in-map',
  description: 'Nested rest destructure inside object pattern in .map() (#1310)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

type Row = { id: string; cells: readonly string[] }
export function RestNested() {
  const [rows, setRows] = createSignal<Row[]>([
    { id: 'r1', cells: ['a', 'b', 'c'] },
    { id: 'r2', cells: ['x', 'y'] },
  ])
  return (
    <ul onClick={() => setRows(r => r)}>
      {rows().map(({ id, cells: [head, ...rest] }) => (
        <li key={id}>{head}:{String(rest.length)}</li>
      ))}
    </ul>
  )
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s2">
      <li data-key="r1"><!--bf:s0-->a<!--/-->:<!--bf:s1-->2<!--/--></li>
      <li data-key="r2"><!--bf:s0-->x<!--/-->:<!--bf:s1-->1<!--/--></li>
    </ul>
  `,
})
