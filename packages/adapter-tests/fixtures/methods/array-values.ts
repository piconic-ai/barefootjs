import { createFixture } from '../../src/types'

/**
 * `Array.prototype.values()` iteration shape (#1448 Tier B).
 *
 * `.values().map(v => ...)` is semantically identical to plain
 * `.map(v => ...)`. The compiler strips `.values()` silently with
 * no `iterationShape` recorded on the IR — adapters emit standard
 * iteration. This fixture pins the no-op behaviour so a future
 * regression doesn't surface `.values()` as an unsupported method.
 */
export const fixture = createFixture({
  id: 'array-values',
  description: '.values().map(v => ...) iterates values (same as plain .map)',
  source: `
function ArrayValues({ items }: { items: string[] }) {
  return <ul>{items.values().map(v => <li key={v}>{v}</li>)}</ul>
}
export { ArrayValues }
`,
  props: { items: ['a', 'b', 'c'] },
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <li data-key="a"><!--bf:s0-->a<!--/--></li>
      <li data-key="b"><!--bf:s0-->b<!--/--></li>
      <li data-key="c"><!--bf:s0-->c<!--/--></li>
    </ul>
  `,
})
