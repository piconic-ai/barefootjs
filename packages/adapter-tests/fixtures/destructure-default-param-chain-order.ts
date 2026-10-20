import { createFixture } from '../src/types'

/**
 * A parameter destructure chain (`{ a = 'x', b = a, c = b }`) whose props type
 * lists the members in the reverse order (`{ c?: string; b?: string; a?: string }`):
 * the pattern's order, not the type's, decides which binding a default reads.
 */
export const fixture = createFixture({
  id: 'destructure-default-param-chain-order',
  description: 'A parameter destructure default chain resolves in pattern order when the props type lists the members in another order',
  source: `
'use client'
export function DestructureDefaultParamChainOrder({ a = 'x', b = a, c = b }: { c?: string; b?: string; a?: string }) {
  return <p>{a}|{b}|{c}</p>
}
`,
  props: { a: 'p' },
  expectedHtml: `
    <p bf-s="test" bf="s3"><!--bf:s0-->p<!--/-->|<!--bf:s1-->p<!--/-->|<!--bf:s2-->p<!--/--></p>
  `,
})
