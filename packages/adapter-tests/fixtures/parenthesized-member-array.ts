import { createFixture } from '../src/types'

/**
 * Rows of a props member typed as an array of a parenthesized type render their fields (#3973)
 */
export const fixture = createFixture({
  id: 'parenthesized-member-array',
  description: 'Rows of a props member typed as an array of a parenthesized type render their fields',
  source: `
type Row = { label: string; count: number }
function ParenthesizedMemberArray(props: { items: (Row)[] }) {
  return <ul>{props.items.map((item) => <li key={item.label}>{item.label}:{item.count}</li>)}</ul>
}
export { ParenthesizedMemberArray }
`,
  props: { items: [{ label: 'y', count: 2 }, { label: 'z', count: 0.5 }] },
  expectedHtml: `
    <ul bf-s="test" bf="s2">
      <li data-key="y"><!--bf:s0-->y<!--/-->:<!--bf:s1-->2<!--/--></li>
      <li data-key="z"><!--bf:s0-->z<!--/-->:<!--bf:s1-->0.5<!--/--></li>
    </ul>
  `,
})
