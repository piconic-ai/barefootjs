import { createFixture } from '../src/types'

/**
 * JSX whitespace semantics: multi-line text is trimmed and joined,
 * `{' '}` forces an explicit space between inline elements, significant
 * interior spaces inside a text run are preserved, and a single-line
 * whitespace-only text node BETWEEN two expression children (`{first} {last}`)
 * is kept, not dropped (#3237 review follow-up — pins the cross-adapter
 * coverage gap `normalizeHTML`'s tag-to-tag whitespace erasure would
 * otherwise hide: text-to-text whitespace survives it, so an adapter that
 * silently drops this space fails this fixture).
 */
export const fixture = createFixture({
  id: 'jsx-text-whitespace',
  description: 'Explicit {" "} joiners, multi-line text trimming, and single-line inline-sibling whitespace',
  source: `
export function JsxTextWhitespace() {
  const first = 'Ada'
  const last = 'Lovelace'
  return (
    <p>
      <strong>bold</strong>{' '}
      <em>italic</em>{' '}
      plain text run {first} {last}
    </p>
  )
}
`,
  expectedHtml: `
    <p bf-s="test">
      <strong>bold</strong>
      <em>italic</em>
       plain text run Ada Lovelace</p>
  `,
})
