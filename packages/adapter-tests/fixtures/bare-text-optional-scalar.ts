import { createFixture } from '../src/types'

/**
 * A defaultless optional scalar prop consumed as a BARE text expression
 * (`{size}`, no `??`/attribute involvement) — #2267. JS renders an absent
 * `undefined` prop as empty text; a backend that resolves the prop to a
 * concrete zero-valued struct field (`int`) instead prints its zero value
 * (`0`).
 *
 * A boolean twin (`{active}`) isn't representable here: JSX itself never
 * renders a bare boolean child (`{true}`/`{false}` are both invisible in
 * the oracle), so there's no oracle-diverging case to pin for that type —
 * the zero-value leak is numeric-only in bare text position.
 */
export const fixture = createFixture({
  id: 'bare-text-optional-scalar',
  description: 'Absent optional scalar prop in bare text position renders empty, not its zero value',
  source: `
function BareTextOptionalScalar({ size }: { size?: number }) {
  return <div><span>{size}</span></div>
}
export { BareTextOptionalScalar }
`,
  props: { size: 5 },
  dataPoints: [
    { name: 'present', props: { size: 5 } },
    { name: 'absent', props: {} },
    { name: 'zero', props: { size: 0 } },
  ],
  expectedHtml: `
    <div bf-s="test">
      <span bf="s1"><!--bf:s0-->5<!--/--></span>
    </div>
  `,
})
