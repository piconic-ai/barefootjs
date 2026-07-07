import { createFixture } from '../src/types'

/**
 * A JSX element passed as a NON-children prop (`header={<strong/>}`)
 * alongside regular children — the slot/render-prop-lite pattern.
 * Template backends must materialize the prop-valued JSX into the
 * child's template or refuse loudly; silently stringifying the element
 * object is the failure mode this pins against.
 */
export const fixture = createFixture({
  id: 'jsx-element-prop',
  description: 'JSX element as a non-children prop value (header slot)',
  source: `
import { Card } from './Card'
export function JsxElementProp() {
  return (
    <Card header={<strong>Title</strong>}>
      <p>body text</p>
    </Card>
  )
}
`,
  components: {
    './Card': `
export function Card(props: { header?: any; children?: any }) {
  return (
    <section>
      <header>{props.header}</header>
      <div>{props.children}</div>
    </section>
  )
}
`,
  },
  expectedHtml: `
    <section bf-s="test_s0">
      <header bf="s1"><!--bf:s0--><strong bf-s="test">Title</strong><!--/--></header>
      <div><p>body text</p></div>
    </section>
  `,
})
