import { createFixture } from '../src/types'

/**
 * Sibling of `fractional-number-array-prop`: fractional elements of a
 * `number[]` prop stay usable inside the row — compared against an integer
 * literal, used in arithmetic, and mixed with integer elements.
 */
export const fixture = createFixture({
  id: 'fractional-number-array-row-ops',
  description: 'Fractional number-array elements work in row comparisons and arithmetic',
  source: `
export function FractionRows(props: { values: number[] }) {
  return (
    <ul>
      {props.values.map(value => (
        <li key={value} data-sign={value > 0 ? 'pos' : 'neg'}>{value * 2}</li>
      ))}
    </ul>
  )
}
`,
  props: { values: [1.5, -2.5, 3] },
  expectedHtml: `
    <ul bf-s="test" bf="s2">
      <li bf="s1" data-key="1.5" data-sign="pos"><!--bf:s0-->3<!--/--></li>
      <li bf="s1" data-key="-2.5" data-sign="neg"><!--bf:s0-->-5<!--/--></li>
      <li bf="s1" data-key="3" data-sign="pos"><!--bf:s0-->6<!--/--></li>
    </ul>
  `,
})
