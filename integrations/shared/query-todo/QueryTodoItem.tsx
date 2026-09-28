'use client'

// One row of QueryTodoApp. The row owns the writes that target it: each is a
// createMutation whose request function reads this row's `props.todo.id`,
// so calling the action needs no id argument. On success every mutation
// invalidates `api/todos`, and the list query in QueryTodoApp re-fetches.

import { createMutation, createSignal, http } from '@barefootjs/client'

type Todo = { id: number; text: string; done: boolean }

type Props = { todo: Todo }

const invalidates = ['api/todos']

function QueryTodoItem(props: Props) {
  const [editing, setEditing] = createSignal(false)
  const [draft, setDraft] = createSignal('')

  // A mutation evaluates its request function when the action is called, so
  // each one reads the row's current values at that moment.
  const [, toggle] = createMutation(
    () => http.put<Todo>(`api/todos/${props.todo.id}`, { done: !props.todo.done }),
    { invalidates },
  )
  const [, rename] = createMutation(
    () => http.put<Todo>(`api/todos/${props.todo.id}`, { text: draft().trim() }),
    { invalidates },
  )
  const [, remove] = createMutation(
    () => http.delete(`api/todos/${props.todo.id}`),
    { invalidates },
  )

  const startEdit = () => {
    setDraft(props.todo.text)
    setEditing(true)
  }

  const finishEdit = () => {
    if (!editing()) return
    setEditing(false)
    if (!draft().trim()) return
    rename()
  }

  return (
    <li className={props.todo.done ? (editing() ? 'completed editing' : 'completed') : (editing() ? 'editing' : '')}>
      <div className="view">
        <input
          className="toggle"
          type="checkbox"
          checked={props.todo.done}
          disabled={toggle.isPending()}
          onChange={() => toggle()}
        />
        <label onDoubleClick={startEdit}>{props.todo.text}</label>
        <button className="destroy" disabled={remove.isPending()} onClick={() => remove()}></button>
      </div>
      <input
        className="edit"
        value={draft()}
        autofocus
        onInput={(e) => setDraft(e.target.value)}
        onBlur={finishEdit}
        onKeyDown={(e) => e.key === 'Enter' && !e.isComposing && finishEdit()}
      />
    </li>
  )
}

export default QueryTodoItem
