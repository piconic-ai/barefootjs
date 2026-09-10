import { createFixture } from '../src/types'

/**
 * `prop-precompute` twin of `static-nested-loop-ref` (#2909 — originally
 * pinned to #2893, whose nested-loop structural bail is now fixed; the
 * base fixture's OWN remaining refusal is the narrower #2909, a signal
 * call in the inner row's text) — the SECOND escape kind the Go template
 * BF101 diagnostic claims, alongside `static-nested-loop-ref-client`.
 *
 * The base refuses on the Go template adapter because `count()` (a signal
 * read in the inner row's text) has no item-independent bake path
 * (`allExpressionsFoldFor`'s plain-`expression` case, unlike a
 * `conditional`'s own condition — #2898's `classifyBakedCondition`). A prop
 * doesn't change that — but this twin's array IS the loop source, and
 * `analyzeBakeableStaticElementLoop`'s bake gate never even considers a
 * prop-derived array (it keys off `this.state.localConstants`,
 * `go-template-adapter.ts`) — a prop binds as an ordinary Go struct field
 * and the loop renders via the adapter's normal `{{range}}` path instead,
 * where `count()` resolves fine (real dot-context, no bake involved).
 * Moving the array to a prop escapes with full SSR (contrast with the
 * `-client` twin, which renders the loop host empty until hydration).
 *
 * This does NOT fix #2909 — the compiler still cannot bake a signal read
 * inside a nested LOCAL static array's row on the Go template adapter.
 * What it proves is that the refusal's first-listed escape genuinely
 * works, full SSR included.
 */
export const fixture = createFixture({
  id: 'static-nested-loop-ref-precomputed',
  description: 'prop-precompute twin of static-nested-loop-ref — items moved to a prop, full SSR (#2909)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

type Child = { id: number }
type Item = { id: number; children: Child[] }

export function StaticNestedLoopRefPrecomputed(props: { items: Item[] }) {
  const [count] = createSignal(0)
  const trackMount = (el: Element) => { el.setAttribute('data-tracked', '1') }
  return (
    <ul>
      {props.items.map(item => (
        <li key={item.id}>
          {item.children.map(child => (
            <span key={child.id} ref={trackMount}>{child.id}:{count()}</span>
          ))}
        </li>
      ))}
    </ul>
  )
}
`,
  props: {
    items: [{ id: 1, children: [{ id: 11 }, { id: 12 }] }],
  },
  expectedHtml: `
    <ul bf-s="test" bf="s4"><li bf="s3" data-key="1"><span bf="s2" data-key-1="11"><!--bf:s0-->11<!--/-->:<!--bf:s1-->0<!--/--></span><span bf="s2" data-key-1="12"><!--bf:s0-->12<!--/-->:<!--bf:s1-->0<!--/--></span></li></ul>
  `,
})
