import { createFixture } from '../src/types'

/**
 * Large integral numbers (a million, a millisecond timestamp) read from a
 * prop, a signal seeded from it, and a loop row's field used as the row
 * key, in text and in attributes. JS prints them in plain decimal below
 * `1e21` (`1500000`, `1700000000000`). An engine that holds a `number`
 * as a double and prints it with its default float format writes
 * `1.5e+06` / `1.7e+12` instead.
 */
export const fixture = createFixture({
  id: 'number-prop-large-integer',
  description: 'Large integral numbers from a prop, a seeded signal and a row field print in decimal (1500000)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type Row = { id: number; label: string }
export function NumberPropLargeInteger(props: { n: number; rows: Row[] }) {
  const [s] = createSignal(props.n)
  return (
    <div data-n={props.n}>
      <span>{props.n}</span>
      <span>{s()}</span>
      <ul>
        {props.rows.map(r => <li key={r.id} data-id={r.id}>{r.id} {r.label}</li>)}
      </ul>
    </div>
  )
}
`,
  props: { n: 1500000, rows: [{ id: 1700000000000, label: 'a' }] },
  expectedHtml: `
    <div bf-s="test" bf="s8" data-n="1500000">
      <span bf="s1"><!--bf:s0-->1500000<!--/--></span>
      <span bf="s3"><!--bf:s2-->1500000<!--/--></span>
      <ul bf="s7"><li bf="s6" data-id="1700000000000" data-key="1700000000000"><!--bf:s4-->1700000000000<!--/--><!--bf:s5-->a<!--/--></li></ul>
    </div>
  `,
})
