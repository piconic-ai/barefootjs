'use client'
import { createSignal, createMemo } from '@barefootjs/client'

type Todo = { id: number; text: string; done: boolean }

export function Todos() {
  const [todos, setTodos] = createSignal<Todo[]>([
    { id: 1, text: 'Pick an adapter', done: true },
    { id: 2, text: 'Write a component', done: false },
    { id: 3, text: 'Run the IR tests', done: false },
  ])
  const [draft, setDraft] = createSignal('')
  const remaining = createMemo(() => todos().filter(t => !t.done).length)

  const add = () => {
    const text = draft().trim()
    if (!text) return
    setTodos([...todos(), { id: Date.now(), text, done: false }])
    setDraft('')
  }
  const toggle = (id: number) => setTodos(todos().map(t => (t.id === id ? { ...t, done: !t.done } : t)))
  const remove = (id: number) => setTodos(todos().filter(t => t.id !== id))

  return (
    <div className="todos">
      <form className="todos-form" onSubmit={(e) => { e.preventDefault(); add() }}>
        <input className="todos-input" placeholder="Add a task" value={draft()} onInput={(e) => setDraft(e.target.value)} />
        <button className="todos-add" type="submit">Add</button>
      </form>
      <ul className="todos-list">
        {todos().map(todo => (
          <li key={todo.id} className={todo.done ? 'todo done' : 'todo'}>
            <label className="todo-label">
              <input type="checkbox" checked={todo.done} onChange={() => toggle(todo.id)} />
              <span className="todo-text">{todo.text}</span>
            </label>
            <button className="todo-remove" type="button" onClick={() => remove(todo.id)}>×</button>
          </li>
        ))}
      </ul>
      <p className="todos-count">{remaining()} left</p>
    </div>
  )
}
