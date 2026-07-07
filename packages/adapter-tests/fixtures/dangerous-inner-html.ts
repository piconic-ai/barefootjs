import { createFixture } from '../src/types'

/**
 * `dangerouslySetInnerHTML` — raw HTML injection, the one place where
 * output must NOT be escaped. Every adapter needs a deliberate
 * unescape affordance (Go `template.HTML`, Ruby `html_safe`-style raw,
 * Twig `|raw`); an adapter with no such affordance must refuse loudly
 * rather than emit the markup entity-escaped (which silently renders
 * tags as text).
 */
export const fixture = createFixture({
  id: 'dangerous-inner-html',
  description: 'dangerouslySetInnerHTML renders raw, unescaped markup',
  source: `
export function DangerousInnerHtml() {
  return <div dangerouslySetInnerHTML={{ __html: '<b>bold</b> &amp; safe' }} />
}
`,
  expectedHtml: `
    <div bf-s="test"><b>bold</b> &amp; safe</div>
  `,
})
