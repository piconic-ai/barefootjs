import { createFixture } from '../src/types'

/**
 * `filter-native-nested-index` deferred to the client via `/* @client *\/`, the escape its
 * diagnostic suggests.
 */
export const fixture = createFixture({
  id: 'filter-native-nested-index-client',
  description: 'A native-only `.filter()` predicate whose nested `.filter()` reads its index, deferred to the client via /* @client */',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function FilterNativeNestedIndexClient() {
  const [rows, setRows] = createSignal<string[][]>([['a', 'b'], ['c']])
  return <p>{/* @client */ rows().filter(row => row.join(',').startsWith('a') && row.filter((x, i) => i > 0).length > 0).length}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0--><!--/--></p>
  `,
})
