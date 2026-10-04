import { createFixture } from '../src/types'

/**
 * Sibling of `optional-chain-length-condition`: an optional-chained
 * `.length` read defaulted with `?? 0` and rendered as text. With the
 * receiver absent the read is `undefined`, so the fallback takes over — for
 * an array receiver and a string receiver alike. The bare read with no
 * fallback is `optional-chain-length-bare-text`.
 */
export const fixture = createFixture({
  id: 'optional-chain-length-text',
  description: 'An optional-chained `.length` over an absent array or string falls back through `?? 0` in text',
  source: `
'use client'
type Props = { items?: number[]; label?: string }
export function OptionalChainLengthText(props: Props) {
  return (
    <p>
      <b>{props.items?.length ?? 0}</b>
      <s>{props.label?.length ?? 0}</s>
    </p>
  )
}
`,
  props: {},
  expectedHtml: `
    <p bf-s="test">
      <b bf="s1"><!--bf:s0-->0<!--/--></b>
      <s bf="s3"><!--bf:s2-->0<!--/--></s>
    </p>
  `,
})
