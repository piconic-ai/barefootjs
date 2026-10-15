import { createFixture } from '../src/types'

/**
 * `sort-opaque-comparator` deferred to the client via `/* @client *\/`, the escape its
 * diagnostic suggests.
 */
export const fixture = createFixture({
  id: 'sort-opaque-comparator-client',
  description: 'A `.toSorted()` comparator outside the evaluator and the descriptor, deferred to the client via /* @client */',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function SortOpaqueComparatorClient() {
  const [items, setItems] = createSignal<string[]>(['b', 'a'])
  return <p>{/* @client */ items().toSorted((a, b) => a.localeCompare(b, 'en')).join(',')}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0--><!--/--></p>
  `,
})
