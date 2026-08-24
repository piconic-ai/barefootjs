import { createFixture } from '../src/types'

/**
 * An array literal WRAPPING JSX at a non-`children` component prop
 * position (`header={[<a>x</a>, <b>y</b>]}`) — #2667's array-shaped
 * sibling of `jsx-element-prop-ternary`; see that fixture's docstring for
 * the full mechanism (classifier miss → raw JSX source text spliced into
 * the emitted client JS) and why the fragment-wrap escape is not offered.
 *
 * Refused with the same BF021, pinned identically on all nine adapters
 * (including Hono) for the same shared-compiler-phase reason.
 */
export const fixture = createFixture({
  id: 'jsx-element-prop-array',
  description: 'Array literal wrapping JSX at a non-children prop position refuses with BF021',
  source: `
'use client'
import { Card } from './Card'
export function JsxElementPropArray() {
  return (
    <Card header={[<a>x</a>, <b>y</b>]}>
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
