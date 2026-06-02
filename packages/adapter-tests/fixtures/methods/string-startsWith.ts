import { createFixture } from '../../src/types'

/**
 * `String.prototype.startsWith(prefix)` lowering (#1448 Tier B).
 *
 * Boolean-returning, so the fixture sits at condition position
 * (`{cond ? 'yes' : 'no'}`) like `string-includes` — the emit lands
 * inside the adapter's `if` branch. The prefix matches the start of
 * the value so the truthy branch renders.
 */
export const fixture = createFixture({
  id: 'string-startsWith',
  description: '.startsWith(prefix) renders the matching branch',
  source: `
function StringStartsWith({ value, prefix }: { value: string; prefix: string }) {
  return <div>{value.startsWith(prefix) ? 'yes' : 'no'}</div>
}
export { StringStartsWith }
`,
  props: { value: 'hello world', prefix: 'hello' },
  expectedHtml: `
    <div bf-s="test" bf="s1"><!--bf-cond-start:s0-->yes<!--bf-cond-end:s0--></div>
  `,
})
