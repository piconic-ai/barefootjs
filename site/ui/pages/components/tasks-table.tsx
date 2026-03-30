/**
 * Tasks Table Reference Page (/components/tasks-table)
 *
 * Block-level composition pattern: data table with sort + filter + pagination
 * as a 3-stage memo chain, row selection with select-all, and bulk actions.
 */

import { TasksTableDemo } from '@/components/tasks-table-demo'
import {
  DocPage,
  PageHeader,
  Section,
  Example,
  type TocItem,
} from '../../components/shared/docs'
import { getNavLinks } from '../../components/shared/PageNavigation'

const tocItems: TocItem[] = [
  { id: 'preview', title: 'Preview' },
  { id: 'features', title: 'Features' },
]

const previewCode = `"use client"

import { createSignal, createMemo } from '@barefootjs/dom'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DataTableColumnHeader, DataTablePagination } from '@/components/ui/data-table'

const PAGE_SIZE = 5

function TasksTable() {
  const [tasks] = createSignal([...])
  const [filterText, setFilterText] = createSignal('')
  const [sortKey, setSortKey] = createSignal(null)
  const [page, setPage] = createSignal(0)

  // 3-stage memo chain
  const filtered = createMemo(() => tasks().filter(...))
  const sorted = createMemo(() => [...filtered()].sort(...))
  const paginated = createMemo(() => sorted().slice(page() * PAGE_SIZE, ...))

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>
            <DataTableColumnHeader title="Title" sorted={...} onSort={...} />
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {paginated().map(task => (
          <TableRow key={task.id}>...</TableRow>
        ))}
      </TableBody>
    </Table>
  )
}`

export function TasksTableRefPage() {
  return (
    <DocPage slug="tasks-table" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Tasks Table"
          description="A data table with sortable columns, text and status filters, pagination, row selection, and bulk actions."
          {...getNavLinks('tasks-table')}
        />

        <Section id="preview" title="Preview">
          <Example title="" code={previewCode}>
            <TasksTableDemo />
          </Example>
        </Section>

        <Section id="features" title="Features">
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-medium text-foreground mb-2">3-Stage createMemo Chain</h3>
              <p className="text-sm text-muted-foreground">
                filtered → sorted → paginated: three derived signals from the same source.
                Each stage depends on the previous, and all react to changes in the tasks
                signal, filter text, sort key, and page number.
              </p>
            </div>
            <div>
              <h3 className="text-base font-medium text-foreground mb-2">Select All from Paginated Subset</h3>
              <p className="text-sm text-muted-foreground">
                The select-all checkbox derives its state from the paginated page, not the
                full dataset. This tests derived state from a multi-stage memo chain output.
              </p>
            </div>
            <div>
              <h3 className="text-base font-medium text-foreground mb-2">Bulk Operations</h3>
              <p className="text-sm text-muted-foreground">
                Mark done and delete operations modify the tasks signal array for multiple
                items at once, triggering the full memo chain to recompute.
              </p>
            </div>
            <div>
              <h3 className="text-base font-medium text-foreground mb-2">Conditional Badge Variant in Loop</h3>
              <p className="text-sm text-muted-foreground">
                Each row renders a Badge with a variant determined by the task's status via
                a module-level constant lookup. Tests loop rendering with dynamic props.
              </p>
            </div>
          </div>
        </Section>
      </div>
    </DocPage>
  )
}
