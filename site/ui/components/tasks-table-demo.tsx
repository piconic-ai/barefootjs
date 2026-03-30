"use client"
/**
 * TasksTableDemo Component
 *
 * Data table block with sort + filter + pagination as a 3-stage memo chain,
 * row selection with select-all checkbox, and row actions.
 * Compiler stress: chained reactive computations on the same data source,
 * derived select-all state from filtered+paginated subset, bulk operations.
 */

import { createSignal, createMemo } from '@barefootjs/dom'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@ui/components/ui/table'
import { DataTableColumnHeader, DataTablePagination } from '@ui/components/ui/data-table'
import { Badge } from '@ui/components/ui/badge'
import { Button } from '@ui/components/ui/button'
import { Checkbox } from '@ui/components/ui/checkbox'
import { Input } from '@ui/components/ui/input'
import {
  ToastProvider,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
} from '@ui/components/ui/toast'

type Task = {
  id: string
  title: string
  status: 'todo' | 'in-progress' | 'done' | 'cancelled'
  priority: 'low' | 'medium' | 'high'
  label: string
}

const statusVariant: Record<string, string> = {
  'todo': 'outline',
  'in-progress': 'default',
  'done': 'secondary',
  'cancelled': 'destructive',
}

const priorityLabel: Record<string, string> = {
  low: '↓ Low',
  medium: '→ Medium',
  high: '↑ High',
}

const PAGE_SIZE = 5

const initialTasks: Task[] = [
  { id: 'TASK-001', title: 'Design new landing page', status: 'in-progress', priority: 'high', label: 'Feature' },
  { id: 'TASK-002', title: 'Fix login redirect bug', status: 'done', priority: 'high', label: 'Bug' },
  { id: 'TASK-003', title: 'Update API documentation', status: 'todo', priority: 'medium', label: 'Documentation' },
  { id: 'TASK-004', title: 'Refactor auth middleware', status: 'in-progress', priority: 'medium', label: 'Feature' },
  { id: 'TASK-005', title: 'Add unit tests for parser', status: 'todo', priority: 'low', label: 'Feature' },
  { id: 'TASK-006', title: 'Migrate to new database', status: 'todo', priority: 'high', label: 'Feature' },
  { id: 'TASK-007', title: 'Fix memory leak in worker', status: 'cancelled', priority: 'medium', label: 'Bug' },
  { id: 'TASK-008', title: 'Set up CI pipeline', status: 'done', priority: 'medium', label: 'Feature' },
  { id: 'TASK-009', title: 'Write onboarding guide', status: 'in-progress', priority: 'low', label: 'Documentation' },
  { id: 'TASK-010', title: 'Optimize image loading', status: 'todo', priority: 'medium', label: 'Feature' },
  { id: 'TASK-011', title: 'Fix typo in README', status: 'done', priority: 'low', label: 'Documentation' },
  { id: 'TASK-012', title: 'Add dark mode support', status: 'todo', priority: 'high', label: 'Feature' },
]

type SortKey = 'title' | 'status' | 'priority' | null
type SortDir = 'asc' | 'desc'

/**
 * Tasks data table — 3-stage memo chain stress test
 *
 * Compiler stress points:
 * - 3-stage memo chain: filtered → sorted → paginated (same source signal)
 * - Select all checkbox: derived from paginated subset, toggles filtered set
 * - Row selection: per-row state via Set signal, derived counts
 * - Bulk actions: modify multiple items in signal array
 * - Conditional Badge variant: status → variant lookup in loop
 */
