import { createFixture } from '../../src/types'

/**
 * `Array.prototype.flatMap(i => [i.a, i.b])` — array-literal tuple
 * projection (#1448 Tier C).
 *
 * Each item is mapped to a `[a, b]` pair; flatMap's one-level flatten
 * gathers all pairs into a single flat list. Composed with `.join(' ')`
 * so the interleaved order is visible. Go uses `bf_flat_map_tuple`; Mojo
 * uses `bf->flat_map_tuple`.
 */
export const fixture = createFixture({
  id: 'array-flatmap-tuple',
  description: '.flatMap(i => [i.a, i.b]) gathers per-item field pairs',
  source: `
function ArrayFlatMapTuple({ items }: { items: { a: string; b: string }[] }) {
  return <div>{items.flatMap(i => [i.a, i.b]).join(' ')}</div>
}
export { ArrayFlatMapTuple }
`,
  props: { items: [{ a: 'a1', b: 'b1' }, { a: 'a2', b: 'b2' }] },
  expectedHtml: `
    <div bf-s="test" bf="s1"><!--bf:s0-->a1 b1 a2 b2<!--/--></div>
  `,
})
