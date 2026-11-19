import { createFixture } from '../src/types'

/**
 * #3944: the optional-chained read `B?.[field]`.
 *
 * A module-const object built with a spread of a source Phase 1 cannot expand
 * has no value a template can compute, and a key only known at run time may
 * come from that spread, so the read is refused (BF101) like a concrete key
 * (`module-const-object-spread-unresolved-call`), not spelled as an unbound
 * template variable.
 */
export const fixture = createFixture({
  id: 'module-const-object-spread-unresolved-computed-optional',
  description: 'an optional-chained computed read of a const with an unresolved spread refuses (BF101)',
  escapes: [{ kind: 'client-directive', fixture: 'module-const-object-spread-unresolved-computed-client' }],
  source: `
const B = { ...JSON.parse('{"k":"v"}') }
export function ModuleConstObjectSpreadUnresolvedComputedOptional({ field }: { field: string }) {
  return <p>{B?.[field]}</p>
}
`,
  props: { field: 'k' },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->v<!--/--></p>
  `,
})
