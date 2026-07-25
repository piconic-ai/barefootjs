/**
 * Shared data model for the SSR ↔ hydration audit.
 *
 * Each "state" is the plain-data equivalent of what the client signal
 * state should be after a scripted operation. SSR-rendering a state
 * fresh and diffing it against the hydrated DOM after the equivalent
 * interaction is the core comparison of the audit.
 */
import type { Todo } from '../TaggedTodoTable'

export const initialTodos: Todo[] = [
  { id: 1, title: 'Write <b>docs</b>', priority: 3, done: false, tags: ['docs & guides', 'q:"quoted"'] },
  { id: 2, title: 'Fix "escaping" & <i>markup</i>', priority: 1, done: true, tags: ['a<b', 'c&d'] },
  // 3 tags > maxTags(2) — the flatMap block body's early return drops this row's tags.
  { id: 3, title: "Ship it's fast", priority: 2, done: false, tags: ['<script>', 'x "y" z', 'three'] },
]

/** The exact row `addRow` constructs on first click (nextId starts at 100). */
export const addedRow: Todo = {
  id: 100,
  title: 'New <b>row</b> & "100"',
  priority: (100 % 5) + 1,
  done: false,
  tags: ['fresh & new', 'id "100"'],
}

export const baseProps = {
  heading: 'Team <b>TODO</b> & "board"',
  owner: 'kobaken & "friends"',
  maxTags: 2,
  initialHideDone: false,
  initialSort: 'none',
}

export interface Scenario {
  id: string
  /** Signal-state-equivalent data for a fresh SSR render. */
  todos: Todo[]
  props: typeof baseProps
  /** Operations the browser side performs to reach this state after hydrating `initial`. */
  actions: Array<{ click: string }>
}

export const scenarios: Scenario[] = [
  {
    id: 'initial',
    todos: initialTodos,
    props: baseProps,
    actions: [],
  },
  {
    id: 'after-add',
    todos: [...initialTodos, addedRow],
    props: baseProps,
    actions: [{ click: '#add' }],
  },
  {
    id: 'after-delete',
    todos: initialTodos.filter(t => t.id !== 2),
    props: baseProps,
    // Rows render in data order under sort:none — row id=2 is the 2nd row.
    actions: [{ click: '#todo-table tr:nth-child(2) button.del' }],
  },
  {
    id: 'after-move-up',
    todos: [initialTodos[1], initialTodos[0], initialTodos[2]],
    props: baseProps,
    actions: [{ click: '#todo-table tr:nth-child(2) button.up' }],
  },
  {
    id: 'after-toggle-done',
    todos: initialTodos.map(t => (t.id === 1 ? { ...t, done: !t.done } : t)),
    props: baseProps,
    actions: [{ click: '#todo-table tr:nth-child(1) button.toggle' }],
  },
  {
    id: 'hide-done',
    todos: initialTodos,
    props: { ...baseProps, initialHideDone: true },
    actions: [{ click: '#toggle-hide-done' }],
  },
  {
    id: 'sort-asc',
    todos: initialTodos,
    props: { ...baseProps, initialSort: 'asc' },
    actions: [{ click: '#cycle-sort' }],
  },
  {
    id: 'sort-desc',
    todos: initialTodos,
    props: { ...baseProps, initialSort: 'desc' },
    actions: [{ click: '#cycle-sort' }, { click: '#cycle-sort' }],
  },
]
