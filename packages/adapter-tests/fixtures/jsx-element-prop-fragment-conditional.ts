import { createFixture } from '../src/types'

/**
 * A conditional (ternary) INSIDE a fragment-wrapped, non-`children`
 * component prop (`header={<>{cond() ? <a>x</a> : <b>y</b>}</>}`) — #2702,
 * the "conditional-in-fragment" gap #2651's PR body enumerated as
 * deliberately out of that PR's single-string scope, confirmed broken by
 * direct compile + emitted-JS inspection while investigating #2667 (naked
 * ternary/array JSX props — the fragment-wrap form was that diagnostic's
 * candidate escape hatch, and this fixture is why the escape is NOT
 * offered there).
 *
 * This shape classifies as `jsx-children` (the fragment hoists the
 * conditional, `unwrapHoistedFragment` in jsx-to-ir.ts) and SSR is
 * genuinely correct on every adapter — real JSX on Hono, a `bfMarkup()`-
 * branded `renderChild(...)` call on the 8 template-stash adapters. So
 * this fixture's own `expectedHtml` (below) is the reference-adapter
 * output as-is: no diagnostics expected, no render divergence expected,
 * no CSR-conformance divergence expected either (that harness's mock
 * `createEffect`/`lazySlots` are no-ops — it evaluates the CSR `template`
 * string builder, which IS correctly branded, and never runs the
 * reactive effect where the actual bug lives).
 *
 * The corruption is HYDRATE-TIME only: `isSingleElementJsxChildren`'s
 * narrow gate (`ir-to-client-js/collect-elements.ts`) only brands the
 * single-element jsx-children shape with `bfMarkup()` at the `initChild`
 * getter door. This shape reaches that door UNbranded —
 * `initChild('Card', _s1, { get header() { return cond() ? \`<a>x</a>\` :
 * \`<b>y</b>\` } })` — so the child's own `escapeTextOrNode` reactive
 * effect re-escapes the chosen branch's HTML as literal text the moment
 * it first runs, corrupting the DOM. None of the shared JS-level
 * conformance suites execute a real reactive effect against a real DOM,
 * so the pin for the ACTUAL break lives in
 * `packages/jsx/src/__tests__/markup-prop-brand.test.ts` (the
 * "conditional-in-fragment reaches initChild unbranded (#2702, KNOWN
 * BUG)" case) — a byte-level assertion on the emitted `initChild` getter,
 * the exact site the bug lives at. This fixture's role is to register the
 * shape in the shared corpus and confirm every OTHER layer (SSR, CSR
 * template-string) is unaffected, so the compiler-side pin stays isolated
 * to the one door that's actually broken.
 *
 * Graduation: extend #2651's `bfMarkup()` carrier to this multi-part
 * shape (brand each conditional branch, not just a lone element), flip
 * the pinned assertion in `markup-prop-brand.test.ts` to expect
 * `bfMarkup(...)`, delete the "KNOWN BUG" framing — at that point BF021's
 * #2667 suggestion can offer fragment-wrap as a second escape again.
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
