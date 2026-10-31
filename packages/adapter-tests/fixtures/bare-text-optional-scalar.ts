import { createFixture } from '../src/types'

/**
 * A defaultless optional scalar prop consumed as a BARE text expression
 * (`{size}`, no `??`/attribute involvement) — #2267. JS renders an absent
 * `undefined` prop as empty text; a backend that resolves the prop to a
 * concrete zero-valued struct field (`int`) instead prints its zero value
 * (`0`).
 *
 * A boolean twin (`{active}`) isn't this case: JSX renders no boolean
 * child (`{true}` / `{false}` are both invisible in the oracle), so its
 * absent and `false` values render the same. A present boolean text child
 * is the `boolean-text-child` fixture (renders nothing, #3824 step 5).
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
    <div bf-s="test"><span bf="s1"><!--bf:s0-->5<!--/--></span></div>
  `,
})
