import { createFixture } from '../src/types'

/**
 * #3944: the index is a loop row, `keys.map(key => B[key])`.
 *
 * A module-const object built with a spread of a source Phase 1 cannot expand
 * has no value a template can compute, and a key only known at run time may
 * come from that spread, so the read is refused (BF101) like a concrete key
 * (`module-const-object-spread-unresolved-call`), not spelled as an unbound
 * template variable.
 */
export const fixture = createFixture({
  id: 'module-const-object-spread-unresolved-computed-loop',
  description: 'a computed read of a const with an unresolved spread by a loop row refuses (BF101)',
  escapes: [{ kind: 'client-directive', fixture: 'module-const-object-spread-unresolved-computed-client' }],
  source: `
const B = { ...JSON.parse('{"k":"v"}') }
export function ModuleConstObjectSpreadUnresolvedComputedLoop({ keys }: { keys: string[] }) {
  return <ul>{keys.map(key => <li key={key}>{B[key]}</li>)}</ul>
}
`,
  props: { keys: ['k'] },
  expectedHtml: `
    <ul bf-s="test" bf="s1"><li data-key="k"><!--bf:s0-->v<!--/--></li></ul>
  `,
})
