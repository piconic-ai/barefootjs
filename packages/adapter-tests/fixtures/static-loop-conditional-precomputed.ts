import { createFixture } from '../src/types'

/**
 * `prop-precompute` twin of `static-loop-conditional` (#2898) — the SECOND
 * escape kind the Go template BF101 diagnostic claims, alongside
 * `static-loop-conditional-client`.
 *
 * The base refuses on the Go template adapter because `items` is a
 * component-scope LOCAL const and the row contains a conditional —
 * `analyzeBakeableStaticElementLoop`'s `isFoldableTree` bails the whole
 * bake on any `conditional` node, falling through to the generic "local
 * computed value" BF101 fallback. That refusal keys specifically on
 * `this.state.localConstants` (`go-template-adapter.ts`), so it never
 * fires for a PROP at all — a prop binds as an ordinary Go struct field.
 * Moving the array to a prop escapes with full SSR.
 *
 * This does NOT fix #2898 — the compiler still cannot bake a conditional
 * inside a LOCAL static array's row on the Go template adapter. What it
 * proves is that the refusal's first-listed escape genuinely works, full
 * SSR included.
 */
export const fixture = createFixture({
  id: 'static-loop-conditional-precomputed',
  description: 'prop-precompute twin of static-loop-conditional — items moved to a prop, full SSR (#2898)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

type Item = { id: number; label: string }

export function StaticLoopConditionalPrecomputed(props: { items: Item[] }) {
  const [flag] = createSignal(true)
  return (
    <ul>
      {props.items.map(item => (
        <li key={item.id}>
          <span>{item.label}</span>
          {flag() ? <b>on</b> : <i>off</i>}
        </li>
      ))}
    </ul>
  )
}
`,
  props: {
    items: [
      { id: 1, label: 'Alpha' },
      { id: 2, label: 'Beta' },
    ],
  },
  expectedHtml: `
    <ul bf-s="test" bf="s3">
      <li bf="s2" data-key="1">
        <span><!--bf:s0-->Alpha<!--/--></span>
        <b bf-c="s1">on</b>
      </li>
      <li bf="s2" data-key="2">
        <span><!--bf:s0-->Beta<!--/--></span>
        <b bf-c="s1">on</b>
      </li>
    </ul>
  `,
})
