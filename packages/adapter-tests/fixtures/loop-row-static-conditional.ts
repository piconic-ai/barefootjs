import { createFixture } from '../src/types'

/**
 * A `.map()` row containing a reactive conditional whose two arms are
 * wiring-free STATIC elements — the shape the §9.5 conditional widening makes
 * lazy-eligible (`plan/lazy-conditional.ts`).
 *
 * The compiler decision is pinned by unit tests and the DOM behaviour by a
 * runtime test; what neither covers is the rendered OUTPUT, on both legs. The
 * SSR template must render the correct arm per row (adapter conformance) and the
 * CSR template lambda must agree (`csr-conformance.test.ts`) — a widening that
 * drove the swap from the wrong boolean, or hoisted the arms and then rendered
 * the wrong one initially, shows up here as a swapped `class`.
 */
export const fixture = createFixture({
  id: 'loop-row-static-conditional',
  description: 'Loop row with a reactive conditional over two static element arms',
  componentName: 'LoopRowStaticConditional',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type Row = { id: number; done: boolean }
export function LoopRowStaticConditional(props: { rows: Row[] }) {
  const [rows, setRows] = createSignal<Row[]>(props.rows)
  return (
    <ul>
      {rows().map(row => (
        <li key={row.id}>{row.done ? <span class="yes">done</span> : <em class="no">open</em>}</li>
      ))}
    </ul>
  )
}
`,
  props: {
    rows: [
      { id: 1, done: false },
      { id: 2, done: true },
    ],
  },
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <li data-key="1"><em bf-c="s0" class="no">open</em></li>
      <li data-key="2"><span bf-c="s0" class="yes">done</span></li>
    </ul>
  `,
  dataPoints: [{ name: 'empty', props: { rows: [] } }],
})
