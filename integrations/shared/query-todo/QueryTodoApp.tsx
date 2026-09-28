'use client'

// TodoMVC on createQuery / createMutation. The list is a query of
// GET api/todos, and every write is a mutation that invalidates `api/todos`
// on success, so the list re-fetches from the server instead of being
// patched by hand. Row writes live in QueryTodoItem; the writes that span
// the list (add, toggle all, clear completed) live here.
//
// One component, both SSR modes (spec/async.md §7.6). A server page passes
// `initialTodos` (mode A): the server renders the list, and the client
// sends nothing on mount. The CSR page mounts it with no props (pure CSR
// mount): the list is requested on mount.
//
// URLs are relative, so they resolve under whatever base path the page is
// served from (the Hono integration mounts under `/integrations/hono`).
// An `invalidates` prefix matches the request URL as written, so it is
// relative too.

import { createMemo, createMutation, createQuery, createSignal, http, onMount } from '@barefootjs/client'
import QueryTodoItem from './QueryTodoItem'

type Todo = { id: number; text: string; done: boolean }

type Filter = 'all' | 'active' | 'completed'

const invalidates = ['api/todos']

type Props = { initialTodos?: Todo[] }

function QueryTodoApp(props: Props) {
  const [todos, fetchTodos] = createQuery(
    () => http.get<Todo[]>('api/todos'),
    { initial: props.initialTodos },
  )
  const [newText, setNewText] = createSignal('')
  const [filter, setFilter] = createSignal<Filter>('all')

  // Without `initialTodos`, `todos()` is undefined until the first response.
  const list = createMemo(() => todos() ?? [])
  const activeCount = createMemo(() => list().filter(t => !t.done).length)
  const allDone = createMemo(() => list().length > 0 && activeCount() === 0)

  const [, addTodo] = createMutation(
    () => http.post<Todo>('api/todos', { text: newText().trim() }),
    { invalidates },
  )
  const [, toggleAll] = createMutation(
    () => http.put<Todo[]>('api/todos', { done: !allDone() }),
    { invalidates },
  )
  const [, clearCompleted] = createMutation(
    () => http.delete('api/todos/completed'),
    { invalidates },
  )

  const getFilterFromHash = (): Filter => {
    const hash = window.location.hash
    if (hash === '#/active') return 'active'
    if (hash === '#/completed') return 'completed'
    return 'all'
  }

  onMount(() => {
    setFilter(getFilterFromHash())
    window.addEventListener('hashchange', () => {
      setFilter(getFilterFromHash())
    })
  })

  const handleAdd = () => {
    if (!newText().trim()) return
    // Clear the input only once the server has the todo, so a failed add
    // keeps what was typed. The failure itself shows through
    // `addTodo.error()`; the no-op handler keeps this derived promise from
    // reporting an unhandled rejection.
    addTodo().then(() => setNewText(''), () => {})
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.isComposing) handleAdd()
  }

  const handleFilterChange = (newFilter: Filter) => {
    setFilter(newFilter)
    window.location.hash = newFilter === 'all' ? '#/' : `#/${newFilter}`
  }

  return (
    <section className="todoapp" aria-busy={fetchTodos.isPending()}>
      <header className="header">
        <h1>todos</h1>
        <input
          className="new-todo"
          placeholder="What needs to be done?"
          value={newText()}
          onInput={e => setNewText(e.target.value)}
          onKeyDown={handleKeyDown}
          autofocus
        />
      </header>
      {fetchTodos.error() ? <p className="load-error" role="alert">Could not load todos.</p> : null}
      {addTodo.error() ? <p className="load-error" role="alert">Could not add the todo.</p> : null}
      <section className="main">
        {list().length > 0 && (
          <>
            <input
              id="toggle-all"
              className="toggle-all"
              type="checkbox"
              checked={allDone()}
              disabled={toggleAll.isPending()}
              onChange={() => toggleAll()}
            />
            <label for="toggle-all">Mark all as complete</label>
          </>
        )}
        <ul className="todo-list">
          {list().filter(t => {
            const f = filter()
            if (f === 'active') return !t.done
            if (f === 'completed') return t.done
            return true
          }).map(todo => (
            <QueryTodoItem key={todo.id} todo={todo} />
          ))}
        </ul>
      </section>
      <footer className="footer">
        <span className="todo-count">
          <strong>{activeCount()}</strong>{' '}{activeCount() === 1 ? 'item' : 'items'} left
        </span>
        <ul className="filters">
          <li>
            <a href="#/" className={filter() === 'all' ? 'selected' : ''} onClick={() => handleFilterChange('all')}>All</a>
          </li>
          <li>
            <a href="#/active" className={filter() === 'active' ? 'selected' : ''} onClick={() => handleFilterChange('active')}>Active</a>
          </li>
          <li>
            <a href="#/completed" className={filter() === 'completed' ? 'selected' : ''} onClick={() => handleFilterChange('completed')}>Completed</a>
          </li>
        </ul>
        {list().length > activeCount() && (
          <button className="clear-completed" disabled={clearCompleted.isPending()} onClick={() => clearCompleted()}>
            Clear completed
          </button>
        )}
      </footer>
    </section>
  )
}

export default QueryTodoApp
