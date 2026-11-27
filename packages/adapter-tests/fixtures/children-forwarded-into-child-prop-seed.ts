import { createFixture } from '../src/types'

/**
 * A component that forwards its own children into a non-children prop of a
 * nested component, which seeds a signal from that prop with a `??`
 * fallback. The nested signal holds the children the outer call passes
 * (the caller's label), not the fallback. The child renders a test of the
 * signal rather than the signal itself, so the fixture is about which value
 * the signal holds; printing markup children read into state is limitation
 * `children-element-read-into-state`.
 */
export const fixture = createFixture({
  id: 'children-forwarded-into-child-prop-seed',
  description: 'Children a component forwards into a nested child\'s non-children prop reach that child\'s signal seed',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
function Kid(props: { seed?: unknown }) {
  const [v] = createSignal(props.seed ?? 'none')
  return <b>{v() === 'none' ? 'fallback' : 'children'}</b>
}
function Inner(props: { children?: unknown }) {
  return <Kid seed={props.children} />
}
export function C(props: { label: string }) {
  return <Inner>{props.label}</Inner>
}
`,
  props: { label: 'hi' },
  expectedHtml: `
    <b bf-s="test_s1_s0" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></b>
  `,
})
