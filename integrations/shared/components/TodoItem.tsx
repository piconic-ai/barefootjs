"use client"
/**
 * TodoItem Component
 * Displays and edits individual todo items
 * Follows TodoMVC HTML structure and styling conventions
 */

type Todo = {
  id: number
  text: string
  done: boolean
  editing: boolean
}

type Props = {
  todo: Todo
  onToggle: () => void
  onDelete: () => void
  onStartEdit: () => void
  onFinishEdit: (text: string) => void
}

function TodoItem(props: Props) {
  return (
    <li className={props.todo.done ? (props.todo.editing ? 'completed editing' : 'completed') : (props.todo.editing ? 'editing' : '')}>
      <div className="view">
        <input
          className="toggle"
          type="checkbox"
          checked={props.todo.done}
          onChange={() => props.onToggle()}
        />
        <label onDoubleClick={() => props.onStartEdit()}>
          {props.todo.text}
        </label>
        <button className="destroy" onClick={() => props.onDelete()}></button>
      </div>
      <input
        className="edit"
        value={props.todo.text}
        autofocus
        onBlur={(e) => props.onFinishEdit(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && !e.isComposing && props.onFinishEdit(e.target.value)}
      />
    </li>
  )
}

export default TodoItem
