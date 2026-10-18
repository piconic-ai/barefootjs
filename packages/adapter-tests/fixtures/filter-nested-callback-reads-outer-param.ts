import { createFixture } from '../src/types'

/**
 * A filter predicate whose nested `.some(...)` callback reads the outer
 * callback's param (`t => t.tags.some(g => g === t.main)`), as a loop filter
 * and as a `.length` read. Mojolicious bound both params to `$_` with a
 * regex rename, so inside the nested `grep` the outer `t` read the inner
 * element; each callback param is now its own lexical (#3542). ERB's loop
 * gate emitted the outer `t` under its JS name inside the nested block
 * instead of the loop's bound local (`todo`), a `NameError` at render time.
 */
export const fixture = createFixture({
  id: 'filter-nested-callback-reads-outer-param',
  description: 'A nested filter callback reading the outer callback param sees the outer element (#3542)',
  escapes: [{ kind: 'client-directive', fixture: 'filter-nested-callback-reads-outer-param-client' }],
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
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s1">
        <li data-key="a"><!--bf:s0-->a<!--/--></li>
        <li data-key="c"><!--bf:s0-->c<!--/--></li>
      </ul>
      <p bf="s3"><!--bf:s2-->2<!--/--></p>
    </div>
  `,
})
