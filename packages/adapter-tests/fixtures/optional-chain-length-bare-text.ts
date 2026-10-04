import { createFixture } from '../src/types'

/**
 * An optional-chained `.length` read rendered as text with no fallback. With
 * the array absent the read is `undefined`, which renders as nothing — not
 * `0`.
 */
export const fixture = createFixture({
  id: 'optional-chain-length-bare-text',
  description: 'A bare optional-chained `.length` over an absent array renders empty',
  source: `
'use client'
type Props = { items?: number[] }
export function OptionalChainLengthBareText(props: Props) {
  return <p>{props.items?.length}</p>
}
`,
  props: {},
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0--><!--/--></p>
  `,
})
