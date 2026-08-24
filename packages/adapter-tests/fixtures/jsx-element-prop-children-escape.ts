import { createFixture } from '../src/types'

/**
 * The sound escape for `jsx-element-prop-ternary` / `jsx-element-prop-array`'s
 * BF021 refusal (#2667): move the JSX-valued conditional out of the named
 * prop position entirely and into the component's `children`, where a
 * ternary between two JSX elements is the long-established supported
 * shape — a real reactive DOM branch (`insert()`), not a string
 * round-trip through a child component's prop getter. `children`'s
 * receiving interpolation is a bare passthrough with no brand/unwrap step
 * (#2651), so there is no unbranded-getter door for a conditional shape
 * to fall into here: verified by direct compile, `initChild`'s prop
 * object for `Card` carries no getter at all — the conditional lives
 * directly in the parent's own DOM, addressed by its own slot id,
 * entirely independent of the child component.
 */
export const fixture = createFixture({
  id: 'jsx-element-prop-children-escape',
  description: 'BF021 escape: move ternary-wrapped JSX out of a named prop and into children',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
import { Card } from './Card'
export function JsxElementPropChildrenEscape() {
  const [cond, setCond] = createSignal(true)
  const header = cond() ? <a>x</a> : <b>y</b>
  return (
    <Card>
      {header}
      <p>body text</p>
    </Card>
  )
}
`,
  components: {
    './Card': `
export function Card(props: { children?: any }) {
  return (
    <section>
      <div>{props.children}</div>
    </section>
  )
}
`,
  },
  expectedHtml: `
    <section bf-s="test_s1"><div><a bf-c="^s0">x</a><p>body text</p></div></section>
  `,
})
