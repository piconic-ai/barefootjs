import { createFixture } from '../src/types'

/**
 * `prop-precompute` twin of `static-nested-loop-conditional` (#2893) — the
 * SECOND escape kind the Go template BF101 diagnostic claims, alongside
 * `static-nested-loop-conditional-client`.
 *
 * The base refuses on the Go template adapter because `rows` is a
 * component-scope LOCAL const — `analyzeBakeableStaticElementLoop`'s
 * static-loop bake can't unroll the nested inner `.map()` (the SAME #2893
 * trigger `static-nested-loop-ref` already pins; the inner row's own
 * conditional never even gets a chance to matter — a nested `loop` node
 * alone already bails `isFoldableTree`). That refusal keys specifically on
 * `this.state.localConstants` (`go-template-adapter.ts`), so it never
 * fires for a PROP at all — a prop binds as an ordinary Go struct field.
 * Moving the array to a prop escapes with full SSR.
 *
 * This does NOT fix #2893 — the compiler still cannot bake a nested inner
 * `.map()` inside a LOCAL static array's row on the Go template adapter.
 * What it proves is that the refusal's first-listed escape genuinely
 * works, full SSR included, for this fixture specifically (mirroring
 * `static-nested-loop-ref-precomputed`'s already-proven twin for the
 * ref/text/attr sibling shape).
 */
export const fixture = createFixture({
  id: 'static-nested-loop-conditional-precomputed',
  description: 'prop-precompute twin of static-nested-loop-conditional — rows moved to a prop, full SSR (#2893)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

type Child = { id: number }
type Row = { id: number; children: Child[] }

export function StaticNestedLoopConditionalPrecomputed(props: { rows: Row[] }) {
  const [flag] = createSignal(true)
  return (
    <ul>
      {props.rows.map(row => (
        <li key={row.id}>
          {row.children.map(child => (
            <span key={child.id}>
              {flag() ? <b>on</b> : <i>off</i>}
            </span>
          ))}
        </li>
      ))}
    </ul>
  )
}
`,
  props: {
    rows: [{ id: 1, children: [{ id: 11 }, { id: 12 }] }],
  },
  expectedHtml: `
    <ul bf-s="test" bf="s3"><li bf="s2" data-key="1"><span bf="s1" data-key-1="11"><b bf-c="s0">on</b></span><span bf="s1" data-key-1="12"><b bf-c="s0">on</b></span></li></ul>
  `,
})
