import { createFixture } from '../src/types'

/**
 * A filter predicate whose nested `.some(...)` callback reads the outer
 * callback's param (`t => t.tags.some(g => g === t.main)`), as a loop filter
 * and as a `.length` read. Mojolicious bound both params to `$_` with a
 * regex rename, so inside the nested `grep` the outer `t` read the inner
 * element; each callback param is now its own lexical (#3542).
 */
export const fixture = createFixture({
  id: 'filter-nested-callback-reads-outer-param',
  description: 'A nested filter callback reading the outer callback param sees the outer element (#3542)',
  source: `
export function FilterNestedCallbackReadsOuterParam(props: { items: { name: string; tags: number[]; main: number }[] }) {
  return (
    <div>
      <ul>{props.items.filter(t => t.tags.some(g => g === t.main)).map(todo => <li key={todo.name}>{todo.name}</li>)}</ul>
      <p>{props.items.filter(t => t.tags.some(g => g === t.main)).length}</p>
    </div>
  )
}
`,
  props: {
    items: [
      { name: 'a', tags: [1, 2], main: 2 },
      { name: 'b', tags: [3], main: 4 },
      { name: 'c', tags: [5], main: 5 },
    ],
  },
})
