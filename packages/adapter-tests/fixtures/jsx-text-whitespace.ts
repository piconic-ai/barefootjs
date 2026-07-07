import { createFixture } from '../src/types'

/**
 * JSX whitespace semantics: multi-line text is trimmed and joined,
 * `{' '}` forces an explicit space between inline elements, and
 * significant interior spaces inside a text run are preserved.
 */
export const fixture = createFixture({
  id: 'jsx-text-whitespace',
  description: 'Explicit {" "} joiners and multi-line text trimming',
  source: `
export function JsxTextWhitespace() {
  return (
    <p>
      <strong>bold</strong>{' '}
      <em>italic</em>{' '}
      plain text run
    </p>
  )
}
`,
  expectedHtml: `
    <p bf-s="test">
      <strong>bold</strong>
      <em>italic</em>
       plain text run 
    </p>
  `,
})
