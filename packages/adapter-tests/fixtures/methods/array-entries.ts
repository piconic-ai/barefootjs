import { createFixture } from '../../src/types'

/**
 * `Array.prototype.entries()` iteration shape (#1448 Tier B).
 *
 * `.entries().map(([i, v]) => ...)` iterates with both index and
 * value. The adapters already have native index+value iteration
 * primitives (Go: `{{range $i, $v := .Arr}}`; Mojo:
 * `for my $i (0..$#{$arr}) { my $v = $arr->[$i]; ... }`), so the
 * compiler strips `.entries()` from the chain and synthesises the
 * destructured `[i, v]` into `loop.index` + `loop.param`.
 */
export const fixture = createFixture({
  id: 'array-entries',
  description: '.entries().map(([i, v]) => ...) iterates with index and value',
  source: `
function ArrayEntries({ items }: { items: string[] }) {
  return <ul>{items.entries().map(([i, v]) => <li key={i}>{i}: {v}</li>)}</ul>
}
export { ArrayEntries }
`,
  props: { items: ['a', 'b', 'c'] },
  expectedHtml: `
    <ul bf-s="test" bf="s2">
      <li data-key="0"><!--bf:s0-->0<!--/-->: <!--bf:s1-->a<!--/--></li>
      <li data-key="1"><!--bf:s0-->1<!--/-->: <!--bf:s1-->b<!--/--></li>
      <li data-key="2"><!--bf:s0-->2<!--/-->: <!--bf:s1-->c<!--/--></li>
    </ul>
  `,
})
