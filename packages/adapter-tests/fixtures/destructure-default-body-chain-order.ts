import { createFixture } from '../src/types'

/**
 * A body destructure chain (`const { a = 'x', b = a, c = b } = props`) over a
 * props type that lists the members in the reverse order
 * (`{ c?: string; b?: string; a?: string }`): each default still reads the
 * binding before it in the PATTERN, whatever order the type declares them in.
 */
export const fixture = createFixture({
  id: 'destructure-default-body-chain-order',
  description: 'A body destructure default chain resolves in pattern order when the props type lists the members in another order',
  source: `
'use client'
export function DestructureDefaultBodyChainOrder(props: { c?: string; b?: string; a?: string }) {
  const { a = 'x', b = a, c = b } = props
  return <p>{a}|{b}|{c}</p>
}
`,
  props: { a: 'p' },
  expectedHtml: `
    <p bf-s="test" bf="s3"><!--bf:s0-->p<!--/-->|<!--bf:s1-->p<!--/-->|<!--bf:s2-->p<!--/--></p>
  `,
})
