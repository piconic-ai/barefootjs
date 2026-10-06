import { createFixture } from '../src/types'

/**
 * `??` keeps a present empty array: `[]` is not nullish, so
 * `(props.c ?? props.a).length` reads `c`'s length, `0`, and never the
 * fallback's.
 */
export const fixture = createFixture({
  id: 'nullish-coalesce-empty-array',
  description: '`??` keeps a present empty array instead of taking the fallback',
  source: `
'use client'
type Props = { c?: number[]; a: number[] }
export function NullishEmptyArray(props: Props) {
  return <p>{(props.c ?? props.a).length}</p>
}
`,
  props: { c: [], a: [1, 2] },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->0<!--/--></p>
  `,
})
