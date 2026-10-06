import { createFixture } from '../src/types'

/**
 * String-receiver sibling of `optional-chain-length-presence-matrix`
 * (#3332): an optional-chained `.length` over an absent string is
 * `undefined`, while an empty string still reads `0` and `'ab'` reads `2`.
 * Each read appears bare and under a `?? 0` fallback.
 */
export const fixture = createFixture({
  id: 'optional-chain-length-string-receiver',
  description: 'An optional-chained string `.length` is empty only for an absent receiver',
  source: `
'use client'
type Props = { noText?: string; blank?: string; text?: string }
export function OptionalChainLengthString(props: Props) {
  return (
    <ul>
      <li>{props.noText?.length}|{props.noText?.length ?? 0}</li>
      <li>{props.blank?.length}|{props.blank?.length ?? 0}</li>
      <li>{props.text?.length}|{props.text?.length ?? 0}</li>
    </ul>
  )
}
`,
  props: { blank: '', text: 'ab' },
  expectedHtml: `
    <ul bf-s="test">
      <li bf="s2"><!--bf:s0--><!--/-->|<!--bf:s1-->0<!--/--></li>
      <li bf="s5"><!--bf:s3-->0<!--/-->|<!--bf:s4-->0<!--/--></li>
      <li bf="s8"><!--bf:s6-->2<!--/-->|<!--bf:s7-->2<!--/--></li>
    </ul>
  `,
})
