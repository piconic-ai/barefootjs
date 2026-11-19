import { createFixture } from '../src/types'

/**
 * #3944: the source is a `let`, which a later assignment may change, `{ ...S }`.
 *
 * A module-const object built with a spread of a source Phase 1 cannot expand
 * has no value a template can compute: the template receives the props, not
 * the module's consts, so the read was an unbound template variable with no
 * diagnostic (an empty string, or a failed render). A template adapter
 * refuses the read (BF101) instead; Hono computes the spread.
 */
export const fixture = createFixture({
  id: 'module-const-object-spread-unresolved-let',
  description: 'a module const spreading a `let` (`{ ...S }`) refuses a read of its key (BF101)',
  escapes: [{ kind: 'client-directive', fixture: 'module-const-object-spread-unresolved-client' }],
  source: `
let S = { k: 'v' }
const B = { ...S }
export function ModuleConstObjectSpreadUnresolvedLet() {
  return <p>{B.k}</p>
}
`,
  expectedHtml: `
    <p bf-s="test">v</p>
  `,
})
