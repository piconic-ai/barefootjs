/**
 * Data Table Documentation Page
 */

import {
  DocPage,
  PageHeader,
  Section,
  Example,
  PropsTable,
  PackageManagerTabs,
  type PropDefinition,
  type TocItem,
} from '../components/shared/docs'
import { getNavLinks } from '../components/shared/PageNavigation'
import { DataTablePreviewDemo, DataTableFilteringDemo, DataTableSelectionDemo } from '@/components/data-table-demo'

const tocItems: TocItem[] = [
  { id: 'installation', title: 'Installation' },
  { id: 'examples', title: 'Examples' },
  { id: 'sorting', title: 'Sorting', branch: 'start' },
  { id: 'filtering', title: 'Filtering', branch: 'child' },
  { id: 'selection', title: 'Row Selection', branch: 'end' },
  { id: 'api-reference', title: 'API Reference' },
]

const previewCode = `"use client"

import { createSignal, createMemo } from "@barefootjs/dom"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { DataTableColumnHeader } from "@/components/ui/data-table"

const payments = [
  { id: 'PAY001', amount: 316, status: 'success', email: 'ken99@example.com' },
  { id: 'PAY002', amount: 242, status: 'success', email: 'abe45@example.com' },
  { id: 'PAY003', amount: 837, status: 'processing', email: 'monserrat44@example.com' },
  { id: 'PAY004', amount: 874, status: 'success', email: 'silas22@example.com' },
  { id: 'PAY005', amount: 721, status: 'failed', email: 'carmella@example.com' },
]

function DataTableDemo() {
  const [sortKey, setSortKey] = createSignal(null)
  const [sortDir, setSortDir] = createSignal('asc')

  const handleSort = (key) => {
    if (sortKey() === key) {
      sortDir() === 'asc' ? setSortDir('desc') : setSortKey(null)
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sortedData = createMemo(() => {
    const key = sortKey()
    if (!key) return payments
    const dir = sortDir()
    return [...payments].sort((a, b) =>
      dir === 'asc' ? a[key] - b[key] : b[key] - a[key]
    )
  })

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>ID</TableHead>
          <TableHead>
            <DataTableColumnHeader title="Status" sorted={sortKey() === 'status' ? sortDir() : false} onSort={() => handleSort('status')} />
          </TableHead>
          <TableHead>Email</TableHead>
          <TableHead className="text-right">
            <DataTableColumnHeader title="Amount" sorted={sortKey() === 'amount' ? sortDir() : false} onSort={() => handleSort('amount')} />
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedData().map((p) => (
          <TableRow>
            <TableCell className="font-medium">{p.id}</TableCell>
            <TableCell>{p.status}</TableCell>
            <TableCell>{p.email}</TableCell>
            <TableCell className="text-right">\${p.amount.toFixed(2)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}`

const filteringCode = `"use client"

import { createSignal, createMemo } from "@barefootjs/dom"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { DataTablePagination } from "@/components/ui/data-table"

function DataTableFiltering() {
  const [filter, setFilter] = createSignal('')
  const [page, setPage] = createSignal(0)
  const pageSize = 5

  const filteredData = createMemo(() =>
    data.filter(row => row.email.toLowerCase().includes(filter().toLowerCase()))
  )

  const pageCount = createMemo(() => Math.max(1, Math.ceil(filteredData().length / pageSize)))
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
        {/* ... table rows ... */}
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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"

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
              <Checkbox checked={isAllSelected()} onCheckedChange={toggleAll} aria-label="Select all" />
            </TableHead>
            {/* ... other headers ... */}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, i) => (
            <TableRow data-state={selected()[i] ? 'selected' : undefined}>
              <TableCell>
                <Checkbox checked={selected()[i]} onCheckedChange={() => toggleRow(i)} />
              </TableCell>
              {/* ... other cells ... */}
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
    defaultValue: '-',
    description: 'Column title to display.',
  },
  {
    name: 'sorted',
    type: "'asc' | 'desc' | false",
    defaultValue: 'false',
    description: 'Current sort direction.',
  },
  {
    name: 'onSort',
    type: '() => void',
    defaultValue: '-',
    description: 'Callback when column header is clicked.',
  },
]

const paginationProps: PropDefinition[] = [
  {
    name: 'children',
    type: 'Child',
    defaultValue: '-',
    description: 'Page info label (e.g. "Page 1 of 3").',
  },
  {
    name: 'canPrev',
    type: 'boolean',
    defaultValue: '-',
    description: 'Whether previous page is available.',
  },
  {
    name: 'canNext',
    type: 'boolean',
    defaultValue: '-',
    description: 'Whether next page is available.',
  },
  {
    name: 'onPrev',
    type: '() => void',
    defaultValue: '-',
    description: 'Callback for previous page.',
  },
  {
    name: 'onNext',
    type: '() => void',
    defaultValue: '-',
    description: 'Callback for next page.',
  },
]

export function DataTablePage() {
  return (
    <DocPage slug="data-table" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Data Table"
          description="Powerful table with sorting, filtering, and pagination."
          {...getNavLinks('data-table')}
        />

        {/* Preview */}
        <Example title="" code={previewCode}>
          <DataTablePreviewDemo />
        </Example>

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="barefoot add data-table" />
        </Section>

        {/* Examples */}
        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="Sorting" code={previewCode}>
              <DataTablePreviewDemo />
            </Example>

            <Example title="Filtering" code={filteringCode}>
              <DataTableFilteringDemo />
            </Example>

            <Example title="Row Selection" code={selectionCode}>
              <DataTableSelectionDemo />
            </Example>
          </div>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <h3 className="text-lg font-semibold mb-4">DataTableColumnHeader</h3>
          <PropsTable props={columnHeaderProps} />

          <h3 className="text-lg font-semibold mb-4 mt-8">DataTablePagination</h3>
          <PropsTable props={paginationProps} />
        </Section>
      </div>
    </DocPage>
  )
}
