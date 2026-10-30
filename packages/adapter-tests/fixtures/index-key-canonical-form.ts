import { createFixture } from '../src/types'

/**
 * A list index is read only through a canonical array-index key: the
 * number `1` and the string `'1'` name element 1, while `'01'`, `'-0'` and
 * `'1e0'` are other property names no list holds, so the read is
 * `undefined`. The same key gives the same answer whether the read is a
 * direct expression or sits inside a callback (`.map(row => row[k])`),
 * which a backend may evaluate on a separate path from the template.
 */
export const fixture = createFixture({
  id: 'index-key-canonical-form',
  description: 'A list index reads element 1 for 1 and "1" but nothing for "01", "-0" or "1e0", directly and in a map callback',
  source: `
type Props = { row: string[]; rows: string[][]; one: string; padded: string; negZero: string; exp: string; num: number }

export function IndexKeyCanonicalForm({ row, rows, one, padded, negZero, exp, num }: Props) {
  return (
    <div>
      <span>{row[one] ?? '-'}</span>
      <span>{row[padded] ?? '-'}</span>
      <span>{row[negZero] ?? '-'}</span>
      <span>{row[exp] ?? '-'}</span>
      <span>{row[num] ?? '-'}</span>
      <span>{rows.map(r => r[one] ?? '-').join(',')}</span>
      <span>{rows.map(r => r[padded] ?? '-').join(',')}</span>
      <span>{rows.map(r => r[negZero] ?? '-').join(',')}</span>
      <span>{rows.map(r => r[exp] ?? '-').join(',')}</span>
      <span>{rows.map(r => r[num] ?? '-').join(',')}</span>
    </div>
  )
}
`,
  props: {
    row: ['a', 'b'],
    rows: [
      ['a', 'b'],
      ['c', 'd'],
    ],
    one: '1',
    padded: '01',
    negZero: '-0',
    exp: '1e0',
    num: 1,
  },
  expectedHtml: `
    <div bf-s="test">
      <span bf="s1"><!--bf:s0-->b<!--/--></span>
      <span bf="s3"><!--bf:s2-->-<!--/--></span>
      <span bf="s5"><!--bf:s4-->-<!--/--></span>
      <span bf="s7"><!--bf:s6-->-<!--/--></span>
      <span bf="s9"><!--bf:s8-->b<!--/--></span>
      <span bf="s11"><!--bf:s10-->b,d<!--/--></span>
      <span bf="s13"><!--bf:s12-->-,-<!--/--></span>
      <span bf="s15"><!--bf:s14-->-,-<!--/--></span>
      <span bf="s17"><!--bf:s16-->-,-<!--/--></span>
      <span bf="s19"><!--bf:s18-->b,d<!--/--></span>
    </div>
  `,
})
