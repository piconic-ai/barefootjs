import { createFixture } from '../src/types'

/**
 * prop-precompute twin of `unlowered-method-call`: the caller compares the
 * strings and passes the result as a prop, which every adapter renders.
 */
export const fixture = createFixture({
  id: 'unlowered-method-call-precomputed',
  description: 'prop-precompute twin of unlowered-method-call — the comparison arrives as a prop (#3493)',
  source: `
'use client'

export function LocaleOrder(props: { order: number }) {
  return <p data-order={props.order}>{props.order}</p>
}
`,
  props: { order: 1 },
  expectedHtml: `
    <p bf-s="test" bf="s1" data-order="1"><!--bf:s0-->1<!--/--></p>
  `,
})
