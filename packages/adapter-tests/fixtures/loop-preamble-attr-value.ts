import { createFixture } from '../src/types'

/**
 * A `.map()` row whose callback preamble computes an ATTRIBUTE value from the
 * item, with the row's reactive text reading the item directly.
 *
 * This is the shape the §9.5 "row has a map-callback preamble" widening makes
 * lazy-eligible (`plan/lazy-preamble.ts`): the preamble is a call-free `const`
 * declaration, so re-running it is observationally free, and no reactive
 * BINDING reads the local — an attribute reading a preamble local is not
 * classified as reactive, so it is interpolated into the row template and the
 * preamble only has to run in `createRow`.
 *
 * The fixture exists to pin the OUTPUT of that decision at both layers: the
 * SSR template must render the preamble-derived class per row (adapter
 * conformance), and the CSR template lambda must produce the same markup
 * (`csr-conformance.test.ts`). A widening that emitted a lazy plan while
 * dropping the preamble would show up here as a missing `class`.
 */
export const fixture = createFixture({
  id: 'loop-preamble-attr-value',
  description: 'Loop row preamble computes an attribute value; row text reads the item',
  componentName: 'LoopPreambleAttrValue',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type Row = { id: number; label: string; done: boolean }
export function LoopPreambleAttrValue(props: { rows: Row[] }) {
  const [rows, setRows] = createSignal<Row[]>(props.rows)
  return (
    <ul>
      {rows().map(row => {
        const cls = row.done ? 'done' : 'open'
        return (
          <li key={row.id} class={cls}>{row.label}</li>
        )
      })}
    </ul>
  )
}
`,
  props: {
    rows: [
      { id: 1, label: 'write it', done: false },
      { id: 2, label: 'ship it', done: true },
    ],
  },
  expectedHtml: `
    <ul bf-s="test" bf="s2">
      <li bf="s1" class="open" data-key="1"><!--bf:s0-->write it<!--/--></li>
      <li bf="s1" class="done" data-key="2"><!--bf:s0-->ship it<!--/--></li>
    </ul>
  `,
  dataPoints: [{ name: 'empty', props: { rows: [] } }],
})
