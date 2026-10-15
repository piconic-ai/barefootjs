import { createFixture } from '../src/types'

/**
 * `filter-opaque-predicate` deferred to the client via `/* @client *\/`, the escape its
 * diagnostic suggests.
 */
export const fixture = createFixture({
  id: 'filter-opaque-predicate-client',
  description: 'A `.filter()` predicate calling an unlowered method, deferred to the client via /* @client */',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function FilterOpaquePredicateClient() {
  const [items, setItems] = createSignal<string[]>(['a', 'z'])
  return <p>{/* @client */ items().filter(x => x.localeCompare('m') > 0).join(',')}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0--><!--/--></p>
  `,
})
