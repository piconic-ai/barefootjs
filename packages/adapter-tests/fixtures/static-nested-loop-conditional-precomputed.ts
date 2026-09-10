import { createFixture } from '../src/types'

/**
 * `prop-precompute` twin of `static-nested-loop-conditional`.
 *
 * Originally authored (#2893, before its nested-loop structural bail was
 * fixed) to prove that moving `rows` from a component-scope LOCAL const to
 * a PROP escaped the then-refusal — `analyzeBakeableStaticElementLoop`'s
 * refusal keyed specifically on `this.state.localConstants`
 * (`go-template-adapter.ts`), so it never fired for a prop at all. #2893's
 * fix means the NON-@client base fixture now compiles clean on Go too (no
 * refusal left to escape) — kept as its own coverage of a prop-derived
 * nested-loop-plus-conditional shape, mirroring
 * `static-nested-loop-ref-precomputed`'s sibling twin.
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
