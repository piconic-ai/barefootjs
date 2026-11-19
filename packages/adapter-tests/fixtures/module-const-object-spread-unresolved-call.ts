import { createFixture } from '../src/types'

/**
 * #3944: the source is a call, `{ ...JSON.parse(…) }`.
 *
 * A module-const object built with a spread of a source Phase 1 cannot expand
 * has no value a template can compute: the template receives the props, not
 * the module's consts, so the read was an unbound template variable with no
 * diagnostic (an empty string, or a failed render). A template adapter
 * refuses the read (BF101) instead; Hono computes the spread.
 */
export const fixture = createFixture({
  id: 'module-const-object-spread-unresolved-call',
  description: 'a module const spreading a call (`{ ...JSON.parse(…) }`) refuses a read of its key (BF101)',
  escapes: [{ kind: 'client-directive', fixture: 'module-const-object-spread-unresolved-client' }],
  source: `
const B = { ...JSON.parse('{"k":"v"}') }
export function ModuleConstObjectSpreadUnresolvedCall() {
  return <p>{B.k}</p>
}
`,
  expectedHtml: `
    <p bf-s="test">v</p>
  `,
})
