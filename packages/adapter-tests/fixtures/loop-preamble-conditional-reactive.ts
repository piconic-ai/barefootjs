import { createFixture } from '../src/types'

/**
 * #2596 — a `.map()` row whose reactive CONDITION is a bare reference to a
 * preamble-declared local (`isHot`), whose own initializer reads a prop
 * (`props.highlight`) in addition to the item. Before the fix, the
 * conditional's IR `reactive` flag was never set for this shape (Phase 1's
 * classifiers only see the token `isHot`, never its declaration), so the
 * branch silently froze at its row-construction value instead of re-running
 * when `highlight` changed.
 *
 * This fixture pins the OUTPUT of the fix at both layers, same as
 * `loop-preamble-attr-value` (#2447, the ATTRIBUTE twin) and
 * `loop-row-static-conditional` (#2596's non-preamble sibling): the SSR
 * template must render the preamble-derived branch per row (adapter
 * conformance), and the CSR template lambda must produce the same markup
 * (`csr-conformance.test.ts`). A regression that dropped the `reactive` flag
 * (or its Phase-2 `readsPreamble` wiring) again would show up here only
 * indirectly — the INITIAL render is correct either way, since both the
 * broken and fixed compiler render the row's construction-time value
 * correctly. The generated-code SHAPE of the fix itself (the actual re-run
 * wiring) is pinned by the compiler-unit tests in
 * `packages/jsx/src/__tests__/preamble-conditional-reactivity.test.ts` — this
 * fixture's job is cross-adapter byte parity of what that wiring renders.
 *
 * Uses a PROP (not a signal) as the preamble's non-item reactive input
 * deliberately: `csr-conformance.test.ts` evaluates the CSR "materialize"
 * template function in isolation, and a signal read directly inside a loop
 * preamble is spliced into that template verbatim (unresolved at template-
 * eval scope) — a separate, pre-existing gap unrelated to #2596. A prop read
 * (`_p.highlight`) is always in scope there, so the fixture exercises the
 * SAME preamble-reactivity classification (`isReactiveExpression` also
 * proves prop reads reactive, not just signal/memo reads) without tripping
 * that unrelated limitation.
 */
export const fixture = createFixture({
  id: 'loop-preamble-conditional-reactive',
  description: 'Loop row preamble computes a conditional-condition value from item + prop',
  componentName: 'LoopPreambleConditionalReactive',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type Row = { id: number; label: string; done: boolean }
export function LoopPreambleConditionalReactive(props: { rows: Row[]; highlight: boolean }) {
  const [rows, setRows] = createSignal<Row[]>(props.rows)
  return (
    <ul>
      {rows().map(row => {
        const isHot = row.done || props.highlight
        return (
          <li key={row.id}>{isHot ? <b>{row.label}</b> : <span>{row.label}</span>}</li>
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
    highlight: false,
  },
  expectedHtml: `
    <ul bf-s="test" bf="s3">
      <li data-key="1"><span bf-c="s2"><!--bf:s1-->write it<!--/--></span></li>
      <li data-key="2"><b bf-c="s2"><!--bf:s0-->ship it<!--/--></b></li>
    </ul>
  `,
  dataPoints: [
    { name: 'empty', props: { rows: [], highlight: false } },
    {
      name: 'highlight-all',
      props: {
        rows: [
          { id: 1, label: 'write it', done: false },
          { id: 2, label: 'ship it', done: true },
        ],
        highlight: true,
      },
    },
  ],
})
