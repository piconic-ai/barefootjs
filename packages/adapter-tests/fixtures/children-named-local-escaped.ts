import { createFixture } from '../src/types'

/**
 * A component-body `const children` is a plain string, not the `children`
 * prop, so its markup is escaped like any other text (#3539). ERB used to
 * skip escaping for any identifier named `children`, printing the `<b>` raw.
 */
export const fixture = createFixture({
  id: 'children-named-local-escaped',
  description: 'A local named children is escaped text, not the children prop',
  source: `
export function ChildrenNamedLocal(props: { items: string[] }) {
  const children = props.items.join(', ')
  return <p>{children}</p>
}
`,
  props: { items: ['<b>x</b>', 'y'] },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->&lt;b&gt;x&lt;/b&gt;, y<!--/--></p>
  `,
})
