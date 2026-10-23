import { createFixture } from '../src/types'

/**
 * `.map()` preamble locals over a row's `number` field: a plain alias
 * (`const id = row.id`) and an arithmetic one (`const twice = row.id * 2`),
 * each read in text and in an attribute. JS prints `1500000` / `3000000`;
 * an engine that holds the field as a double and prints it with its
 * default float format writes `1.5e+06` / `3e+06`.
 */
export const fixture = createFixture({
  id: 'number-preamble-alias',
  description: 'Map preamble locals aliasing a number row field print in decimal (1500000, 3000000)',
  source: `
type Row = { id: number; label: string }
export function NumberPreambleAlias(props: { rows: Row[] }) {
  return (
    <ul>
      {props.rows.map(row => {
        const id = row.id
        const twice = row.id * 2
        return <li key={row.label} data-id={id} data-twice={twice}>{id} {twice}</li>
      })}
    </ul>
  )
}
`,
  props: { rows: [{ id: 1500000, label: 'a' }, { id: 2.5, label: 'b' }] },
  expectedHtml: `
    <ul bf-s="test" bf="s3">
      <li bf="s2" data-id="1500000" data-key="a" data-twice="3000000"><!--bf:s0-->1500000<!--/--><!--bf:s1-->3000000<!--/--></li>
      <li bf="s2" data-id="2.5" data-key="b" data-twice="5"><!--bf:s0-->2.5<!--/--><!--bf:s1-->5<!--/--></li>
    </ul>
  `,
})
