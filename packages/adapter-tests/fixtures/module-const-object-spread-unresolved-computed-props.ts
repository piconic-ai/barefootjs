import { createFixture } from '../src/types'

/**
 * #3944: the index is a prop, `B[field]`.
 *
 * A module-const object built with a spread of a source Phase 1 cannot expand
 * has no value a template can compute, and a key only known at run time may
 * come from that spread, so the read is refused (BF101) like a concrete key
 * (`module-const-object-spread-unresolved-call`), not spelled as an unbound
 * template variable.
 */
export const fixture = createFixture({
  id: 'module-const-object-spread-unresolved-computed-props',
  description: 'a module const with an unresolved spread read with a prop as the key refuses (BF101)',
  escapes: [{ kind: 'client-directive', fixture: 'module-const-object-spread-unresolved-computed-client' }],
  source: `
const B = { ...JSON.parse('{"k":"v"}') }
export function ModuleConstObjectSpreadUnresolvedComputedProps({ field }: { field: string }) {
  return <p>{B[field]}</p>
}
`,
  props: { field: 'k' },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->v<!--/--></p>
  `,
})
