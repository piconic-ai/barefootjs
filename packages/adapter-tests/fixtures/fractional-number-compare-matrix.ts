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
    <div bf-s="test"></div>
  `,
})
