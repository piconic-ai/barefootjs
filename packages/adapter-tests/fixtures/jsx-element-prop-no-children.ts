import { createFixture } from '../src/types'

/**
 * The milder shape of the #2773 divergence: a named JSX-element prop
 * (`header={<span/>}`) with NO `children` at all — no nested body, no
 * explicit `children` attribute. `comp.children` is empty, so an adapter
 * resolving the reserved `children` slot by "first `jsx-children` prop of
 * any name" (rather than by the name `children`) backfills the child
 * component's children slot with `header`'s payload, duplicating content
 * the caller never gave it. See `jsx-element-prop-explicit-children` for
 * the two-prop shape of the same divergence.
 *
 * `props.children ?? ''` guards the interpolation (same convention as
 * `component-with-jsx-children`'s Card): a genuinely-absent `children`
 * hits a separate, pre-existing CSR defect where the client template's
 * bare `${_p.children}` splice renders the literal text "undefined" for
 * an actually-undefined value, which is not what this fixture exists to
 * pin. The guard keeps this fixture scoped to the #2773 predicate only.
 *
 * That defect is https://github.com/piconic-ai/barefootjs/issues/2775.
 * The guard is why no conformance layer reports it today, here or in
 * `component-with-jsx-children` — so #2775 owes a fixture written with
 * the UNGUARDED source. Drop this guard once #2775 is fixed; until then
 * it is a deliberate scope boundary, not an accident.
 */
export const fixture = createFixture({
  id: 'jsx-element-prop-no-children',
  description: 'A named JSX-element prop alone must not backfill the unrelated children slot',
  source: `
import { Card } from './Card'
export function JsxElementPropNoChildren() {
  return <Card header={<span>Hi</span>} />
}
`,
  components: {
    './Card': `
export function Card(props: { header?: any; children?: any }) {
  return (
    <section>
      <header>{props.header}</header>
      <div class="body">{props.children ?? ''}</div>
    </section>
  )
}
`,
  },
  expectedHtml: `
    <section bf-s="test_s0">
      <header bf="s1"><!--bf:s0--><span bf-s="test">Hi</span><!--/--></header>
      <div class="body"></div>
    </section>
  `,
})
