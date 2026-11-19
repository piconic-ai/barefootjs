import { createFixture } from '../src/types'

/**
 * #3944: the index is a signal read, `B[field()]`.
 *
 * A module-const object built with a spread of a source Phase 1 cannot expand
 * has no value a template can compute, and a key only known at run time may
 * come from that spread, so the read is refused (BF101) like a concrete key
 * (`module-const-object-spread-unresolved-call`), not spelled as an unbound
 * template variable.
 */
export const fixture = createFixture({
  id: 'module-const-object-spread-unresolved-computed-signal',
  description: 'a computed read of a const with an unresolved spread by a signal refuses (BF101)',
  escapes: [{ kind: 'client-directive', fixture: 'module-const-object-spread-unresolved-computed-client' }],
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

const B = { ...JSON.parse('{"k":"v"}') }
export function ModuleConstObjectSpreadUnresolvedComputedSignal() {
  const [field] = createSignal('k')
  return <p>{B[field()]}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->v<!--/--></p>
  `,
})
