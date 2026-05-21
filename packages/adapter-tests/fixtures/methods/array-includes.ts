import { createFixture } from '../../src/types'

/**
 * `Array.prototype.includes(x)` lowering (#1448 Tier A).
 *
 * Renders a yes/no badge driven by whether the target value is in the
 * input array. The shape is intentionally simple — a single static
 * `.includes()` against props — so the canonical lowering surface is
 * the only thing exercised. Anything that lowers the method correctly
 * (Hono / CSR via runtime; Mojo / Go via per-adapter helper) renders
 * `<div bf-s="test">yes</div>` against the seeded props below.
 */
export const fixture = createFixture({
  id: 'array-includes',
  description: '.includes(x) on an array prop renders the matching branch',
  source: `
function ArrayIncludes({ items, target }: { items: string[]; target: string }) {
  return <div>{items.includes(target) ? 'yes' : 'no'}</div>
}
export { ArrayIncludes }
`,
  props: { items: ['a', 'b', 'c'], target: 'b' },
  expectedHtml: `
    <div bf-s="test" bf="s1">yes</div>
  `,
})
