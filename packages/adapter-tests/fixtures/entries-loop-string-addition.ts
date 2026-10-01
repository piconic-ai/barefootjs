import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'entries-loop-string-addition',
  description: 'Normalized array and object entries row values retain scalar string evidence',
  source: `
export function EntriesPairs(props: { values: string[]; labels: Record<string, string> }) {
  return <section>
    <ul>{props.values.entries().map(([i, value]) => <li key={i} data-pair={value + value}>{value + value}</li>)}</ul>
    <ol>{Object.entries(props.labels).map(([key, value]) => <li key={key} data-pair={value + value}>{value + value}</li>)}</ol>
  </section>
}
`,
  props: { values: ['a', '1'], labels: { first: 'b', second: '2' } },
  dataPoints: [
    { name: 'escaped-and-empty', props: { values: ['<é>', ''], labels: { first: '&猫', second: '' } } },
  ],
  expectedHtml: `
    <section bf-s="test">
      <ul bf="s2">
        <li bf="s1" data-key="0" data-pair="aa"><!--bf:s0-->aa<!--/--></li>
        <li bf="s1" data-key="1" data-pair="11"><!--bf:s0-->11<!--/--></li>
      </ul>
      <ol bf="s5">
        <li bf="s4" data-key="first" data-pair="bb"><!--bf:s3-->bb<!--/--></li>
        <li bf="s4" data-key="second" data-pair="22"><!--bf:s3-->22<!--/--></li>
      </ol>
    </section>
  `,
})
