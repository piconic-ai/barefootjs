import { createFixture } from '../../src/types'

/**
 * `String.prototype.toLowerCase()` lowering (#1448 Tier A).
 *
 * The Go runtime already registers `bf_lower`; this fixture pins
 * the JS-method → helper wire-up at the parser / adapter layer.
 * Mojo's `lc` builtin handles it natively. Using a mixed-case prop
 * value so a lowering that no-ops still fails the assertion.
 */
export const fixture = createFixture({
  id: 'string-toLowerCase',
  description: '.toLowerCase() lowercases the receiver string',
  source: `
function StringToLowerCase({ value }: { value: string }) {
  return <div>{value.toLowerCase()}</div>
}
export { StringToLowerCase }
`,
  props: { value: 'Hello World' },
  expectedHtml: `
    <div bf-s="test" bf="s1"><!--bf:s0-->hello world<!--/--></div>
  `,
})
