import { createFixture } from '../src/types'

/**
 * Sibling of `optional-chain-length-string-receiver` (#3422) over the other
 * positions an optional-chain receiver prop is read in, with destructured
 * props: an attribute (omitted for an absent receiver, `0` for `''`) and a
 * condition (falsy for both). Adapters that make the absent prop nil must
 * keep the condition's `.length` nil-safe.
 */
export const fixture = createFixture({
  id: 'optional-chain-receiver-positions',
  description: 'An optional-chain receiver prop read in an attribute and a condition distinguishes an absent value from an empty string',
  source: `
'use client'
type Props = { absent?: string; blank?: string; text?: string }
export function OptionalChainReceiverPositions({ absent, blank, text }: Props) {
  return (
    <ul>
      <li data-len={absent?.length}>{absent?.length ? 'y' : 'n'}</li>
      <li data-len={blank?.length}>{blank?.length ? 'y' : 'n'}</li>
      <li data-len={text?.length}>{text?.length ? 'y' : 'n'}</li>
    </ul>
  )
}
`,
  props: { blank: '', text: 'ab' },
  expectedHtml: `
    <ul bf-s="test">
      <li bf="s1"><!--bf-cond-start:s0-->n<!--bf-cond-end:s0--></li>
      <li bf="s3" data-len="0"><!--bf-cond-start:s2-->n<!--bf-cond-end:s2--></li>
      <li bf="s5" data-len="2"><!--bf-cond-start:s4-->y<!--bf-cond-end:s4--></li>
    </ul>
  `,
})
