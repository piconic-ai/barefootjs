import { createFixture } from '../../src/types'

/**
 * `String.prototype.split(sep, limit)` — the limit form (#1448 Tier B,
 * full-arity). JS caps the result at `limit` pieces
 * (`"a,b,c,d".split(",", 2)` → `["a", "b"]`). Chained into `.join('|')`
 * so the capped array is observable; the conformance harness renders
 * this through Hono / Go / Mojo and compares to the real-JS output.
 */
export const fixture = createFixture({
  id: 'string-split-limit',
  description: '.split(sep, limit) caps the number of pieces',
  source: `
function StringSplitLimit({ value }: { value: string }) {
  return <div>{value.split(',', 2).join('|')}</div>
}
export { StringSplitLimit }
`,
  props: { value: 'a,b,c,d' },
  expectedHtml: `
    <div bf-s="test" bf="s1"><!--bf:s0-->a|b<!--/--></div>
  `,
})
