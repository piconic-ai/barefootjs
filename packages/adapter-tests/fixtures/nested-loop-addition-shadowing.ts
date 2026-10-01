import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'nested-loop-addition-shadowing',
  description: 'Numeric inner rows shadow a string outer row, whose concat type is restored after the inner loop',
  source: `
export function ScopedPairs(props: { groups: string[]; values: number[] }) {
  return <section>{props.groups.map(value => <div key={value} data-outer={value + value}>
    <em>{value + value}</em>
    {props.values.map(value => <span key={value} data-sum={value + 0.5}>{value + 0.5}</span>)}
    <strong>{value + value}</strong>
  </div>)}</section>
`,
  props: { groups: ['a', 'b'], values: [1, 2] },
  dataPoints: [
    { name: 'numeric-string-outer', props: { groups: ['1', '2'], values: [-1, 0] } },
  ],
  expectedHtml: `
    <section bf-s="test" bf="s5">
      <div bf="s4" data-key="a" data-outer="aa">
        <em><!--bf:s0-->aa<!--/--></em>
        <span bf="s2" data-key-1="1" data-sum="1.5"><!--bf:s1-->1.5<!--/--></span>
        <span bf="s2" data-key-1="2" data-sum="2.5"><!--bf:s1-->2.5<!--/--></span>
        <strong><!--bf:s3-->aa<!--/--></strong>
      </div>
      <div bf="s4" data-key="b" data-outer="bb">
        <em><!--bf:s0-->bb<!--/--></em>
        <span bf="s2" data-key-1="1" data-sum="1.5"><!--bf:s1-->1.5<!--/--></span>
        <span bf="s2" data-key-1="2" data-sum="2.5"><!--bf:s1-->2.5<!--/--></span>
        <strong><!--bf:s3-->bb<!--/--></strong>
      </div>
    </section>
  `,
})
