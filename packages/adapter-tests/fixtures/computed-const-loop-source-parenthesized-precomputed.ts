import { createFixture } from '../src/types'

/**
 * prop-precompute twin of `computed-const-loop-source-parenthesized`: the
 * caller computes the keys and passes them as a prop, so the parenthesized
 * loop source `(props.keys)` is a prop read every adapter binds.
 */
export const fixture = createFixture({
  id: 'computed-const-loop-source-parenthesized-precomputed',
  description: 'prop-precompute twin of computed-const-loop-source-parenthesized — a parenthesized prop source renders (#3473)',
  source: `
'use client'

export function ParenthesizedSource(props: { keys: string[] }) {
  return (
    <ul>
      {(props.keys).map((k) => (
        <li key={k}>{k}</li>
      ))}
    </ul>
  )
}
`,
  props: { keys: ['a', 'b'] },
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <li data-key="a"><!--bf:s0-->a<!--/--></li>
      <li data-key="b"><!--bf:s0-->b<!--/--></li>
    </ul>
  `,
})
