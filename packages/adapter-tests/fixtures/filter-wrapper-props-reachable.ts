import { createFixture } from '../src/types'

/**
 * A `.filter(pred).map(todo => <Child todo={todo}/>)` loop over a
 * SAME-FILE child component (#2228, PR #2240), with the filter's
 * REACHABLE branch actually taken.
 *
 * On Go, a loop whose body is a single child component ranges the
 * WRAPPER `<Child>Props` slice (`.TodoRows`, #2130), not the raw datum
 * slice — so the `{{if}}` gating each item's inclusion sees the wrapper
 * struct as its dot context, and the filter predicate's `todo.done` must
 * qualify through the prop that forwards the loop param verbatim
 * (`todo={todo}` → `.Todo.Done`), not lower to a bare `.Done`. That bug
 * shipped silently in production because `todo-app-ssr`'s `filter`
 * signal defaults to `'all'`, which short-circuits the buggy predicate
 * branch away entirely — `html/template` resolves struct fields at
 * EXECUTE time, so a branch that's never taken never 500s.
 *
 * This fixture makes the branch reachable by defaulting `filter` to
 * `'active'` (never `'all'`), so `!todo.done` runs on every render. It
 * mirrors the shape of the `#2228` regression unit tests
 * (`GoTemplateAdapter - filter predicate qualifies through wrapper-slice
 * datum field (#2228)` in `go-template-adapter.test.ts`) — same signal
 * shape (`createSignal<Todo[]>(props.initialTodos ?? [])`), same
 * ternary-folded (block-body) predicate, same `key={todo.id} todo={todo}`
 * child call — except the child (`TodoRow`) is declared in the SAME file
 * instead of imported from a sibling module (so this harness's plain
 * `source` compile, with no `components:` sibling file, doesn't trip the
 * BF103 cross-template-registration refusal an imported child would need
 * `siblingTemplatesRegistered` to suppress), AND the `.filter()` callback's
 * own param is named `todo` — matching the `.map()` param — rather than
 * the unit test's `t`.
 *
 * That last deviation is deliberate, not cosmetic: the unit test's
 * `filter(t => …).map(todo => …)` naming (lifted verbatim from
 * `TodoAppSSR.tsx`) reproduces #2228 on Go identically either way, since
 * Go's fix keys off which PROP forwards the loop param, not the filter
 * callback's own parameter name — but it ALSO trips a separate, unrelated
 * bug on the ERB adapter: `ErbFilterEmitter.identifier()`
 * (`packages/adapter-erb/src/adapter/expr/emitters.ts`) resolves a filter
 * predicate's identifiers by comparing against the LOOP's (map's) param
 * name, not the filter callback's OWN param — so when the two are named
 * differently, a bare reference to the filter's own param (`t.done`)
 * lowers to `v[:t][:done]`, an undefined Ruby hash key, and real ERB
 * rendering raises `NoMethodError: undefined method '[]' for nil`. Same
 * masking story as #2228 itself: `todo-app-ssr`'s `'all'`-default filter
 * never evaluates the `t.done`-referencing branches, so this ERB gap has
 * never fired in production either. It's untracked (no issue exists yet)
 * and out of scope for this backfill (#2228/#2237), so this fixture
 * routes around it — via the same-name predicate/loop param — rather
 * than declaring a divergence for a bug this PR isn't fixing; flagged in
 * the PR description for follow-up.
 *
 * Pre-#2240 this 500s on real Go (`can't evaluate field Done in type
 * FilterWrapperPropsReachableTodoRowProps`); post-#2240 it renders only
 * the not-done todos, at reference parity with Hono. `initialTodos` is
 * non-empty with a mix of done/not-done so the filtered-out item (id 1)
 * and the two kept items (ids 2, 3) are both visible in `expectedHtml`.
 */
export const fixture = createFixture({
  id: 'filter-wrapper-props-reachable',
  description: '.filter(todo => !todo.done).map(todo => <Child todo={todo}/>) with a non-\'all\' default filter reaches the wrapper-Props datum-field qualification (#2228)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

type Todo = { id: number; text: string; done: boolean }
type Filter = 'all' | 'active'

function TodoRow(props: { todo: Todo }) {
  return <li>{props.todo.text}</li>
}

export function FilterWrapperPropsReachable(props: { initialTodos?: Todo[] }) {
  const [todos] = createSignal<Todo[]>(props.initialTodos ?? [])
  const [filter] = createSignal<Filter>('active')
  return (
    <ul>
      {todos().filter(todo => {
        const f = filter()
        if (f === 'active') return !todo.done
        return true
      }).map(todo => (
        <TodoRow key={todo.id} todo={todo} />
      ))}
    </ul>
  )
}
`,
  props: {
    initialTodos: [
      { id: 1, text: 'Eat breakfast', done: true },
      { id: 2, text: 'Write tests', done: false },
      { id: 3, text: 'Ship code', done: false },
    ],
  },
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <li bf-s="TodoRow_*" bf="s1" data-key="2"><!--bf:s0-->Write tests<!--/--></li>
      <li bf-s="TodoRow_*" bf="s1" data-key="3"><!--bf:s0-->Ship code<!--/--></li>
    </ul>
  `,
})
