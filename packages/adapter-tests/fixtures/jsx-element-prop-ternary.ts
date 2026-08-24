import { createFixture } from '../src/types'

/**
 * A ternary WRAPPING JSX at a non-`children` component prop position
 * (`header={cond() ? <a>x</a> : <b>y</b>}`) — #2667, discovered by the
 * #2651 door inventory. `processComponentProps` (jsx-to-ir.ts) classifies
 * a prop as `jsx-children` only when the initializer IS DIRECTLY a JSX
 * element/fragment (parens stripped); a ternary (or array — see
 * `jsx-element-prop-array`) wrapping JSX used to fall through to the
 * plain `expression` AttrValue path, which stringifies the initializer's
 * SOURCE TEXT — literal JSX syntax spliced into the emitted client JS,
 * invalid at runtime. Compile succeeded; the output was broken.
 *
 * Refused loudly instead (BF021), fired in the shared jsx-to-ir.ts phase
 * ahead of any adapter's `adapter.generate()` — mirrors
 * `date-method-uncatalogued` / `rich-prop-client-read`'s reasoning, so
 * all nine adapters (including Hono) pin this identically in their own
 * `conformance-pins.ts`.
 *
 * `escapes` twin: `jsx-element-prop-children-escape`. The OTHER escape
 * this shape might suggest — wrapping the ternary in a fragment at the
 * prop position (`header={<>{cond() ? <a/> : <b/>}</>}`) — is
 * deliberately NOT offered: it compiles (classifies as `jsx-children` via
 * `unwrapHoistedFragment`), but `isSingleElementJsxChildren`'s narrow
 * gate (`ir-to-client-js/collect-elements.ts`) leaves a
 * conditional-in-fragment value UNbranded at the `initChild` getter door
 * — the child's own reactive effect (`escapeTextOrNode`) then re-escapes
 * the chosen branch's HTML as plain text the moment it first reads the
 * prop, corrupting the DOM. Verified by direct compile during #2667's
 * investigation; this is the #2651 door inventory's own
 * "conditional-in-fragment" entry, tracked separately as its own gap.
 */
export const fixture = createFixture({
  id: 'jsx-element-prop-ternary',
  description: 'Ternary wrapping JSX at a non-children prop position refuses with BF021',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
import { Card } from './Card'
export function JsxElementPropTernary() {
  const [cond, setCond] = createSignal(true)
  return (
    <Card header={cond() ? <a>x</a> : <b>y</b>}>
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
  escapes: [{ kind: 'rewrite', fixture: 'jsx-element-prop-children-escape' }],
})
