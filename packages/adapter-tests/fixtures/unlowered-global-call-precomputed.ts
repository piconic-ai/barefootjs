import { createFixture } from '../src/types'

/**
 * prop-precompute twin of `unlowered-global-call`: the caller computes the
 * value and passes it as a prop, which every adapter renders.
 */
export const fixture = createFixture({
  id: 'unlowered-global-call-precomputed',
  description: 'prop-precompute twin of unlowered-global-call — the value arrives as a prop (#3505)',
  source: `
'use client'

export function GlobalCall(props: { stamp: number }) {
  return <p title={props.stamp}>{props.stamp}</p>
}
`,
  props: { stamp: 0 },
  expectedHtml: `
    <p bf-s="test" bf="s1" title="0"><!--bf:s0-->0<!--/--></p>
  `,
})
