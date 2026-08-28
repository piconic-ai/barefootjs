import { createFixture } from '../src/types'

/**
 * A fragment-rooted, SAME-FILE child component used directly as a keyed
 * `.map()` row's root (`<TodoRow key={todo.id} todo={todo} />`, `TodoRow`
 * returning `<><li>{...}</li></>`) — #2732 / #2733.
 *
 * Before those fixes:
 *   - #2732 (SSR/compile-time): `TodoRow`'s `needsScope` is cleared to
 *     `false` on its wrapped `<li>` by `transformFragment` (the fragment
 *     root's five hydration markers move to a wrapping
 *     `<!--bf-scope:...-->` comment instead), and `renderElement`'s
 *     `data-key` emission lived ONLY inside the `needsScope` block. So
 *     `TodoRow` never even DECLARED a `__dataKey` parameter, let alone
 *     emitted `data-key` — the SSR bytes for a fragment-rooted row carried
 *     no key at all, though `mapArray`'s hydration adopt loop stamps one
 *     on afterward (`primaryEl.setAttribute(BF_KEY, key)`), breaking the
 *     snap oracle's no-op-hydration invariant.
 *   - #2733 (client/runtime): even with the key present, `ItemScope`
 *     (map-array.ts) had no field to carry a fragment row's own
 *     `<!--bf-scope:-->` / `<!--bf-/scope:-->` boundary comments, so a
 *     later reorder (`insertScope`) or removal (`removeScope`) would
 *     move/delete the row's `<li>` while leaving its comments behind,
 *     orphaning `commentScopeRegistry`'s entry for the row.
 *
 * This fixture's SSR-shape half (this file) pins #2732: `data-key` now
 * lands on the wrapped `<li>` — the first ELEMENT among the fragment's own
 * top-level children (`IRElement.carriesDataKey`), matching the CSR
 * runtime's own "first element, not first node" resolution of the same
 * ambiguity (`component.ts`, #2735) — while the five other hydration
 * markers stay on the wrapping comment. #2733's reorder/removal half has
 * no SSR-visible shape (it only matters after a live reconcile), so it is
 * exercised by
 * `packages/client/__tests__/runtime/map-array-fragment-root-row.test.ts`
 * instead.
 */
export const fixture = createFixture({
  id: 'fragment-root-keyed-loop-row',
  description: 'Fragment-rooted same-file child component used as a keyed .map() row (#2732)',
  componentName: 'FragmentRootKeyedLoopRow',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type Todo = { id: number; text: string }
function TodoRow(props: { todo: Todo }) {
  return <><li>{props.todo.text}</li></>
}
export function FragmentRootKeyedLoopRow(props: { items: Todo[] }) {
  const [todos] = createSignal<Todo[]>(props.items)
  return (
    <ul>
      {todos().map(todo => (
        <TodoRow key={todo.id} todo={todo} />
      ))}
    </ul>
  )
}
`,
  props: {
    items: [
      { id: 1, text: 'Eat breakfast' },
      { id: 2, text: 'Write tests' },
    ],
  },
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <li bf="s1" data-key="1"><!--bf:s0-->Eat breakfast<!--/--></li>
      <li bf="s1" data-key="2"><!--bf:s0-->Write tests<!--/--></li>
    </ul>
  `,
})
