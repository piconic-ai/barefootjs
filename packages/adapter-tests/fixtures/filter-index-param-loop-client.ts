import { createFixture } from '../src/types'

/**
 * `filter-index-param-loop` deferred to the client via `/* @client *\/`, the escape its
 * diagnostic suggests. The list starts empty, as in the other client-only
 * loop twins: the server renders no rows and the client mounts none.
 */
export const fixture = createFixture({
  id: 'filter-index-param-loop-client',
  description: 'A loop `.filter()` predicate reading its index, deferred to the client via /* @client */',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function FilterIndexParamLoopClient() {
  const [items, setItems] = createSignal<string[]>([])
  return <ul>{/* @client */ items().filter((x, i) => i > 0).map(x => <li key={x}>{x}</li>)}</ul>
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s1"></ul>
  `,
})
