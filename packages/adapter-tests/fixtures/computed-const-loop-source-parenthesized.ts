import { createFixture } from '../src/types'

/**
 * `static-array-from-props`'s computed-const loop source, parenthesized:
 * `(keys).map(…)`. The parser unwraps the parentheses, so this names the
 * same component-scope computed const, which no template binds. The gate
 * once tested the raw source text against an identifier pattern, so the
 * parenthesized form slipped past the BF101 refusal and ERB rendered a
 * loop over an unseeded variable (#3473).
 */
export const fixture = createFixture({
  id: 'computed-const-loop-source-parenthesized',
  description: 'A parenthesized computed-const loop source refuses (BF101) like the bare one (#3473)',
  escapes: [
    { kind: 'prop-precompute', fixture: 'computed-const-loop-source-parenthesized-precomputed' },
    { kind: 'client-directive', fixture: 'computed-const-loop-source-parenthesized-client' },
  ],
  source: `
'use client'

export function ParenthesizedSource(props: { labels: Record<string, string> }) {
  const keys = Object.keys(props.labels)
  return (
    <ul>
      {(keys).map((k) => (
        <li key={k}>{k}</li>
      ))}
    </ul>
  )
}
`,
  props: { labels: { a: '1', b: '2' } },
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <li data-key="a"><!--bf:s0-->a<!--/--></li>
      <li data-key="b"><!--bf:s0-->b<!--/--></li>
    </ul>
  `,
})
