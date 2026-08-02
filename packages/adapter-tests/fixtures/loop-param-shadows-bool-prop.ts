import { createFixture } from '../src/types'

/**
 * A `.map()` callback param sharing a BOOLEAN-typed prop's name
 * (`active`), used in a row attribute and row text.
 *
 * The Twig-family adapters classify attribute identifiers against
 * per-component prop-name sets built in `props/prop-classes.ts`. The
 * string-valued set (`collectStringValueNames`) got the
 * `collectLoopBoundNames` subtraction in #2212/#2236 — but its two
 * siblings in the SAME file, `collectBooleanTypedProps` and
 * `collectNullableOptionalProps`, did not (the fix was applied
 * per-function, not per-file — see the audit trail in #2482). A row
 * value whose name matches a boolean prop is therefore routed through
 * the boolean lowering (`bf.bool_str(...)`), rendering `"true"`/
 * `"false"` instead of the row's string value.
 */
export const fixture = createFixture({
  id: 'loop-param-shadows-bool-prop',
  description: '.map() param sharing a boolean prop name renders the row value, not a bool lowering',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

export function BoolPropShadow({ active, flags }: { active: boolean; flags: string[] }) {
  const [n, setN] = createSignal(0)
  return (
    <ul data-n={n()} onClick={() => setN(n() + 1)}>
      {flags.map((active, i) => (
        <li key={i} data-x={active}>{active}</li>
      ))}
    </ul>
  )
}
`,
  props: { active: true, flags: ['on', 'off'] },
  expectedHtml: `
    <ul bf-s="test" bf="s2" data-n="0">
      <li bf="s1" data-key="0" data-x="on"><!--bf:s0-->on<!--/--></li>
      <li bf="s1" data-key="1" data-x="off"><!--bf:s0-->off<!--/--></li>
    </ul>
  `,
})
