import { createFixture } from '../src/types'

/**
 * `/* @client *​/` twin of `computed-const-loop-source-parenthesized`: the
 * same parenthesized computed-const source, with the loop deferred to the
 * browser. SSR renders the list with no rows; the client runtime computes
 * `keys` and materialises them at hydration.
 */
export const fixture = createFixture({
  id: 'computed-const-loop-source-parenthesized-client',
  description: 'A /* @client */ loop over a parenthesized computed const defers to the browser instead of refusing SSR (#3473)',
  source: `
'use client'

export function ParenthesizedSource(props: { labels: Record<string, string> }) {
  const keys = Object.keys(props.labels)
  return (
    <ul>
      {/* @client */ (keys).map((k) => (
        <li key={k}>{k}</li>
      ))}
    </ul>
  )
}
`,
  props: { labels: { a: '1', b: '2' } },
  expectedHtml: `
    <ul bf-s="test" bf="s1"></ul>
  `,
})
