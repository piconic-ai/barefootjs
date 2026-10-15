import { createFixture } from '../src/types'

/**
 * A `.toSorted()` comparator neither the evaluator nor the structured
 * `{keys: …}` descriptor models (`localeCompare` with a locale argument).
 * Hono / CSR run the callback as JS; a DSL adapter that cannot lower it
 * declares the diagnostic in its `conformancePins`.
 */
export const fixture = createFixture({
  id: 'sort-opaque-comparator',
  description: 'A `.toSorted()` comparator outside the evaluator and the descriptor — DSL diagnostic',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function SortOpaqueComparator() {
  const [items, setItems] = createSignal<string[]>(['b', 'a'])
  return <p>{items().toSorted((a, b) => a.localeCompare(b, 'en')).join(',')}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->a,b<!--/--></p>
  `,
  escapes: [{ kind: 'client-directive', fixture: 'sort-opaque-comparator-client' }],
})
