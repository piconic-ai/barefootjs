import { createFixture } from '../src/types'

/**
 * Sibling of `fractional-number-array-row-ops`: every equality and
 * relational operator between fractional / negative / zero / integer
 * `number[]` elements and integer or fractional literals, in both operand
 * orders, compares numerically — including an int-valued product equal to
 * an integer literal (`1.5 * 2 === 3`). Covers attribute-ternary,
 * conditional-rendering and `.filter()` predicate positions.
 */
export const fixture = createFixture({
  id: 'fractional-number-compare-matrix',
  description: 'Fractional and integer number-array elements compare numerically with every operator',
  source: `
export function FractionCompareMatrix(props: { values: number[] }) {
  return (
    <div>
      <ul>
        {props.values.map(value => (
          <li
            key={value}
            data-gt={value > 0 ? 'y' : 'n'}
            data-lt={0 < value ? 'y' : 'n'}
            data-ge={value >= 1.5 ? 'y' : 'n'}
            data-le={value <= -2.5 ? 'y' : 'n'}
            data-eq={value === 3 ? 'y' : 'n'}
            data-ne={value !== 0 ? 'y' : 'n'}
            data-twice={value * 2 === 3 ? 'y' : 'n'}
          >
            {value > 1 ? <b>big</b> : <i>small</i>}
          </li>
        ))}
      </ul>
      <p>{props.values.filter(v => v > 0.5).length}</p>
    </div>
  )
}
`,
  props: { values: [1.5, -2.5, 0, 3] },
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s2">
        <li bf="s1" data-eq="n" data-ge="y" data-gt="y" data-key="1.5" data-le="n" data-lt="y" data-ne="y" data-twice="y"><b bf-c="s0">big</b></li>
        <li bf="s1" data-eq="n" data-ge="n" data-gt="n" data-key="-2.5" data-le="y" data-lt="n" data-ne="y" data-twice="n"><i bf-c="s0">small</i></li>
        <li bf="s1" data-eq="n" data-ge="n" data-gt="n" data-key="0" data-le="n" data-lt="n" data-ne="n" data-twice="n"><i bf-c="s0">small</i></li>
        <li bf="s1" data-eq="y" data-ge="y" data-gt="y" data-key="3" data-le="n" data-lt="y" data-ne="y" data-twice="n"><b bf-c="s0">big</b></li>
      </ul>
      <p bf="s4"><!--bf:s3-->2<!--/--></p>
    </div>
  `,
})
