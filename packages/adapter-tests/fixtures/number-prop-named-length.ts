import { createFixture } from '../src/types'

/**
 * A `number` prop that happens to be named `length`, read in text and in
 * an attribute, next to a real `.length` of an array prop. JS prints
 * `1500000`; an engine that takes every `.length` read for an integer
 * array length and prints the double field with its default float format
 * writes `1.5e+06`.
 */
export const fixture = createFixture({
  id: 'number-prop-named-length',
  description: 'A number prop named `length` prints in decimal (1500000), beside an array .length',
  source: `
export function NumberPropNamedLength(props: { length: number; items: string[] }) {
  return (
    <p data-n={props.length} data-count={props.items.length}>
      <span>{props.length}</span>
      <span>{props.items.length}</span>
    </p>
  )
}
`,
  props: { length: 1500000, items: ['a', 'b'] },
  expectedHtml: `
    <p bf-s="test" bf="s4" data-count="2" data-n="1500000">
      <span bf="s1"><!--bf:s0-->1500000<!--/--></span>
      <span bf="s3"><!--bf:s2-->2<!--/--></span>
    </p>
  `,
})
