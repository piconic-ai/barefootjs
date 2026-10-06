import { createFixture } from '../src/types'

/**
 * Sibling of `optional-chain-length-presence-matrix` (#3332): the receiver
 * of an optional-chained `.length` is itself a conditional or a `??`
 * expression. A present selected array reads its length, and an absent one
 * renders empty or falls back through `?? 0`.
 */
export const fixture = createFixture({
  id: 'optional-chain-length-composed-receiver',
  description: 'An optional-chained `.length` over a conditional or `??` receiver',
  source: `
'use client'
type Props = { flag: boolean; a?: number[]; b: number[]; c?: number[]; d?: number[] }
export function OptionalChainLengthComposed(props: Props) {
  return (
    <ul>
      <li>{(props.flag ? props.a : props.b)?.length}|{(props.flag ? props.a : props.b)?.length ?? 0}</li>
      <li>{(props.flag ? props.c : props.b)?.length}|{(props.flag ? props.c : props.b)?.length ?? 0}</li>
      <li>{(props.c ?? props.a)?.length}|{(props.c ?? props.a)?.length ?? 0}</li>
      <li>{(props.c ?? props.d)?.length}|{(props.c ?? props.d)?.length ?? 0}</li>
    </ul>
  )
}
`,
  props: { flag: true, a: [1, 2], b: [3] },
  expectedHtml: `
    <ul bf-s="test">
      <li bf="s2"><!--bf:s0-->2<!--/-->|<!--bf:s1-->2<!--/--></li>
      <li bf="s5"><!--bf:s3--><!--/-->|<!--bf:s4-->0<!--/--></li>
      <li bf="s8"><!--bf:s6-->2<!--/-->|<!--bf:s7-->2<!--/--></li>
      <li bf="s11"><!--bf:s9--><!--/-->|<!--bf:s10-->0<!--/--></li>
    </ul>
  `,
})
