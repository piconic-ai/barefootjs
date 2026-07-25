'use client'
import { createSignal } from '@barefootjs/client'

export type Todo = {
  id: number
  title: string
  priority: number
  done: boolean
  tags: string[]
}

/**
 * Tagged TODO table — SSR/hydration audit target.
 *
 * Exercises, in one component:
 *  - signal-driven row add / delete / reorder over a keyed `.map()` loop
 *  - a `.filter().sort().map()` chain whose predicate/comparator read signals
 *  - a `.map()` block body with `const` bindings and array building before `return`
 *  - tag expansion through a `.flatMap()` block body
 *  - destructured props (`heading`, `owner`, `maxTags`) referenced inside loop bodies
 *  - data containing `<b>`, `&`, `"` special characters (rows, tags, dynamic attributes)
 *
 * Destructuring is intentional (initial values / static config per
 * docs/core/reactivity/props-reactivity.md).
 */
// @bf-ignore props-destructuring
export function TaggedTodoTable({
  heading,
  owner,
  maxTags,
  initial,
  initialHideDone,
  initialSort,
}: {
  heading: string
  owner: string
  maxTags: number
  initial: Todo[]
  initialHideDone: boolean
  initialSort: string
}) {
  const [todos, setTodos] = createSignal<Todo[]>(initial)
  const [nextId, setNextId] = createSignal(100)
  const [hideDone, setHideDone] = createSignal(initialHideDone)
  // 'none' | 'asc' | 'desc'
  const [sortMode, setSortMode] = createSignal(initialSort)

  const addRow = () => {
    const id = nextId()
    setNextId(id + 1)
    setTodos([
      ...todos(),
      {
        id,
        title: `New <b>row</b> & "${id}"`,
        priority: (id % 5) + 1,
        done: false,
        tags: ['fresh & new', `id "${id}"`],
      },
    ])
  }

  const removeRow = (id: number) => setTodos(todos().filter(t => t.id !== id))

  const moveUp = (id: number) => {
    const list = [...todos()]
    const i = list.findIndex(t => t.id === id)
    if (i > 0) {
      const [row] = list.splice(i, 1)
      list.splice(i - 1, 0, row)
    }
    setTodos(list)
  }

  const toggleDone = (id: number) =>
    setTodos(todos().map(t => (t.id === id ? { ...t, done: !t.done } : t)))

  const cycleSort = () =>
    setSortMode(sortMode() === 'none' ? 'asc' : sortMode() === 'asc' ? 'desc' : 'none')

  return (
    <div className="tagged-todo">
      <h2 id="heading">{heading}</h2>
      <div className="toolbar">
        <button id="add" onClick={addRow}>Add row</button>
        <button id="toggle-hide-done" onClick={() => setHideDone(!hideDone())}>
          {hideDone() ? 'Show done' : 'Hide done'}
        </button>
        <button id="cycle-sort" onClick={cycleSort}>sort: {sortMode()}</button>
      </div>
      <table id="todo-table">
        <tbody>
          {todos()
            .filter(t => {
              if (hideDone()) return !t.done
              return true
            })
            .sort((a, b) =>
              sortMode() === 'asc'
                ? a.priority - b.priority
                : sortMode() === 'desc'
                  ? b.priority - a.priority
                  : 0,
            )
            .map(t => {
              const stateLabel = t.done ? 'done & dusted' : 'open'
              const cells = []
              cells.push(<td className="title">{t.title}</td>)
              cells.push(<td className="priority">{t.priority}</td>)
              cells.push(<td className="state">{stateLabel}</td>)
              return (
                <tr key={t.id} data-title={t.title}>
                  {cells}
                  <td className="owner">{owner}</td>
                  <td className="actions">
                    <button className="up" onClick={() => moveUp(t.id)}>up</button>
                    <button className="toggle" onClick={() => toggleDone(t.id)}>toggle</button>
                    <button className="del" onClick={() => removeRow(t.id)}>del</button>
                  </td>
                </tr>
              )
            })}
        </tbody>
      </table>
      <ul id="tag-list">
        {todos().flatMap(t => {
          if (t.tags.length > maxTags) return []
          const prefix = t.done ? '[done] ' : ''
          return t.tags.map(tag => (
            <li key={`${t.id}:${tag}`} data-tag={tag}>
              {prefix}{t.title} — {tag} ({owner})
            </li>
          ))
        })}
      </ul>
    </div>
  )
}
