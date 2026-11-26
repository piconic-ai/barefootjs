import { createFixture } from '../src/types'

/**
 * Rows of a props member typed as Array of a parenthesized inline object type render their fields (#3973)
 */
export const fixture = createFixture({
  id: 'parenthesized-member-generic-array',
  description: 'Rows of a props member typed as Array of a parenthesized inline object type render their fields',
  source: `
function ParenthesizedMemberGenericArray(props: { items: Array<({ label: string; count: number })> }) {
  return <ul>{props.items.map((item) => <li key={item.label}>{item.label}:{item.count}</li>)}</ul>
}
export { ParenthesizedMemberGenericArray }
`,
  props: { items: [{ label: 'y', count: 2 }, { label: 'z', count: 0.5 }] },
  expectedHtml: `
    <ul bf-s="test" bf="s2">
      <li data-key="y"><!--bf:s0-->y<!--/-->:<!--bf:s1-->2<!--/--></li>
      <li data-key="z"><!--bf:s0-->z<!--/-->:<!--bf:s1-->0.5<!--/--></li>
    </ul>
  `,
})
