import { createFixture } from '../src/types'

/**
 * A component forwards JSX children that read the caller's data into a
 * nested component's prop, and the nested component reads that prop
 * without computing state of its own from it: in its markup, or through a
 * signal named like the prop that passes it through unchanged. The nested
 * component sees the forwarded children, not an absent prop. The stateful
 * twin is `children-forwarded-into-child-prop-seed`.
 */
export const fixture = createFixture({
  id: 'children-forwarded-into-child-prop-plain',
  description: 'Children a component forwards into a nested child\'s prop reach that child\'s markup',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
function Plain(props: { seed?: unknown }) {
  return <b>{props.seed ? 'children' : 'fallback'}</b>
}
function Passthrough(props: { seed?: unknown }) {
  const [seed] = createSignal(props.seed ?? 'none')
  return <i>{seed() === 'none' ? 'fallback' : 'children'}</i>
}
function Inner(props: { children?: unknown }) {
  return <p><Plain seed={props.children} /><Passthrough seed={props.children} /></p>
}
export function Host(props: { label: string }) {
  return <div><Inner>{props.label}</Inner></div>
}
`,
  props: { label: 'hi' },
  expectedHtml: `
    <div bf-s="test"><p bf-s="test_s1"><b bf-s="test_s1_s0" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></b><i bf-s="test_s1_s1" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></i></p></div>
  `,
})
