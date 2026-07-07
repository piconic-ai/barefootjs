import { createFixture } from '../src/types'

/**
 * HTML character references written in JSX literal text. JSX decodes
 * entities at parse time (`&amp;` → `&`, `&lt;` → `<`, `&copy;` → `©`,
 * `&nbsp;` → U+00A0), and each adapter must then RE-escape the decoded
 * characters for its own HTML emission. An adapter that passes the
 * entity text through raw double-escapes (`&amp;amp;`); one that skips
 * re-escaping emits a parse-corrupting `<`.
 */
export const fixture = createFixture({
  id: 'html-entity-text',
  description: 'HTML entities in JSX literal text decode then re-escape correctly',
  source: `
export function HtmlEntityText() {
  return (
    <div>
      <span>Fish &amp; Chips</span>
      <span>a &lt; b &gt; c</span>
      <span>&copy; 2026</span>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test">
      <span>Fish &amp; Chips</span>
      <span>a &lt; b &gt; c</span>
      <span>© 2026</span>
    </div>
  `,
})
