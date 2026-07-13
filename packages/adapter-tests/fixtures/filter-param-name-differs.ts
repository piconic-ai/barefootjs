import { createFixture } from '../src/types'

/**
 * The un-routed-around twin of `filter-wrapper-props-reachable` (#2228).
 * Same shape — `.filter(predicate).map(todo => <Child todo={todo}/>)` over
 * a SAME-FILE child component, filter defaulting to `'active'` (never
 * `'all'`) so the predicate branch is actually REACHABLE — except this
 * fixture uses the ORIGINAL, un-routed-around param naming lifted verbatim
 * from `TodoAppSSR.tsx`: `filter(t => ...)` for the filter callback,
 * `map(todo => ...)` for the map callback.
 *
 * `filter-wrapper-props-reachable` deliberately renamed its filter
 * callback's param to `todo` (matching the map callback) to dodge a
 * SEPARATE, ERB-only bug tracked as #2245: `ErbFilterEmitter.identifier()`
 * (`packages/adapter-erb/src/adapter/expr/emitters.ts`) matched a filter
 * predicate's identifiers against the LOOP's (map's) own param, not the
 * filter callback's OWN param — so a differently-named filter param (`t`)
 * lowered every reference to `t` in the predicate to the unseeded
 * `v[:t]` vars-Hash fallback instead of the loop-bound `todo` local, and
 * real Ruby raised `NoMethodError: undefined method '[]' for nil` at
 * render time. Masked in production the same way #2228 was: `todo-app-ssr`'s
 * `'all'`-default filter short-circuits the `t.done`-referencing branch
 * away entirely.
 *
 * #2245 fixed `ErbFilterEmitter` (`renderParamAs`, defaulting to
 * `rubyLocal(param)` everywhere except the `filter().map()` loop-gating
 * `<if>`, which now matches identifiers against the filter's own param
 * while EMITTING the loop's actual bound Ruby local) — so this fixture
 * pins the now-FIXED behavior with the un-routed-around naming
 * `filter-wrapper-props-reachable` had to avoid. Both fixtures otherwise
 * co-exercise the same #2228 Go wrapper-Props datum-field qualification
 * (`todo={todo}` forwards the MAP callback's own param, which is what Go's
 * fix keys off — untouched by which name the filter callback happens to
 * use).
 */
export const fixture = createFixture({
  id: 'filter-param-name-differs',
  description:
    '.filter(t => !t.done).map(todo => <Child todo={todo}/>) with differently-named filter/map params and a reachable (non-\'all\'-default) predicate (#2245)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

type Todo = { id: number; text: string; done: boolean }
type Filter = 'all' | 'active'

function TodoRow(props: { todo: Todo }) {
  return <li>{props.todo.text}</li>
}

export function FilterParamNameDiffers(props: { initialTodos?: Todo[] }) {
  const [todos] = createSignal<Todo[]>(props.initialTodos ?? [])
  const [filter] = createSignal<Filter>('active')
  return (
    <ul>
      {todos().filter(t => {
        const f = filter()
        if (f === 'active') return !t.done
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
