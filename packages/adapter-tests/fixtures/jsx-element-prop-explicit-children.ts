import { createFixture } from '../src/types'

/**
 * A named JSX-element prop (`header={<span/>}`) alongside an EXPLICIT
 * `children={<b/>}` attribute — both given as attributes on a
 * self-closing tag, so `comp.children` (the nested-between-tags slot) is
 * empty and the adapter must resolve BOTH prop values from `comp.props`
 * alone (#2773).
 *
 * Regression for a divergence between "which prop supplies the reserved
 * `children` slot?" implementations: the DSL adapters (Blade/ERB/Jinja/
 * Mojolicious/minijinja/Twig/Xslate) and Hono (the reference) all matched
 * the prop literally NAMED `children`. The Go template adapter instead
 * took the FIRST prop of any name carrying a `jsx-children` payload —
 * `header` here, since it appears first — so it populated BOTH `.Header`
 * and `.Children` with `header`'s payload and dropped `children`'s
 * `REAL-CHILDREN` payload entirely. See `jsx-element-prop-no-children`
 * for the milder one-prop-only shape of the same divergence.
 */
export const fixture = createFixture({
  id: 'jsx-element-prop-explicit-children',
  description: 'A named JSX-element prop and an explicit children prop resolve to two distinct payloads',
  source: `
import { Card } from './Card'
export function JsxElementPropExplicitChildren() {
  return <Card header={<span>HEADER</span>} children={<b>REAL-CHILDREN</b>} />
}
`,
  components: {
    './Card': `
export function Card(props: { header?: any; children?: any }) {
  return (
    <section>
      <header>{props.header}</header>
      <div class="body">{props.children}</div>
    </section>
  )
}
`,
  },
  expectedHtml: `
    <section bf-s="test_s0">
      <header bf="s1"><!--bf:s0--><span bf-s="test">HEADER</span><!--/--></header>
      <div class="body"><b>REAL-CHILDREN</b></div>
    </section>
  `,
})
