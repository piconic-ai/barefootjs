import { createFixture } from '../src/types'

/**
 * #3916: a module-const object built by spreading another literal const
 * (`{ ...R, extra: 1 }`) has the keys of `R` plus its own. Reading an
 * inherited key (`B.k`) and an own key (`B.extra`) renders the values on every
 * adapter; before the fix the spread made the whole const unresolvable and the
 * read was an unbound template variable or a silent empty string.
 */
export const fixture = createFixture({
  id: 'module-const-object-spread-literal',
  description: 'a module-level object const built with a spread of a literal const renders inherited and own keys (#3916)',
  source: `
const R = { k: 'v' }
const B = { ...R, extra: 1 }
export function ModuleConstObjectSpreadLiteral() {
  return <p>{B.k}-{B.extra}</p>
}
`,
  expectedHtml: `
    <p bf-s="test">v-1</p>
  `,
})
