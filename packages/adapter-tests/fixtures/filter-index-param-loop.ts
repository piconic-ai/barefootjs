import { createFixture } from '../src/types'

/**
 * A loop-source `.filter()` predicate reading its index parameter. The loop
 * filter is evaluated with only the element bound, so the predicate cannot
 * lift into `IRLoop.filterPredicate` (BF021), and the chain left in the loop
 * array is refused by the support gate.
 * Hono / CSR run the callback as JS; a DSL adapter that cannot lower it
 * declares the diagnostic in its `conformancePins`.
 */
export const fixture = createFixture({
  id: 'filter-index-param-loop',
  description: 'A loop `.filter()` predicate reading its index — JS-runtime faithful, DSL diagnostic',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function FilterIndexParamLoop() {
  const [items, setItems] = createSignal<string[]>(['a', 'b', 'c'])
  return <ul>{items().filter((x, i) => i > 0).map(x => <li key={x}>{x}</li>)}</ul>
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <li data-key="b"><!--bf:s0-->b<!--/--></li>
      <li data-key="c"><!--bf:s0-->c<!--/--></li>
    </ul>
  `,
  escapes: [{ kind: 'client-directive', fixture: 'filter-index-param-loop-client' }],
})