export function TasksTableDemo() {
  const [tasks, setTasks] = createSignal<Task[]>(initialTasks)
  const [filterText, setFilterText] = createSignal('')
  const [statusFilter, setStatusFilter] = createSignal<string>('all')
  const [sortKey, setSortKey] = createSignal<SortKey>(null)
  const [sortDir, setSortDir] = createSignal<SortDir>('asc')
  const [page, setPage] = createSignal(0)
  const [selected, setSelected] = createSignal<Set<string>>(new Set())
  const [toastOpen, setToastOpen] = createSignal(false)
  const [toastMessage, setToastMessage] = createSignal('')

  // === 3-stage memo chain ===

  // Stage 1: filter
  const filtered = createMemo(() => {
    const text = filterText().toLowerCase()
    const status = statusFilter()
    return tasks().filter(t => {
      if (status !== 'all' && t.status !== status) return false
      if (text && !t.title.toLowerCase().includes(text) && !t.id.toLowerCase().includes(text)) return false
      return true
    })
  })

  // Stage 2: sort
  const sorted = createMemo(() => {
    const key = sortKey()
    if (!key) return filtered()
    const dir = sortDir()
    return [...filtered()].sort((a, b) => {
      const av = a[key]
      const bv = b[key]
      const cmp = av < bv ? -1 : av > bv ? 1 : 0
      return dir === 'asc' ? cmp : -cmp
    })
  })

  // Stage 3: paginate
  const paginated = createMemo(() => {
    const start = page() * PAGE_SIZE
    return sorted().slice(start, start + PAGE_SIZE)
  })

  // Derived: total pages
  const totalPages = createMemo(() => Math.max(1, Math.ceil(sorted().length / PAGE_SIZE)))

  // Derived: selected count
  const selectedCount = createMemo(() => selected().size)

  // Derived: select all state for current page
  const isAllPageSelected = createMemo(() => {
    const pageItems = paginated()
    if (pageItems.length === 0) return false
    return pageItems.every(t => selected().has(t.id))
  })

  const showToast = (message: string) => {
    setToastMessage(message)
    setToastOpen(true)
    setTimeout(() => setToastOpen(false), 2000)
  }

  const handleSort = (key: SortKey) => {
    if (sortKey() === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
    setPage(0)
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    const pageIds = paginated().map(t => t.id)
    if (isAllPageSelected()) {
      setSelected(prev => {
        const next = new Set(prev)
        for (const id of pageIds) next.delete(id)
        return next
      })
    } else {
      setSelected(prev => {
        const next = new Set(prev)
        for (const id of pageIds) next.add(id)
        return next
      })
    }
  }

  const deleteSelected = () => {
    const ids = selected()
    setTasks(prev => prev.filter(t => !ids.has(t.id)))
    setSelected(new Set())
    setPage(0)
    showToast(`${ids.size} task(s) deleted`)
  }

  const markSelectedDone = () => {
    const ids = selected()
    setTasks(prev => prev.map(t => ids.has(t.id) ? { ...t, status: 'done' as const } : t))
    setSelected(new Set())
    showToast(`${ids.size} task(s) marked done`)
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Tasks</h2>
        <span className="text-sm text-muted-foreground">{tasks().length} total</span>
      </div>

      <div className="tasks-table rounded-xl border border-border bg-card overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-3 p-4">
          <Input
            placeholder="Filter tasks..."
            value={filterText()}
            onInput={(e) => { setFilterText(e.target.value); setPage(0) }}
            className="max-w-xs h-8 text-sm"
          />
          <select
            className="status-filter h-8 rounded-md border border-border bg-background px-2 text-sm"
            value={statusFilter()}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(0) }}
          >
            <option value="all">All statuses</option>
            <option value="todo">Todo</option>
            <option value="in-progress">In Progress</option>
            <option value="done">Done</option>
            <option value="cancelled">Cancelled</option>
          </select>
          {selectedCount() > 0 ? (
            <div className="flex items-center gap-2 ml-auto">
              <span className="selected-count text-sm text-muted-foreground">{selectedCount()} selected</span>
              <Button variant="outline" size="sm" onClick={markSelectedDone}>Mark done</Button>
              <Button variant="destructive" size="sm" onClick={deleteSelected}>Delete</Button>
            </div>
          ) : null}
        </div>

        {/* Table */}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px] pl-4">
                <Checkbox
                  checked={isAllPageSelected()}
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead className="w-[100px]">Task</TableHead>
              <TableHead>
                <DataTableColumnHeader
                  title="Title"
                  sorted={sortKey() === 'title' ? sortDir() : false}
                  onSort={() => handleSort('title')}
                />
              </TableHead>
              <TableHead>
                <DataTableColumnHeader
                  title="Status"
                  sorted={sortKey() === 'status' ? sortDir() : false}
                  onSort={() => handleSort('status')}
                />
              </TableHead>
              <TableHead>
                <DataTableColumnHeader
                  title="Priority"
                  sorted={sortKey() === 'priority' ? sortDir() : false}
                  onSort={() => handleSort('priority')}
                />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated().map(task => (
              <TableRow key={task.id} className={`task-row ${selected().has(task.id) ? 'bg-muted/50' : ''}`}>
                <TableCell className="pl-4">
                  <Checkbox
                    checked={selected().has(task.id)}
                    onCheckedChange={() => toggleSelect(task.id)}
                  />
                </TableCell>
                <TableCell className="task-id font-mono text-xs text-muted-foreground">{task.id}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="task-label text-xs">{task.label}</Badge>
                    <span className="task-title font-medium">{task.title}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant[task.status] as 'default' | 'secondary' | 'destructive' | 'outline'} className="task-status">{task.status}</Badge>
                </TableCell>
                <TableCell className="task-priority text-sm">{priorityLabel[task.priority]}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* Pagination */}
        <div className="p-4">
          <DataTablePagination
            canPrev={page() > 0}
            canNext={page() < totalPages() - 1}
            onPrev={() => setPage(p => p - 1)}
            onNext={() => setPage(p => p + 1)}
          >
            <span className="text-sm text-muted-foreground">
              {selectedCount() > 0 ? `${selectedCount()} of ${sorted().length} selected · ` : ''}
              Page {page() + 1} of {totalPages()}
            </span>
          </DataTablePagination>
        </div>
      </div>

      <ToastProvider position="bottom-right">
        <Toast variant="success" open={toastOpen()}>
          <div className="flex-1">
            <ToastTitle>Tasks</ToastTitle>
            <ToastDescription className="toast-message">{toastMessage()}</ToastDescription>
          </div>
          <ToastClose onClick={() => setToastOpen(false)} />
        </Toast>
      </ToastProvider>
    </div>
  )
}
