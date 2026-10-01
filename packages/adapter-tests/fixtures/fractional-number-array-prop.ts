import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'fractional-number-array-prop',
  description: 'A number-array prop preserves fractional values in loop rows',
  source: `
export function Fractions(props: { values: number[] }) {
  return <div>{props.values.map(value => <span key={value}>{value}</span>)}</div>
}
`,
  props: { values: [1.5, -2.5] },
  expectedHtml: `
    <div bf-s="test" bf="s1">
      <span data-key="1.5"><!--bf:s0-->1.5<!--/--></span>
      <span data-key="-2.5"><!--bf:s0-->-2.5<!--/--></span>
    </div>
  `,
})
