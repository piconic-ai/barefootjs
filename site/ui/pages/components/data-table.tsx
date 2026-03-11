/**
 * Data Table Reference Page (/components/data-table)
 *
 * Focused developer reference with usage example.
 * Part of the #515 page redesign initiative.
 */

import { DataTablePreviewDemo, DataTableUsageDemo, DataTableFilteringDemo, DataTableSelectionDemo } from '@/components/data-table-demo'
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
  { id: 'examples', title: 'Examples' },
  { id: 'filtering', title: 'Filtering', branch: 'start' },
  { id: 'selection', title: 'Row Selection', branch: 'end' },
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
  { id: "PAY001", amount: 316, status: "success", email: "ken99@example.com" },
  { id: "PAY002", amount: 242, status: "success", email: "abe45@example.com" },
  { id: "PAY003", amount: 837, status: "processing", email: "monserrat44@example.com" },
  { id: "PAY004", amount: 874, status: "success", email: "silas22@example.com" },
  { id: "PAY005", amount: 721, status: "failed", email: "carmella@example.com" },
]

function DataTableDemo() {
  const [sortKey, setSortKey] = createSignal<"amount" | null>(null)
  const [sortDir, setSortDir] = createSignal<"asc" | "desc">("asc")
  const [page, setPage] = createSignal(0)
  const pageSize = 3

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

  const pageCount = createMemo(() =>
    Math.max(1, Math.ceil(sorted().length / pageSize))
  )

  const paginated = createMemo(() =>
    sorted().slice(page() * pageSize, (page() + 1) * pageSize)
  )

  return (
    <div className="space-y-4">
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
          {paginated().map((p) => (
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
        canPrev={page() > 0}
        canNext={page() < pageCount() - 1}
        onPrev={() => setPage(p => p - 1)}
        onNext={() => setPage(p => p + 1)}
      >
        Page \${page() + 1} of \${pageCount()}
      </DataTablePagination>
    </div>
  )
}`

const filteringCode = `"use client"

import { createSignal, createMemo } from "@barefootjs/dom"
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from "@/components/ui/table"
import { DataTablePagination } from "@/components/ui/data-table"

const data = [
  { id: "PAY001", amount: 316, status: "success", email: "ken99@example.com" },
  { id: "PAY002", amount: 242, status: "success", email: "abe45@example.com" },
  { id: "PAY003", amount: 837, status: "processing", email: "monserrat44@example.com" },
  { id: "PAY004", amount: 874, status: "success", email: "silas22@example.com" },
  { id: "PAY005", amount: 721, status: "failed", email: "carmella@example.com" },
  // ... more rows
]

function DataTableFiltering() {
  const [filter, setFilter] = createSignal("")
  const [page, setPage] = createSignal(0)
  const pageSize = 5

  const filteredData = createMemo(() =>
    data.filter(row =>
      row.email.toLowerCase().includes(filter().toLowerCase())
    )
  )

  const pageCount = createMemo(() =>
    Math.max(1, Math.ceil(filteredData().length / pageSize))
  )
  const paginatedData = createMemo(() =>
    filteredData().slice(page() * pageSize, (page() + 1) * pageSize)
  )

  return (
    <div className="space-y-4">
      <input
        type="text"
        placeholder="Filter emails..."
        className="flex h-9 w-full max-w-sm rounded-md border border-input bg-transparent px-3 py-1 text-base"
        value={filter()}
        onInput={(e) => { setFilter(e.target.value); setPage(0) }}
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Email</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginatedData().map((p) => (
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
        canPrev={page() > 0}
        canNext={page() < pageCount() - 1}
        onPrev={() => setPage(p => p - 1)}
        onNext={() => setPage(p => p + 1)}
      >
        Page \${page() + 1} of \${pageCount()}
      </DataTablePagination>
    </div>
  )
}`

const selectionCode = `"use client"

import { createSignal, createMemo } from "@barefootjs/dom"
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"

const data = [
  { id: "PAY001", amount: 316, status: "success", email: "ken99@example.com" },
  { id: "PAY002", amount: 242, status: "success", email: "abe45@example.com" },
  { id: "PAY003", amount: 837, status: "processing", email: "monserrat44@example.com" },
  { id: "PAY004", amount: 874, status: "success", email: "silas22@example.com" },
  { id: "PAY005", amount: 721, status: "failed", email: "carmella@example.com" },
]

function DataTableSelection() {
  const [selected, setSelected] = createSignal(data.map(() => false))
  const selectedCount = createMemo(() => selected().filter(Boolean).length)
  const isAllSelected = createMemo(() => selectedCount() === data.length)

  const toggleAll = () => {
    setSelected(isAllSelected() ? data.map(() => false) : data.map(() => true))
  }

  const toggleRow = (index) => {
    setSelected(prev => prev.map((v, i) => i === index ? !v : v))
  }

  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <Checkbox
                checked={isAllSelected()}
                onCheckedChange={toggleAll}
                aria-label="Select all"
              />
            </TableHead>
            <TableHead>ID</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Email</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, i) => (
            <TableRow data-state={selected()[i] ? "selected" : undefined}>
              <TableCell>
                <Checkbox
                  checked={selected()[i]}
                  onCheckedChange={() => toggleRow(i)}
                />
              </TableCell>
              <TableCell>{row.id}</TableCell>
              <TableCell>{row.status}</TableCell>
              <TableCell>{row.email}</TableCell>
              <TableCell className="text-right">
                \${row.amount.toFixed(2)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="text-sm text-muted-foreground">
        {selectedCount()} of {data.length} row(s) selected.
      </div>
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
    name: 'children',
    type: 'Child',
    description: 'Page info label (e.g. "Page 1 of 3").',
  },
  {
    name: 'canPrev',
    type: 'boolean',
    description: 'Whether previous page is available.',
  },
  {
    name: 'canNext',
    type: 'boolean',
    description: 'Whether next page is available.',
  },
  {
    name: 'onPrev',
    type: '() => void',
    description: 'Callback for previous page.',
  },
  {
    name: 'onNext',
    type: '() => void',
    description: 'Callback for next page.',
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
            <DataTableUsageDemo />
          </Example>
        </Section>

        {/* Examples */}
        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <div id="filtering">
              <Example title="Filtering" code={filteringCode}>
                <DataTableFilteringDemo />
              </Example>
            </div>

            <div id="selection">
              <Example title="Row Selection" code={selectionCode}>
                <DataTableSelectionDemo />
              </Example>
            </div>
          </div>
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
