import { createFixture } from '../src/types'

/**
 * A conditional (ternary) INSIDE a fragment-wrapped, non-`children`
 * component prop (`header={<>{cond() ? <a>x</a> : <b>y</b>}</>}`) — #2702,
 * the "conditional-in-fragment" gap #2651's PR body enumerated as
 * deliberately out of that PR's single-string scope.
 *
 * This shape classifies as `jsx-children` (the fragment hoists the
 * conditional, `unwrapHoistedFragment` in jsx-to-ir.ts) and SSR is
 * genuinely correct on every adapter — real JSX on Hono, a `bfMarkup()`-
 * branded `renderChild(...)` call on the 8 template-stash adapters. So
 * this fixture's own `expectedHtml` (below) is the reference-adapter
 * output as-is: no diagnostics expected, no render divergence expected.
 *
 * The bug this fixture pinned (now fixed) was HYDRATE-TIME only:
 * `isSingleElementJsxChildren`'s narrow gate (#2651,
 * `ir-to-client-js/collect-elements.ts`) only branded the single-element
 * jsx-children shape with `bfMarkup()` at the `initChild` getter door —
 * this shape reached that door UNbranded, so the child's own
 * `escapeTextOrNode` reactive effect re-escaped the chosen branch's HTML
 * as literal text the moment it first ran, corrupting the DOM. None of
 * the shared JS-level conformance suites execute a real reactive effect
 * against a real DOM, so the byte-level pin lived in
 * `packages/jsx/src/__tests__/markup-prop-brand.test.ts` — that pin now
 * asserts each element branch of the conditional is wrapped in
 * `bfMarkup(...)` (`jsxChildrenPropGetterExpr`, which brands every
 * `'element'` LEAF after flattening fragments/conditionals, replacing the
 * single-element-only gate). This fixture's role is to register the
 * shape in the shared corpus and confirm every OTHER layer (SSR, CSR
 * template-string) stays unaffected by the change.
 */
export const fixture = createFixture({
  id: 'jsx-element-prop-fragment-conditional',
  description: 'Conditional inside a fragment-wrapped non-children prop (#2702)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
import { Card } from './Card'
export function JsxElementPropFragmentConditional() {
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
    <section bf-s="test_s1">
      <header bf="s1"><!--bf:s0--><a bf-c="^s0">x</a><!--/--></header>
      <div><p>body text</p></div>
    </section>
  `,
})
