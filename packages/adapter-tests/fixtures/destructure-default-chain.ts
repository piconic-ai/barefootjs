import { createFixture } from '../src/types'

/**
 * A chain of destructure defaults, each reading the binding before it
 * (`{ a = 'x', b = a, c = b }`): an omitted prop takes the value the
 * previous one ended up with, so one passed prop flows down the chain.
 */
export const fixture = createFixture({
  id: 'destructure-default-chain',
  description: 'A chain of destructure defaults each reading the earlier param renders the value the chain resolves to',
  source: `
'use client'
export function DestructureDefaultChain({ a = 'x', b = a, c = b }: { a?: string; b?: string; c?: string }) {
  return <p>{a}|{b}|{c}</p>
}
`,
  props: { a: 'p' },
  expectedHtml: `
    <p bf-s="test" bf="s3"><!--bf:s0-->p<!--/-->|<!--bf:s1-->p<!--/-->|<!--bf:s2-->p<!--/--></p>
  `,
  dataPoints: [
    { name: 'middle', props: { a: 'p', b: 'q' } },
  ],
})
