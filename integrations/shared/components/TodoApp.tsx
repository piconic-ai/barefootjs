"use client"

/**
 * BarefootJS TodoApp with SSR
 *
 * Main component - renders initial todos from server, then uses API for updates
 * Follows TodoMVC HTML structure and styling conventions
 */

import { createSignal, onMount } from '@barefootjs/client'
import TodoItem from './TodoItem'

type Todo = {
  id: number
  text: string
  done: boolean
  editing: boolean
}

type Filter = 'all' | 'active' | 'completed'

type Props = {
  initialTodos?: Array<{ id: number; text: string; done: boolean }>
}

function TodoApp(props: Props) {
  const [todos, setTodos] = createSignal<Todo[]>(
    (props.initialTodos ?? []).map(t => ({ ...t, editing: false }))
  )
  const [newText, setNewText] = createSignal('')
  const [filter, setFilter] = createSignal<Filter>('all')

  // Read filter from URL hash
  const getFilterFromHash = (): Filter => {
    const hash = window.location.hash
    if (hash === '#/active') return 'active'
    if (hash === '#/completed') return 'completed'
    return 'all'
  }

  // Initialize filter from URL hash on mount
  onMount(() => {
    setFilter(getFilterFromHash())
    window.addEventListener('hashchange', () => {
      setFilter(getFilterFromHash())
    })
  })

  const handleAdd = async () => {
    const text = newText().trim()
    if (!text) return

    try {
      const res = await fetch('api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const newTodo = await res.json()
      setTodos([...todos(), { ...newTodo, editing: false }])
      setNewText('')
    } catch (err) {
      console.error('Failed to add todo:', err)
    }
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.isComposing) {
      handleAdd()
    }
  }

  const handleToggle = async (id: number) => {
    const todo = todos().find(t => t.id === id)
    if (!todo) return

    try {
      const res = await fetch(`api/todos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done: !todo.done }),
      })
      const updatedTodo = await res.json()
      setTodos(todos().map(t => t.id === id ? { ...updatedTodo, editing: t.editing } : t))
    } catch (err) {
      console.error('Failed to update todo:', err)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await fetch(`api/todos/${id}`, { method: 'DELETE' })
      setTodos(todos().filter(t => t.id !== id))
    } catch (err) {
      console.error('Failed to delete todo:', err)
    }
  }

  const handleStartEdit = (id: number) => {
    setTodos(todos().map(t => t.id === id ? { ...t, editing: true } : t))
  }

  const handleFinishEdit = async (id: number, text: string) => {
    const trimmedText = text.trim()
    if (!trimmedText) {
      setTodos(todos().map(t => t.id === id ? { ...t, editing: false } : t))
      return
    }

    try {
      const res = await fetch(`api/todos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmedText }),
      })
      const updatedTodo = await res.json()
      setTodos(todos().map(t => t.id === id ? { ...updatedTodo, editing: false } : t))
    } catch (err) {
      console.error('Failed to update todo:', err)
    }
  }

  const handleClearCompleted = async () => {
    const completedTodos = todos().filter(t => t.done)
    for (const todo of completedTodos) {
      try {
        await fetch(`api/todos/${todo.id}`, { method: 'DELETE' })
      } catch (err) {
        console.error('Failed to delete todo:', err)
      }
    }
    setTodos(todos().filter(t => !t.done))
  }

  const handleToggleAll = async () => {
    const allDone = todos().every(t => t.done)
    const newDoneState = !allDone

    for (const todo of todos()) {
      if (todo.done !== newDoneState) {
        try {
          await fetch(`api/todos/${todo.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ done: newDoneState }),
          })
        } catch (err) {
          console.error('Failed to update todo:', err)
        }
      }
    }
    setTodos(todos().map(t => ({ ...t, done: newDoneState })))
  }

  const handleFilterChange = (newFilter: Filter) => {
    setFilter(newFilter)
    const hash = newFilter === 'all' ? '#/' : `#/${newFilter}`
    window.location.hash = hash
  }

  return (
    <section className="todoapp">
      <header className="header">
        <h1>todos</h1>
        <input
          className="new-todo"
          placeholder="What needs to be done?"
          value={newText()}
          onInput={(e) => setNewText((e.target as HTMLInputElement).value)}
          onKeyDown={handleKeyDown}
          autofocus
        />
      </header>
      <section className="main">
        {todos().length > 0 && (
          <>
            <input
              id="toggle-all"
              className="toggle-all"
              type="checkbox"
              checked={/* @client */ todos().every(t => t.done)}
              onChange={handleToggleAll}
            />
            <label for="toggle-all">Mark all as complete</label>
          </>
        )}
        <ul className="todo-list">
          {/* @client */ todos().filter(t => {
            const f = filter()
            if (f === 'active') return !t.done
            if (f === 'completed') return t.done
            return true
          }).map(todo => (
            <TodoItem
              key={todo.id}
              todo={todo}
              onToggle={() => handleToggle(todo.id)}
              onDelete={() => handleDelete(todo.id)}
              onStartEdit={() => handleStartEdit(todo.id)}
              onFinishEdit={(text) => handleFinishEdit(todo.id, text)}
            />
          ))}
        </ul>
      </section>
      <footer className="footer">
        <span className="todo-count">
          <strong>{/* @client */ todos().filter(t => !t.done).length}</strong>{' '}{/* @client */ todos().filter(t => !t.done).length === 1 ? 'item' : 'items'} left
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
        {/* @client */ todos().filter(t => t.done).length > 0 && (
          <button className="clear-completed" onClick={handleClearCompleted}>
            Clear completed
          </button>
        )}
      </footer>
    </section>
  )
}

export default TodoApp
