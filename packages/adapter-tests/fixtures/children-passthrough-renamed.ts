import { createFixture } from '../src/types'

/**
 * `children` destructured under a different name (`const { children: kids }
 * = props`) and spliced as `{kids}`, with a caller that passes no children
 * at all — #2786, the shape #2775's fix did not cover.
 *
 * `isChildrenPassthroughExpr` tests `node.expr`, the pre-substitution source
 * text, which reads `kids` here and matches nothing — so the splice stayed
 * bare and stringified the absent value into the literal text "undefined"
 * on a pure-CSR mount, while SSR and SSR+hydration rendered nothing. The
 * fix tests the RESOLVED expression as well, which already reads
 * `(_p.children)` by the time the emitter splices it.
 *
 * Deliberately unguarded, and deliberately renamed: the sibling fixture
 * `children-passthrough-no-children` pins the `props.children` spelling, so
 * only this one exercises the alias path. Hono is correct for both, so
 * `expectedHtml` is generated from it unmodified.
 */
export const fixture = createFixture({
  id: 'children-passthrough-renamed',
  description: 'A renamed children destructure renders nothing when the caller passes no children',
  source: `
import { Panel } from './panel'
export function Page() {
  return <Panel title="T" />
}
`,
  components: {
    './panel.tsx': `
export function Panel(props: { title?: unknown; children?: unknown }) {
  const { children: kids } = props
  return (
    <section class="panel">
      <h3>{props.title}</h3>
      {kids}
    </section>
  )
}
`,
  },
  expectedHtml: `
    <section bf-s="test_s0" class="panel"><h3 bf="s1"><!--bf:s0-->T<!--/--></h3></section>
  `,
})
