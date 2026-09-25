import { createFixture } from '../src/types'

/**
 * A `.map()` over a module-scope static literal array whose row is an
 * element wrapping a child component (`<li key={i}><Badge label={i} /></li>`).
 * The array is fully known at compile time (unlike
 * `module-const-loop-source-computed`, whose const comes from a function
 * call), and the same loop with a plain element row inlines on every
 * adapter (`module-const-loop-source`). Every row renders at SSR.
 */
export const fixture = createFixture({
  id: 'static-literal-loop-component-in-row',
  description: 'A loop over a module-scope static literal array with a child component inside each row renders every row at SSR',
  escapes: [
    { kind: 'prop-precompute', fixture: 'static-literal-loop-component-in-row-precomputed' },
    { kind: 'client-directive', fixture: 'static-literal-loop-component-in-row-client' },
  ],
  source: `
'use client'

function Badge(props: { label: string }) {
  return <em className="badge">{props.label}</em>
}

const items = ['a', 'b']

export function StaticLiteralLoopComponentInRow() {
  return (
    <ul>
      {items.map(i => (
        <li key={i}>
          <Badge label={i} />
        </li>
      ))}
    </ul>
  )
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <li data-key="a"><em bf-s="test_s0" bf="s1" class="badge"><!--bf:s0-->a<!--/--></em></li>
      <li data-key="b"><em bf-s="test_s0" bf="s1" class="badge"><!--bf:s0-->b<!--/--></em></li>
    </ul>
  `,
})
