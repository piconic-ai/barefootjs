import { createFixture } from '../src/types'

/**
 * A keyed loop of child components whose key and `number` prop come from
 * a row's `number` field: a millisecond timestamp and a fraction. The
 * row's `data-key` and the child's text print the numbers as JS does
 * (`1700000000000`, `2.5`). An engine that holds a `number` as a double
 * and stringifies the key with its default float format writes
 * `1.7e+12`, which no longer matches the key the client computes.
 */
export const fixture = createFixture({
  id: 'number-row-key-child-loop',
  description: 'A keyed child-component loop over number row fields keeps decimal keys and fractions (1700000000000, 2.5)',
  source: `
type Item = { id: number; label: string }
function Row(props: { id: number; label: string }) {
  return <li data-id={props.id}>{props.label} {props.id}</li>
}
export function NumberRowKeyChildLoop(props: { items: Item[] }) {
  return <ul>{props.items.map(item => <Row key={item.id} id={item.id} label={item.label} />)}</ul>
}
`,
  props: { items: [{ id: 1700000000000, label: 'a' }, { id: 2.5, label: 'b' }] },
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <li bf-s="Row_*" bf="s2" data-id="1700000000000" data-key="1700000000000"><!--bf:s0-->a<!--/--><!--bf:s1-->1700000000000<!--/--></li>
      <li bf-s="Row_*" bf="s2" data-id="2.5" data-key="2.5"><!--bf:s0-->b<!--/--><!--bf:s1-->2.5<!--/--></li>
    </ul>
  `,
})
