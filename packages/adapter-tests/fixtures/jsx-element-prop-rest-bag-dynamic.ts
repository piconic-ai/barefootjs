import { createFixture } from '../src/types'

/**
 * A named jsx-children prop (`header`) with a genuinely dynamic
 * (fragment-wrapped-conditional) value, on a child that does NOT declare
 * `header` as a param at all — it's captured only via the child's rest-bag
 * spread (`{ children, ...rest }`), the same routing `emitChildField`
 * already special-cases for the STATIC bake path.
 *
 * Regression pin for a gap Pullfrog's review caught on go-template PR #2804
 * (`queueDynamicPropDefine`, go-template-adapter.ts): a prop routed into
 * the child's rest bag has no named Go struct field at all for
 * `bf_with_props`/`WithProps` to target — `loopRowChildPropOverrides`
 * already guards against this exact shape (`childShape?.restBagField &&
 * !childShape.paramNames.has(prop.name)`) for its own `bf_with_props` call
 * site, but `queueDynamicPropDefine` initially didn't, which would have
 * silently no-op'd the dynamic value via `WithProps`'s unmatched-field
 * passthrough — turning the BLANKET `BF101` refusal this PR's first commit
 * replaced (unconditional for any unbakeable named prop) into a silent
 * wrong render for exactly this shape. `queueDynamicPropDefine` mirrors
 * the same guard and refuses loudly with `BF101` instead.
 *
 * This fixture is pinned on go-template only (`conformance-pins.ts`);
 * every other adapter renders it correctly, same as its sibling
 * `jsx-element-prop-fragment-conditional`.
 */
export const fixture = createFixture({
  id: 'jsx-element-prop-rest-bag-dynamic',
  description: 'A named jsx-children prop with a genuinely dynamic value, captured only by the child\'s rest-bag spread',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
import { Card } from './Card'
export function JsxElementPropRestBagDynamic() {
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
    <section bf-s="test_s1">
      <header bf="s1"><!--bf:s0--><a bf-c="^s0">x</a><!--/--></header>
      <div><p>body text</p></div>
    </section>
  `,
})
