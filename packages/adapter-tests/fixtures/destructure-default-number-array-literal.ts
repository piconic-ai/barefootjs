import { createFixture } from '../src/types'

/**
 * A parameter destructure whose default is a number array literal
 * (`{ n = [1, 2] }`): an absent prop takes the literal, an explicit `[]`
 * keeps the empty array, and a given array (with a fraction) wins, read
 * through `.length`, `.join('|')`, a `.map()` and an attribute. The number
 * twin of `destructure-default-array-literal`.
 */
export const fixture = createFixture({
  id: 'destructure-default-number-array-literal',
  description: 'A parameter destructure default that is a number array literal applies to an absent prop only',
  source: `
export function DestructureDefaultNumberArrayLiteral({ n = [1, 2] }: { n?: number[] }) {
  return (
    <div data-n={n.join(',')}>
      <p>{n.length}|{n.join('|')}</p>
      <ul>{n.map((x) => <li key={x}>{x}</li>)}</ul>
    </div>
  )
}
`,
  props: {},
  expectedHtml: `
    <div bf-s="test" bf="s5" data-n="1,2">
      <p bf="s2"><!--bf:s0-->2<!--/-->|<!--bf:s1-->1|2<!--/--></p>
      <ul bf="s4">
        <li data-key="1"><!--bf:s3-->1<!--/--></li>
        <li data-key="2"><!--bf:s3-->2<!--/--></li>
      </ul>
    </div>
  `,
  dataPoints: [
    { name: 'empty', props: { n: [] } },
    { name: 'given', props: { n: [3, 0.5] } },
  ],
})
