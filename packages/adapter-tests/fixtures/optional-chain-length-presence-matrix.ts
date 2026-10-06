import { createFixture } from '../src/types'

/**
 * Sibling of `optional-chain-length-bare-text` (#3332): an optional-chained
 * array `.length` is `undefined` only for an absent or `null` receiver. An
 * empty array still reads `0` and a populated one its length. Each read
 * appears bare and under a `?? 0` fallback. String receivers are in
 * `optional-chain-length-string-receiver`.
 */
export const fixture = createFixture({
  id: 'optional-chain-length-presence-matrix',
  description: 'An optional-chained array `.length` is empty only for an absent or null receiver',
  source: `
'use client'
type Props = {
  absent?: number[]
  nothing?: number[] | null
  empty?: number[]
  full?: number[]
}
export function OptionalChainLengthPresence(props: Props) {
  return (
    <ul>
      <li>{props.absent?.length}|{props.absent?.length ?? 0}</li>
      <li>{props.nothing?.length}|{props.nothing?.length ?? 0}</li>
      <li>{props.empty?.length}|{props.empty?.length ?? 0}</li>
      <li>{props.full?.length}|{props.full?.length ?? 0}</li>
    </ul>
  )
}
`,
  props: { nothing: null, empty: [], full: [1, 2] },
  expectedHtml: `
    <ul bf-s="test">
      <li bf="s2"><!--bf:s0--><!--/-->|<!--bf:s1-->0<!--/--></li>
      <li bf="s5"><!--bf:s3--><!--/-->|<!--bf:s4-->0<!--/--></li>
      <li bf="s8"><!--bf:s6-->0<!--/-->|<!--bf:s7-->0<!--/--></li>
      <li bf="s11"><!--bf:s9-->2<!--/-->|<!--bf:s10-->2<!--/--></li>
    </ul>
  `,
})
