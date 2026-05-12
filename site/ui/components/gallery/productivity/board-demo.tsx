"use client"
/**
 * ProductivityBoardDemo
 *
 * Adapted KanbanDemo for /gallery/productivity/board.
 *
 * Compiler stress targets (inherited):
 * - Nested .map(): columns().map(col => ... col.tasks.map(task => ...))
 * - Dynamic nested array mutation (move task between columns)
 * - Conditional rendering inside nested loop (add task form)
 * - Module-level constants in nested loop (priorityVariant)
 * - Derived values per column (task count)
 */

import { createSignal, createMemo } from '@barefootjs/client'
import { Badge, type BadgeVariant } from '@ui/components/ui/badge'
import { Button } from '@ui/components/ui/button'
import { Input } from '@ui/components/ui/input'
import {
  ToastProvider,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
} from '@ui/components/ui/toast'

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

export function ProductivityBoardDemo() {
  const [columns, setColumns] = createSignal<Column[]>(initialColumns)
  const [newTaskTitle, setNewTaskTitle] = createSignal('')
  const [addingToColumn, setAddingToColumn] = createSignal<string | null>(null)
  const [nextId, setNextId] = createSignal(7)
  const [toastOpen, setToastOpen] = createSignal(false)
  const [toastMessage, setToastMessage] = createSignal('')

  const totalTasks = createMemo(() =>
    columns().reduce((sum, col) => sum + col.tasks.length, 0)
  )

  // Drag-preview state — the id of the task currently being held down
  // (pointerdown without a release yet). Drives a single reactive
  // `style` attribute on each task card root so the active card fades
  // via the `--drag-opacity` CSS variable without re-keying or
  // re-mounting. Exercises a single-attribute reactive `style` binding
  // on a `.map()` root, the compiler path adjacent to the outstanding
  // Dashboard Builder reactive-className-on-.map()-root bug.
  const [draggingTaskId, setDraggingTaskId] = createSignal<number | null>(null)
  // Column currently under the dragged card (HTML5 DnD hover target).
  // Drives a per-column reactive `style={{'--drop-active': …}}` binding
  // on the OUTER `.map()` body root, so the column wrapper exercises
  // the same nested-reactive-attr path as the inner task card — but
  // one level up the loop nesting.
  const [dragOverColId, setDragOverColId] = createSignal<string | null>(null)
  const startDragPreview = (taskId: number) => setDraggingTaskId(taskId)
  const endDragPreview = () => {
    setDraggingTaskId(null)
    setDragOverColId(null)
  }

  const showToast = (message: string) => {
    setToastMessage(message)
    setToastOpen(true)
    setTimeout(() => setToastOpen(false), 3000)
  }

  // Move a task to an absolute target column (by id). Same-column drops
  // are a no-op. Used both by drag-and-drop and the ←/→ buttons (the
  // arrows resolve to the neighbour column and delegate here).
  const moveTaskTo = (taskId: number, fromColId: string, toColId: string) => {
    if (fromColId === toColId) return false
    let didMove = false
    setColumns(prev => {
      const fromIdx = prev.findIndex(c => c.id === fromColId)
      const toIdx = prev.findIndex(c => c.id === toColId)
      if (fromIdx === -1 || toIdx === -1) return prev
      const task = prev[fromIdx].tasks.find(t => t.id === taskId)
      if (!task) return prev
      didMove = true
      return prev.map((col, i) => {
        if (i === fromIdx) return { ...col, tasks: col.tasks.filter(t => t.id !== taskId) }
        if (i === toIdx) return { ...col, tasks: [...col.tasks, task] }
        return col
      })
    })
    if (didMove) showToast('Task moved')
    return didMove
  }

  const moveTask = (taskId: number, fromColId: string, direction: 'left' | 'right') => {
    const cols = columns()
    const fromIdx = cols.findIndex(c => c.id === fromColId)
    const toIdx = direction === 'left' ? fromIdx - 1 : fromIdx + 1
    if (toIdx < 0 || toIdx >= cols.length) return
    moveTaskTo(taskId, fromColId, cols[toIdx].id)
  }

  // --- HTML5 drag-and-drop handlers ---
  // The card publishes its task id + source column id via DataTransfer
  // on dragstart; the column reads it back on drop. We also flip the
  // shared drag-preview signal so the dragged card keeps its lifted
  // visual treatment for the duration of the gesture (HTML5 DnD does
  // NOT emit pointerdown/up, so the pointer-based handlers don't fire).
  const handleDragStart = (taskId: number, fromColId: string) => (e: DragEvent) => {
    if (e.dataTransfer) {
      e.dataTransfer.setData('application/task', JSON.stringify({ taskId, fromColId }))
      e.dataTransfer.effectAllowed = 'move'
    }
    startDragPreview(taskId)
  }

  const handleDragEnd = () => {
    endDragPreview()
  }

  const handleColDragOver = (colId: string) => (e: DragEvent) => {
    // preventDefault is required for the element to count as a drop
    // target — without it `drop` never fires.
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    if (dragOverColId() !== colId) setDragOverColId(colId)
  }

  const handleColDragLeave = (colId: string) => (e: DragEvent) => {
    // dragleave fires on every child boundary; only clear when leaving
    // the column root (best-effort: relatedTarget outside this column).
    const rel = e.relatedTarget as Node | null
    const cur = e.currentTarget as Node | null
    if (cur && rel && cur.contains(rel)) return
    if (dragOverColId() === colId) setDragOverColId(null)
  }

  const handleColDrop = (toColId: string) => (e: DragEvent) => {
    e.preventDefault()
    const raw = e.dataTransfer?.getData('application/task')
    setDragOverColId(null)
    setDraggingTaskId(null)
    if (!raw) return
    try {
      const { taskId, fromColId } = JSON.parse(raw) as { taskId: number; fromColId: string }
      moveTaskTo(taskId, fromColId, toColId)
    } catch {
      // Malformed payload — ignore.
    }
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
          <div
            key={col.id}
            className="kanban-column flex-1 min-w-[250px] rounded-lg transition-colors duration-100"
            // Per-column drop-target highlight, published as a CSS
            // variable on the OUTER `.map()` body root. The boolean is
            // also fanned out to concrete `background-color` / `outline`
            // CSS properties so the highlight is visible without any
            // additional class plumbing — and exercises the nested
            // reactive-style path at the OUTER nesting level (cf. the
            // inner task-card `--drag-*` vars one nesting level deeper).
            style={{
              '--drop-active': dragOverColId() === col.id ? '1' : '0',
              backgroundColor: dragOverColId() === col.id
                ? 'var(--color-accent, oklch(0.97 0 0))'
                : 'transparent',
              outline: dragOverColId() === col.id
                ? '2px dashed var(--color-primary, oklch(0.205 0 0))'
                : '2px dashed transparent',
              outlineOffset: '-2px',
            }}
            data-col-id={col.id}
            data-col-drop-active={dragOverColId() === col.id ? 'true' : 'false'}
            onDragOver={handleColDragOver(col.id)}
            onDragLeave={handleColDragLeave(col.id)}
            onDrop={handleColDrop(col.id)}
          >
            <div className="flex items-center justify-between mb-3 px-1 pt-1">
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

            {addingToColumn() === col.id ? (
              <div className="add-task-form flex gap-2 mb-3">
                <Input
                  placeholder="Task title"
                  value={newTaskTitle()}
                  onInput={(e) => setNewTaskTitle(e.target.value)}
                  ref={(el) => requestAnimationFrame(() => el.focus())}
                  className="h-8"
                />
                <Button size="sm" onClick={() => addTask(col.id)}>
                  Add
                </Button>
              </div>
            ) : null}

            <div className="space-y-2">
              {col.tasks.map(task => (
                <div
                  key={task.id}
                  className="task-card rounded-xl border bg-card p-3 space-y-2 shadow-sm transition-all duration-150 cursor-grab active:cursor-grabbing"
                  style={{
                    // Drag-preview visual: card fades, lifts (scale + shadow),
                    // and gains a primary-coloured outline so the user can
                    // tell at a glance which card they're "holding". Each
                    // visual fact is published as a CSS variable so the
                    // single `style` attribute on the inner-loop root carries
                    // them all — exercising the nested-loop reactive style
                    // path on a richer object literal (multiple custom-prop
                    // members + a non-custom property).
                    '--drag-opacity': draggingTaskId() === task.id ? '0.55' : '1',
                    '--drag-scale': draggingTaskId() === task.id ? '1.03' : '1',
                    '--drag-shadow': draggingTaskId() === task.id
                      ? '0 12px 24px -8px rgba(0,0,0,0.25)'
                      : '0 1px 2px 0 rgba(0,0,0,0.05)',
                    '--drag-ring': draggingTaskId() === task.id
                      ? '2px solid var(--color-primary, oklch(0.205 0 0))'
                      : '2px solid transparent',
                    opacity: 'var(--drag-opacity)',
                    transform: 'scale(var(--drag-scale))',
                    boxShadow: 'var(--drag-shadow)',
                    outline: 'var(--drag-ring)',
                    outlineOffset: '2px',
                  }}
                  data-task-id={String(task.id)}
                  data-task-dragging={draggingTaskId() === task.id ? 'true' : 'false'}
                  draggable={true}
                  onPointerDown={() => startDragPreview(task.id)}
                  onPointerUp={endDragPreview}
                  onPointerLeave={endDragPreview}
                  onDragStart={handleDragStart(task.id, col.id)}
                  onDragEnd={handleDragEnd}
                >
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
                    <Badge variant={priorityVariant[task.priority] as BadgeVariant} className="task-priority text-xs">{task.priority}</Badge>
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
