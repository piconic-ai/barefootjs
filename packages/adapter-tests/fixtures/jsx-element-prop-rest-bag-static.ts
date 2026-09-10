import { createFixture } from '../src/types'

/**
 * Static (non-dynamic) twin of `jsx-element-prop-rest-bag-dynamic`: a named
 * jsx-children prop (`header`) with a value that folds to a constant, on a
 * child that does NOT declare `header` as a param — it's captured only via
 * the child's rest-bag spread (`{ children, ...rest }`), never spread onto
 * an element itself. Proves the STATIC bake path (`emitChildField`) and the
 * read lowering (`member()`'s `restPropsName` branch, `bf_get`) independently
 * of #2805's dynamic-delivery route, since this shape never reaches
 * `queueDynamicPropDefine` at all — the value bakes straight into the
 * constructor's `Rest: map[string]any{"header": ...}` literal.
 */
export const fixture = createFixture({
  id: 'jsx-element-prop-rest-bag-static',
  description: 'A named jsx-children prop with a static value, captured only by the child\'s rest-bag spread',
  source: `
import { Card } from './Card'
export function JsxElementPropRestBagStatic() {
  return (
    <Card header={<strong>Title</strong>}>
      <p>body text</p>
    </Card>
  )
}
`,
  components: {
    './Card': `
export function Card({ children, ...rest }: { children?: any; [key: string]: any }) {
  return (
    <section>
      <header>{rest.header}</header>
      <div>{children}</div>
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
