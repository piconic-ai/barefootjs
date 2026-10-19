import { createFixture } from '../src/types'

/**
 * A loop preamble local named `children` shadows the destructured
 * `children` prop inside the row, so the row's markup-looking text is
 * escaped (#3539 review).
 */
export const fixture = createFixture({
  id: 'children-preamble-local-escaped',
  description: 'A loop preamble local named children is escaped text, not the children prop',
  source: `
export function ChildrenPreambleLocal({ children, rows }: { children?: unknown; rows: { label: string }[] }) {
  return (
    <div>
      {children}
      <ul>
        {rows.map(r => {
          const children = r.label
          return <li key={r.label}>{children}</li>
        })}
      </ul>
    </div>
  )
}
`,
  props: { rows: [{ label: '<b>x</b>' }, { label: 'y' }] },
  expectedHtml: `
    <div bf-s="test"><ul bf="s1"><li data-key="&lt;b&gt;x&lt;/b&gt;"><!--bf:s0-->&lt;b&gt;x&lt;/b&gt;<!--/--></li><li data-key="y"><!--bf:s0-->y<!--/--></li></ul></div>
  `,
})
