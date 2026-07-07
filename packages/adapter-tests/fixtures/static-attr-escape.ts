import { createFixture } from '../src/types'

/**
 * HTML-metacharacters inside STATIC attribute values (the dynamic-value
 * escape path is pinned by text-escape / #1692). `&` and `<` in a
 * title, and a query string with `&` in an href, must escape without
 * double-escaping across every adapter's template syntax.
 */
export const fixture = createFixture({
  id: 'static-attr-escape',
  description: 'Static attribute values containing & and < escape exactly once',
  source: `
export function StaticAttrEscape() {
  return (
    <div>
      <span title="Fish & Chips">meta</span>
      <a href="/search?a=1&b=2">link</a>
      <span data-note="a < b">less-than</span>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test">
      <span title="Fish &amp; Chips">meta</span>
      <a href="/search?a=1&amp;b=2">link</a>
      <span data-note="a &lt; b">less-than</span>
    </div>
  `,
})
