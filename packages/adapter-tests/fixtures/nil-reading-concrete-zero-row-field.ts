import { createFixture } from '../src/types'

/**
 * An optional row field the nil-reading rewrite reads (#3824 step 4), in a
 * row that supplies `''` and a row that omits it: `r.id + '!'` is `!` and
 * `undefined!`. A backend whose row struct holds the field as a concrete
 * zero cannot tell the two apart.
 */
export const fixture = createFixture({
  id: 'nil-reading-concrete-zero-row-field',
  description: 'An optional row field supplied as the empty string and omitted, under a string concatenation',
  source: `
type Row = { id?: string }

export function NilReadingConcreteZeroRowField(props: { rows: Row[] }) {
  return <ul>{props.rows.map((r, i) => <li key={i}>{r.id + '!'}</li>)}</ul>
}
`,
  props: { rows: [{ id: '' }, {}] },
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <li data-key="0"><!--bf:s0-->!<!--/--></li>
      <li data-key="1"><!--bf:s0-->undefined!<!--/--></li>
    </ul>
  `,
})
