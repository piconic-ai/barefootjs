/**
 * Data Table Reference Page (/components/data-table)
 *
 * Focused developer reference with usage example.
 * Part of the #515 page redesign initiative.
 */

import { DataTablePreviewDemo } from '@/components/data-table-demo'
import {
  DocPage,
  PageHeader,
  Section,
  Example,
  PropsTable,
  PackageManagerTabs,
  type PropDefinition,
  type TocItem,
} from '../../components/shared/docs'
import { getNavLinks } from '../../components/shared/PageNavigation'

const tocItems: TocItem[] = [
  { id: 'preview', title: 'Preview' },
  { id: 'installation', title: 'Installation' },
  { id: 'usage', title: 'Usage' },
  { id: 'api-reference', title: 'API Reference' },
]

const usageCode = `"use client"

import { createSignal, createMemo } from "@barefootjs/dom"
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from "@/components/ui/table"
import {
  DataTableColumnHeader, DataTablePagination,
} from "@/components/ui/data-table"

type Payment = {
  id: string
  amount: number
  status: string
  email: string
}

const payments: Payment[] = [
  { id: "PAY001", amount: 316, status: "success", email: "ken@example.com" },
  { id: "PAY002", amount: 242, status: "success", email: "abe@example.com" },
  { id: "PAY003", amount: 837, status: "processing", email: "mon@example.com" },
]

function DataTableDemo() {
  const [sortKey, setSortKey] = createSignal<"amount" | null>(null)
  const [sortDir, setSortDir] = createSignal<"asc" | "desc">("asc")
  const [page, setPage] = createSignal(0)

  const handleSort = () => {
    if (sortKey() === null) {
      setSortKey("amount")
      setSortDir("asc")
    } else {
      setSortDir(sortDir() === "asc" ? "desc" : "asc")
    }
  }

  const sorted = createMemo(() => {
    if (!sortKey()) return payments
    const dir = sortDir()
    return [...payments].sort((a, b) =>
      dir === "asc" ? a.amount - b.amount : b.amount - a.amount
    )
  })

  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Email</TableHead>
            <TableHead className="text-right">
              <DataTableColumnHeader
                title="Amount"
                sorted={sortKey() ? sortDir() : false}
                onSort={handleSort}
              />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted().map((p) => (
            <TableRow>
              <TableCell>{p.id}</TableCell>
              <TableCell>{p.status}</TableCell>
              <TableCell>{p.email}</TableCell>
              <TableCell className="text-right">
                \${p.amount.toFixed(2)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <DataTablePagination
        page={page()}
        pageCount={1}
        onPageChange={setPage}
      />
    </div>
  )
}`

const columnHeaderProps: PropDefinition[] = [
  {
    name: 'title',
    type: 'string',
    description: 'Column title text.',
  },
  {
    name: 'sorted',
    type: "'asc' | 'desc' | false",
    defaultValue: 'false',
    description: 'Current sort direction, or false if unsorted.',
  },
  {
    name: 'onSort',
    type: '() => void',
    description: 'Callback when the sort header is clicked.',
  },
]

const paginationProps: PropDefinition[] = [
  {
    name: 'page',
    type: 'number',
    description: 'Current page index (0-based).',
  },
  {
    name: 'pageCount',
    type: 'number',
    description: 'Total number of pages.',
  },
  {
    name: 'onPageChange',
    type: '(page: number) => void',
    description: 'Callback when the page changes.',
  },
  {
    name: 'selectedCount',
    type: 'number',
    description: 'Number of selected rows (optional, for display).',
  },
  {
    name: 'totalCount',
    type: 'number',
    description: 'Total number of rows (optional, for display).',
  },
]

export function DataTableRefPage() {
  return (
    <DocPage slug="data-table" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Data Table"
          description="Sortable column headers and pagination controls for data tables."
          {...getNavLinks('data-table')}
        />

        {/* Preview */}
        <DataTablePreviewDemo />

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="barefoot add data-table" />
        </Section>

        {/* Usage */}
        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <DataTablePreviewDemo />
          </Example>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <div className="space-y-8">
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-4">DataTableColumnHeader</h3>
              <PropsTable props={columnHeaderProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-4">DataTablePagination</h3>
              <PropsTable props={paginationProps} />
            </div>
          </div>
        </Section>
      </div>
    </DocPage>
  )
}
