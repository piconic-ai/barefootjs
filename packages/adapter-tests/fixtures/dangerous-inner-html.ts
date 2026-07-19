import { createFixture } from '../src/types'

/**
 * `dangerouslySetInnerHTML` with a compile-time string-literal `__html` —
 * raw HTML injection, the one place where output must NOT be escaped.
 * `resolveDangerousInnerHtml` (#2207) splices the literal directly into
 * each adapter's template as trusted text (guarded per-adapter against
 * that language's own template metacharacters), so this renders correctly
 * on every adapter, not just Hono. The DYNAMIC (non-literal) case is a
 * separate fixture — `dangerous-inner-html-dynamic` — which still refuses
 * with BF101 on every template adapter (tracked: #2319).
 */
export const fixture = createFixture({
  id: 'dangerous-inner-html',
  description: 'dangerouslySetInnerHTML with an inline string literal renders raw, unescaped markup on every adapter',
  source: `
export function DangerousInnerHtml() {
  return <div dangerouslySetInnerHTML={{ __html: '<b>bold</b> &amp; safe' }} />
}
`,
  expectedHtml: `
    <div bf-s="test"><b>bold</b> &amp; safe</div>
  `,
})
