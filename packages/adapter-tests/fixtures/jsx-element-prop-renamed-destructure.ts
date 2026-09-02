import { createFixture } from '../src/types'

/**
 * A named jsx-children prop (`header`) whose value is genuinely dynamic
 * (a fragment-wrapped conditional, same shape as
 * `jsx-element-prop-fragment-conditional`) delivered to a child that
 * destructures that prop under a DIFFERENT local name (`{ header: h }`).
 *
 * Regression pin for a bug Pullfrog's review caught on go-template PR #2804
 * (`queueDynamicPropDefine`, go-template-adapter.ts): the go-template
 * adapter's dynamic-delivery route for an unbakeable named prop
 * (`bf_with_props` + `bf_tmpl`) keyed its `bf_with_props` argument by the
 * bare capitalized JSX attribute name (`Header`) instead of the child's
 * LOCAL destructured field name (`H`) — the same aliasing hazard
 * `childPropFieldNames` already exists to resolve for the sibling
 * `bf_with_props` call site (`loopRowChildPropOverrides`,
 * go-template-adapter.ts). `bf.WithProps` silently no-ops on an unmatched
 * field name, so the unfixed code would have SSR'd `<header></header>` —
 * a silently dropped dynamic value — on exactly this shape.
 *
 * Hono is correct by construction for this shape (a plain destructure
 * rename has no bearing on JSX-runtime SSR), so `expectedHtml` is
 * generated from it unmodified.
 */
export const fixture = createFixture({
  id: 'jsx-element-prop-renamed-destructure',
  description: 'A named jsx-children prop with a genuinely dynamic value, destructured under a renamed local binding',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
import { Card } from './Card'
export function JsxElementPropRenamedDestructure() {
  const [cond, setCond] = createSignal(true)
  return (
    <Card header={<>{cond() ? <a>x</a> : <b>y</b>}</>}>
      <p>body text</p>
    </Card>
  )
}
`,
  components: {
    './Card': `
export function Card({ header: h, children }: { header?: any; children?: any }) {
  return (
    <section>
      <header>{h}</header>
      <div>{children}</div>
    </section>
  )
}
`,
  },
  expectedHtml: `
    <section bf-s="test_s1">
      <header bf="s1"><!--bf:s0--><a bf-c="^s0">x</a><!--/--></header>
      <div><p>body text</p></div>
    </section>
  `,
})
