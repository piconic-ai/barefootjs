import { createFixture } from '../src/types'

/**
 * The callback half of `index-key-canonical-form`: the same list index keys
 * read inside a map callback (`.map(r => r[k])`), which a backend may run
 * through its expression evaluator rather than the template. A canonical
 * index (`1`, `'1'`) reads element 1; `'01'`, `'-0'` and `'1e0'` read
 * nothing, exactly as the direct read does.
 */
export const fixture = createFixture({
  id: 'index-key-canonical-form-callback',
  description: 'A list index inside a map callback reads element 1 for 1 and "1" but nothing for "01", "-0" or "1e0"',
  source: `
type Props = { rows: string[][]; one: string; padded: string; negZero: string; exp: string; num: number }

export function IndexKeyCanonicalFormCallback({ rows, one, padded, negZero, exp, num }: Props) {
  return (
    <div>
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
      <span bf="s1"><!--bf:s0-->b,d<!--/--></span>
      <span bf="s3"><!--bf:s2-->-,-<!--/--></span>
      <span bf="s5"><!--bf:s4-->-,-<!--/--></span>
      <span bf="s7"><!--bf:s6-->-,-<!--/--></span>
      <span bf="s9"><!--bf:s8-->b,d<!--/--></span>
    </div>
  `,
})
