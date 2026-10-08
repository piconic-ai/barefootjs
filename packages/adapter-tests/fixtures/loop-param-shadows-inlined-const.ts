import { createFixture } from '../src/types'

/**
 * Sibling of `loop-set-bound-param-shadow` (#3391): a `.map()` item param
 * named like a literal local constant. The constant is inlined rather than
 * bound as a template variable, so restoring it after the loop must not read
 * an undefined variable, and the read after the loop still renders it.
 */
export const fixture = createFixture({
  id: 'loop-param-shadows-inlined-const',
  description: 'An item param named like an inlined literal constant leaves the constant intact after the loop',
  source: `
export function LoopParamShadowsInlinedConst(props: { rows: string[] }) {
  const label = 'outer'
  return (
    <div>
      <ul>{props.rows.map(label => <li key={label}>{label}</li>)}</ul>
      <p>{label}</p>
    </div>
  )
}
`,
  props: { rows: ['a', 'b'] },
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s1">
        <li data-key="a"><!--bf:s0-->a<!--/--></li>
        <li data-key="b"><!--bf:s0-->b<!--/--></li>
      </ul>
      <p>outer</p>
    </div>
  `,
})
