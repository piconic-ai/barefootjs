import { createFixture } from '../src/types'

/**
 * An object's own `length` property read in a `.filter()` predicate
 * (Pullfrog review on #3448): `i.length` is the row's field, not a count.
 * A backend that lowers every `.length` to a string/array length helper
 * reads 0 for the object and drops the matching row. Covers the inline
 * filter and its counted-filter counterpart.
 */
export const fixture = createFixture({
  id: 'object-length-property-filter',
  description: 'An object\'s own length property in an inline and a counted filter predicate',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type Row = { id: string; length: number }
export function ObjectLengthPropertyFilter() {
  const [rows] = createSignal<Row[]>([{ id: 'a', length: 3 }, { id: 'b', length: 1 }])
  return (
    <div>
      <ul>{rows().filter(r => r.length > 2).map(r => <li key={r.id}>{r.id}</li>)}</ul>
      <p>{rows().filter(r => r.length > 2).length}</p>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s1"><li data-key="a"><!--bf:s0-->a<!--/--></li></ul>
      <p bf="s3"><!--bf:s2-->1<!--/--></p>
    </div>
  `,
})
