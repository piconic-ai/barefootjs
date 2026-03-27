"use client"
/**
 * KanbanDemo Component
 *
 * Kanban board block with nested .map() loops (columns → tasks).
 * Compiler stress: nested loop rendering, cross-column task movement
 * via immutable nested array updates, conditional inside nested loop,
 * module-level constants in nested loops.
 */

import { createSignal, createMemo } from '@barefootjs/dom'
import { Badge } from '@ui/components/ui/badge'
import { Button } from '@ui/components/ui/button'
import {
  ToastProvider,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
} from '@ui/components/ui/toast'

// Priority → Badge variant mapping (module-level constant in nested .map())
const priorityVariant: Record<string, string> = {
  high: 'destructive',
  medium: 'secondary',
  low: 'outline',
}

type Task = { id: number; title: string; priority: 'high' | 'medium' | 'low' }
type Column = { id: string; title: string; tasks: Task[] }

const initialColumns: Column[] = [
  {
    id: 'todo',
    title: 'To Do',
    tasks: [
      { id: 1, title: 'Design landing page', priority: 'high' },
      { id: 2, title: 'Write unit tests', priority: 'medium' },
      { id: 3, title: 'Update docs', priority: 'low' },
    ],
  },
  {
    id: 'progress',
    title: 'In Progress',
    tasks: [
      { id: 4, title: 'Build API endpoint', priority: 'high' },
      { id: 5, title: 'Code review', priority: 'medium' },
    ],
  },
  {
    id: 'done',
    title: 'Done',
    tasks: [
      { id: 6, title: 'Setup CI pipeline', priority: 'medium' },
    ],
  },
]

/**
 * Kanban board — nested .map() stress test
 *
 * Compiler stress points:
 * - Nested .map(): columns().map(col => ... col.tasks.map(task => ...))
 * - Dynamic nested array mutation (move task between columns)
 * - Conditional rendering inside nested loop (add task form)
 * - Module-level constants in nested loop (priorityVariant)
 * - Derived values per column (task count)
 */
export function KanbanDemo() {
  const [columns, setColumns] = createSignal<Column[]>(initialColumns)
  const [newTaskTitle, setNewTaskTitle] = createSignal('')
  const [addingToColumn, setAddingToColumn] = createSignal<string | null>(null)
  const [nextId, setNextId] = createSignal(7)
  const [toastOpen, setToastOpen] = createSignal(false)
  const [toastMessage, setToastMessage] = createSignal('')

  const totalTasks = createMemo(() =>
    columns().reduce((sum, col) => sum + col.tasks.length, 0)
  )

  const showToast = (message: string) => {
    setToastMessage(message)
    setToastOpen(true)
    setTimeout(() => setToastOpen(false), 3000)
  }

  const moveTask = (taskId: number, fromColId: string, direction: 'left' | 'right') => {
    setColumns(prev => {
      const fromIdx = prev.findIndex(c => c.id === fromColId)
      const toIdx = direction === 'left' ? fromIdx - 1 : fromIdx + 1
      if (toIdx < 0 || toIdx >= prev.length) return prev
      const task = prev[fromIdx].tasks.find(t => t.id === taskId)
      if (!task) return prev
      return prev.map((col, i) => {
        if (i === fromIdx) return { ...col, tasks: col.tasks.filter(t => t.id !== taskId) }
        if (i === toIdx) return { ...col, tasks: [...col.tasks, task] }
        return col
      })
    })
    showToast('Task moved')
  }

  const addTask = (colId: string) => {
    const title = newTaskTitle().trim()
    if (!title) return
    const id = nextId()
    setNextId(id + 1)
    setColumns(prev => prev.map(col => {
      if (col.id !== colId) return col
      return { ...col, tasks: [...col.tasks, { id, title, priority: 'medium' as const }] }
    }))
    setNewTaskTitle('')
    setAddingToColumn(null)
    showToast('Task added')
  }

  const deleteTask = (taskId: number, colId: string) => {
    setColumns(prev => prev.map(col => {
      if (col.id !== colId) return col
      return { ...col, tasks: col.tasks.filter(t => t.id !== taskId) }
    }))
    showToast('Task deleted')
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Task Board</h2>
        <span className="task-total text-sm text-muted-foreground">{totalTasks()} tasks</span>
      </div>

      <div className="kanban-columns flex gap-4 overflow-x-auto pb-4">
        {columns().map(col => (
          <div key={col.id} className="kanban-column flex-1 min-w-[250px]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h3 className="column-title text-sm font-semibold">{col.title}</h3>
                <Badge variant="secondary" className="task-count">{col.tasks.length}</Badge>
              </div>
              <Button
                variant="outline"
                size="icon-sm"
                className="add-task-btn"
                onClick={() => setAddingToColumn(addingToColumn() === col.id ? null : col.id)}
              >
                +
              </Button>
            </div>

            {/* WORKAROUND: Uses native <input> and <button> in the add form instead of
                 Input/Button components. Signal reads (newTaskTitle()) in the loop template
                 cause reconcileElements to replace all items on each keystroke, losing
                 component state. Fix: compiler should emit reactive attrs (value={signal()})
                 as separate createEffect instead of inlining in template string. */}
            {addingToColumn() === col.id ? (
              <div className="add-task-form flex gap-2 mb-3">
                <input
                  placeholder="Task title"
                  value={newTaskTitle()}
                  onInput={(e) => setNewTaskTitle(e.target.value)}
                  className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none"
                />
                <button
                  className="inline-flex items-center justify-center h-8 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium"
                  onClick={() => addTask(col.id)}
                >
                  Add
                </button>
              </div>
            ) : null}

            <div className="space-y-2">
              {col.tasks.map(task => (
                <div key={task.id} className="task-card rounded-xl border border-border bg-card p-3 space-y-2 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <p className="task-title text-sm font-medium">{task.title}</p>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="delete-task text-muted-foreground hover:text-destructive"
                      onClick={() => deleteTask(task.id, col.id)}
                    >
                      ×
                    </Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <Badge variant={priorityVariant[task.priority]} className="task-priority text-xs">{task.priority}</Badge>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="move-left"
                        onClick={() => moveTask(task.id, col.id, 'left')}
                      >
                        ←
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="move-right"
                        onClick={() => moveTask(task.id, col.id, 'right')}
                      >
                        →
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <ToastProvider position="bottom-right">
        <Toast variant="success" open={toastOpen()}>
          <div className="flex-1">
            <ToastTitle>Done</ToastTitle>
            <ToastDescription className="toast-message">{toastMessage()}</ToastDescription>
          </div>
          <ToastClose onClick={() => setToastOpen(false)} />
        </Toast>
      </ToastProvider>
    </div>
  )
}
