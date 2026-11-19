import { createFixture } from '../src/types'

/**
 * #3944: the same spread in a component-scope const.
 *
 * A module-const object built with a spread of a source Phase 1 cannot expand
 * has no value a template can compute: the template receives the props, not
 * the module's consts, so the read was an unbound template variable with no
 * diagnostic (an empty string, or a failed render). A template adapter
 * refuses the read (BF101) instead; Hono computes the spread.
 */
export const fixture = createFixture({
  id: 'module-const-object-spread-unresolved-local',
  description: 'a component-local const spreading a call (`{ ...JSON.parse(…) }`) refuses a read of its key (BF101)',
  escapes: [{ kind: 'client-directive', fixture: 'module-const-object-spread-unresolved-client' }],
  source: `
export function ModuleConstObjectSpreadUnresolvedLocal() {
  const L = { ...JSON.parse('{"k":"v"}') }
  return <p>{L.k}</p>
}
`,
  expectedHtml: `
    <p bf-s="test">v</p>
  `,
})
