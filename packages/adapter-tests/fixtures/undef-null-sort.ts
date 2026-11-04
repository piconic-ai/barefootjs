import { createFixture } from '../src/types'

/**
 * Sorting an array that holds `null` and `undefined` with a numeric
 * comparator (`spec/js-undefined-value.md` §1): `null` sorts as `0`, and
 * `undefined` elements go last without the comparator being called, so
 * `[3, undefined, 1, null, 2]` sorts to `[null, 1, 2, 3, undefined]`.
 * Sources: `null` elements from JSON data, and `undefined` elements read
 * from loop rows that omit the field.
 */
export const fixture = createFixture({
  id: 'undef-null-sort',
  description: 'A numeric sort puts null as 0 and undefined elements last',
  source: `
type Row = { v?: number | null }
export function UndefNullSort(props: { nums: (number | null)[]; rows: Row[] }) {
  return (
    <div>
      <p>{JSON.stringify(props.nums.slice().sort((a, b) => a - b))}</p>
      <p>{JSON.stringify(props.rows.map(r => r.v).sort((a, b) => a - b))}</p>
    </div>
  )
}
`,
  props: { nums: [3, null, 1, 2], rows: [{ v: 3 }, {}, { v: 1 }, { v: null }, { v: 2 }] },
  expectedHtml: `
    <div bf-s="test">
      <p bf="s1"><!--bf:s0-->[null,1,2,3]<!--/--></p>
      <p bf="s3"><!--bf:s2-->[null,1,2,3,null]<!--/--></p>
    </div>
  `,
})
