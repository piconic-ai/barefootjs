import { createFixture } from '../src/types'

/**
 * A loop row named `children` (plain and destructured) shadows the
 * `children` prop, so the row's markup is escaped like any other text
 * (#3539). ERB used to skip escaping for any identifier named `children`.
 */
export const fixture = createFixture({
  id: 'children-named-loop-row-escaped',
  description: 'A loop row named children is escaped text, not the children prop',
  source: `
export function ChildrenNamedLoopRow(props: { kids: string[]; rows: { children: string }[] }) {
  return (
    <div>
      <ul>{props.kids.map(children => <li key={children}>{children}</li>)}</ul>
      <ol>{props.rows.map(({ children }) => <li key={children}>{children}</li>)}</ol>
    </div>
  )
}
`,
  props: { kids: ['<b>a</b>', 'c'], rows: [{ children: '<i>r</i>' }] },
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s1">
        <li data-key="&lt;b&gt;a&lt;/b&gt;"><!--bf:s0-->&lt;b&gt;a&lt;/b&gt;<!--/--></li>
        <li data-key="c"><!--bf:s0-->c<!--/--></li>
      </ul>
      <ol bf="s3"><li data-key="&lt;i&gt;r&lt;/i&gt;"><!--bf:s2-->&lt;i&gt;r&lt;/i&gt;<!--/--></li></ol>
    </div>
  `,
})
