import { createFixture } from '../src/types'

/**
 * `prop-precompute` escape twin of `static-literal-loop-component-in-row`:
 * the caller passes the array in as a prop, so the loop source is a plain
 * prop every adapter binds directly and each row still renders at SSR.
 */
export const fixture = createFixture({
  id: 'static-literal-loop-component-in-row-precomputed',
  description: 'prop-precompute twin of static-literal-loop-component-in-row — the rows render at SSR from a prop',
  source: `
'use client'

function Badge(props: { label: string }) {
  return <em className="badge">{props.label}</em>
}

export function StaticLiteralLoopComponentInRowPrecomputed(props: { items: string[] }) {
  return (
    <ul>
      {props.items.map(i => (
        <li key={i}>
          <Badge label={i} />
        </li>
      ))}
    </ul>
  )
}
`,
  props: { items: ['a', 'b'] },
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <li data-key="a"><em bf-s="test_s0" bf="s1" class="badge"><!--bf:s0-->a<!--/--></em></li>
      <li data-key="b"><em bf-s="test_s0" bf="s1" class="badge"><!--bf:s0-->b<!--/--></em></li>
    </ul>
  `,
})
