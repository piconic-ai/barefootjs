import { createFixture } from '../src/types'

/**
 * A named jsx-children prop (`header`) with a genuinely dynamic
 * (fragment-wrapped-conditional) value, on a child that does NOT declare
 * `header` as a param at all — it's captured only via the child's rest-bag
 * spread (`{ children, ...rest }`), the same routing `emitChildField`
 * already special-cases for the STATIC bake path.
 *
 * Regression test for #2805 (originally a gap Pullfrog's review caught on
 * go-template PR #2804): `queueDynamicPropDefine` now routes a prop with no
 * declared field through `bf_with_bag`/`WithBagEntry` (`runtime/bf.go`)
 * instead of `bf_with_props`/`WithProps`, which can only ever target a named
 * struct field — the child's `Rest map[string]any` field (now emitted
 * whenever a component destructures a rest binding at all, not only when it
 * also spreads it onto an element — see `generateInputStruct` /
 * `emitPropsAuxFields`) receives the value under the raw JSX attribute name,
 * and the read (`rest.header`) resolves it via `bf_get` (`member()`'s
 * `restPropsName` branch).
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
