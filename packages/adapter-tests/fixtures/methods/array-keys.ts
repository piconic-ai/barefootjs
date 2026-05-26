import { createFixture } from '../../src/types'

/**
 * `Array.prototype.keys()` iteration shape (#1448 Tier B).
 *
 * `.keys().map(i => ...)` iterates over array indices only. The
 * adapters bind the callback param to the index variable
 * (Go: `{{range $i, $_ := .Arr}}`; Mojo: `for my $i (0..$#{$arr})`
 * with no per-item value assignment).
 */
export const fixture = createFixture({
  id: 'array-keys',
  description: '.keys().map(i => ...) iterates over indices',
  source: `
function ArrayKeys({ items }: { items: string[] }) {
  return <ul>{items.keys().map(k => <li key={k}>{k}</li>)}</ul>
}
export { ArrayKeys }
`,
  props: { items: ['a', 'b', 'c'] },
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <li data-key="0"><!--bf:s0-->0<!--/--></li>
      <li data-key="1"><!--bf:s0-->1<!--/--></li>
      <li data-key="2"><!--bf:s0-->2<!--/--></li>
    </ul>
  `,
})
