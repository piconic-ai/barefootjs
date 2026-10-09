import { createFixture } from '../src/types'

/**
 * Sibling of `nullish-coalesce-empty-array` (#3362): `??` over an optional
 * array prop that is absent, null, empty or non-empty, read through both
 * `.length` and `?.length`. Only an absent or null left side falls back; a
 * present `[]` is kept.
 */
export const fixture = createFixture({
  id: 'nullish-coalesce-array-matrix',
  description: '`??` over an optional array keeps a present empty array and falls back only when absent or null',
  source: `
type Props = { a: number[]; absent?: number[]; nul?: number[] | null; empty?: number[]; full?: number[] }

export function NullishCoalesceArrayMatrix(props: Props) {
  return (
    <div>
      <p>{(props.absent ?? props.a).length}|{(props.nul ?? props.a).length}|{(props.empty ?? props.a).length}|{(props.full ?? props.a).length}</p>
      <p>{(props.absent ?? props.a)?.length}|{(props.nul ?? props.a)?.length}|{(props.empty ?? props.a)?.length}|{(props.full ?? props.a)?.length}</p>
    </div>
  )
}
`,
  props: { a: [1, 2], nul: null, empty: [], full: [9, 8, 7] },
  expectedHtml: `
    <div bf-s="test">
      <p bf="s4"><!--bf:s0-->2<!--/-->|<!--bf:s1-->2<!--/-->|<!--bf:s2-->0<!--/-->|<!--bf:s3-->3<!--/--></p>
      <p bf="s9"><!--bf:s5-->2<!--/-->|<!--bf:s6-->2<!--/-->|<!--bf:s7-->0<!--/-->|<!--bf:s8-->3<!--/--></p>
    </div>
  `,
})
