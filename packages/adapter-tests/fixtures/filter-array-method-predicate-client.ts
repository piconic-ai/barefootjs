import { createFixture } from '../src/types'

/**
 * `filter-array-method-predicate` deferred to the client via `/* @client *\/`, the escape its
 * diagnostic suggests.
 */
export const fixture = createFixture({
  id: 'filter-array-method-predicate-client',
  description: 'A `.filter()` predicate on a string method, deferred to the client via /* @client */',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function FilterArrayMethodPredicateClient() {
  const [items, setItems] = createSignal<string[]>(['ab', 'b', 'ac'])
  return <p>{/* @client */ items().filter(x => x.startsWith('a')).join(',')}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0--><!--/--></p>
  `,
})
