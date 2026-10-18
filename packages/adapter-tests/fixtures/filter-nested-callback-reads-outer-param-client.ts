import { createFixture } from '../src/types'

/**
 * `/* @client *​/` twin of `filter-nested-callback-reads-outer-param`: both
 * reads are deferred to the browser, so no BF101 fires and every adapter
 * renders empty markers. The rows start empty (a signal, not a prop) so the
 * CSR template renders the same, as in `filter-nested-callback-predicate-client`.
 */
export const fixture = createFixture({
  id: 'filter-nested-callback-reads-outer-param-client',
  description: 'A nested filter callback reading the outer param, deferred to the client via /* @client */ (#3542)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type Item = { name: string; tags: number[]; main: number }
export function FilterNestedCallbackReadsOuterParamClient() {
  const [items, setItems] = createSignal<Item[]>([])
  return (
    <div>
      <ul>{/* @client */ items().filter(t => t.tags.some(g => g === t.main)).map(todo => <li key={todo.name}>{todo.name}</li>)}</ul>
      <p>{/* @client */ items().filter(t => t.tags.some(g => g === t.main)).length}</p>
    </div>
  )
}
`,
})
