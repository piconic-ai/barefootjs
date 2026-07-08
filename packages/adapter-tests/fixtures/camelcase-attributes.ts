import { createFixture } from '../src/types'

/**
 * JSX camelCase attribute names that must lower to their HTML spellings:
 * `htmlFor` → `for`, `tabIndex` → `tabindex`, `maxLength` → `maxlength`,
 * `autoComplete` → `autocomplete`, `spellCheck` → `spellcheck`. A
 * pass-through adapter emits invalid attribute names the browser
 * ignores (silently breaking label association and form behavior).
 */
export const fixture = createFixture({
  id: 'camelcase-attributes',
  description: 'camelCase JSX attributes lower to HTML spellings (htmlFor, tabIndex, ...)',
  source: `
export function CamelcaseAttributes() {
  return (
    <div>
      <label htmlFor="name-field">Name</label>
      <input id="name-field" tabIndex={2} maxLength={10} autoComplete="off" spellCheck={false} />
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test">
      <label for="name-field">Name</label>
      <input autocomplete="off" id="name-field" maxlength="10" spellcheck="false" tabindex="2">
    </div>
  `,
})
