"use client"

/**
 * Data Table Demo Components
 */

import { createSignal, createMemo } from '@barefootjs/dom'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { DataTableColumnHeader, DataTablePagination } from '@/components/ui/data-table'
import { Checkbox } from '@/components/ui/checkbox'

// Sample payment data
type Payment = {
  id: string
  amount: number
  status: 'pending' | 'processing' | 'success' | 'failed'
  email: string
}

const payments: Payment[] = [
  { id: 'PAY001', amount: 316, status: 'success', email: 'ken99@example.com' },
  { id: 'PAY002', amount: 242, status: 'success', email: 'abe45@example.com' },
  { id: 'PAY003', amount: 837, status: 'processing', email: 'monserrat44@example.com' },
  { id: 'PAY004', amount: 874, status: 'success', email: 'silas22@example.com' },
  { id: 'PAY005', amount: 721, status: 'failed', email: 'carmella@example.com' },
]

const paymentsExtended: Payment[] = [
  ...payments,
  { id: 'PAY006', amount: 150, status: 'pending', email: 'derek@example.com' },
  { id: 'PAY007', amount: 490, status: 'success', email: 'mia.johnson@example.com' },
  { id: 'PAY008', amount: 125, status: 'processing', email: 'olivia.m@example.com' },
  { id: 'PAY009', amount: 960, status: 'success', email: 'james.w@example.com' },
  { id: 'PAY010', amount: 340, status: 'failed', email: 'sophia.l@example.com' },
  { id: 'PAY011', amount: 580, status: 'success', email: 'liam.b@example.com' },
  { id: 'PAY012', amount: 210, status: 'pending', email: 'emma.d@example.com' },
]

type SortKey = 'amount' | 'status' | null
type SortDir = 'asc' | 'desc'

// Preview / Basic demo: Sortable columns
export function DataTablePreviewDemo() {
  const [sortKey, setSortKey] = createSignal<SortKey>(null)
  const [sortDir, setSortDir] = createSignal<SortDir>('asc')

  const handleSort = (key: 'amount' | 'status') => {
    if (sortKey() === null) {
      setSortKey(key)
      setSortDir('asc')
    } else if (sortKey() === key) {
      setSortDir(sortDir() === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(null)
    }
  }

  const sortedData = createMemo(() => {
    const key = sortKey()
    if (!key) return payments

    const dir = sortDir()
    return /* @client */ [...payments].sort((a, b) => {
      const aVal = a[key]
      const bVal = b[key]
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return dir === 'asc' ? aVal - bVal : bVal - aVal
      }
      const aStr = String(aVal)
      const bStr = String(bVal)
      return dir === 'asc' ? (aStr < bStr ? -1 : aStr > bStr ? 1 : 0) : (aStr > bStr ? -1 : aStr < bStr ? 1 : 0)
    })
  })

  return (
    <div className="w-full">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[100px]">ID</TableHead>
            <TableHead>
              <DataTableColumnHeader
                title="Status"
                sorted={sortKey() === 'status' ? sortDir() : false}
                onSort={() => handleSort('status')}
              />
            </TableHead>
            <TableHead>Email</TableHead>
            <TableHead className="text-right">
              <DataTableColumnHeader
                title="Amount"
                sorted={sortKey() === 'amount' ? sortDir() : false}
                onSort={() => handleSort('amount')}
              />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedData().map((payment) => (
            <TableRow>
              <TableCell className="font-medium">{payment.id}</TableCell>
              <TableCell>{payment.status}</TableCell>
              <TableCell>{payment.email}</TableCell>
              <TableCell className="text-right">${payment.amount.toFixed(2)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

// Usage demo: Sortable columns + pagination
export function DataTableUsageDemo() {
  const [sortKey, setSortKey] = createSignal<SortKey>(null)
  const [sortDir, setSortDir] = createSignal<SortDir>('asc')
  const [page, setPage] = createSignal(0)
  const pageSize = 3

  const handleSort = (key: 'amount' | 'status') => {
    if (sortKey() === null) {
      setSortKey(key)
      setSortDir('asc')
    } else if (sortKey() === key) {
      setSortDir(sortDir() === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(null)
    }
  }

  const sortedData = createMemo(() => {
    const key = sortKey()
    if (!key) return payments

    const dir = sortDir()
    return /* @client */ [...payments].sort((a, b) => {
      const aVal = a[key]
      const bVal = b[key]
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return dir === 'asc' ? aVal - bVal : bVal - aVal
      }
      const aStr = String(aVal)
      const bStr = String(bVal)
      return dir === 'asc' ? (aStr < bStr ? -1 : aStr > bStr ? 1 : 0) : (aStr > bStr ? -1 : aStr < bStr ? 1 : 0)
    })
  })

  const pageCount = createMemo(() =>
    Math.max(1, Math.ceil(sortedData().length / pageSize))
  )

  const paginatedData = createMemo(() =>
    sortedData().slice(page() * pageSize, (page() + 1) * pageSize)
  )

  return (
    <div className="w-full space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[100px]">ID</TableHead>
            <TableHead>
              <DataTableColumnHeader
                title="Status"
                sorted={sortKey() === 'status' ? sortDir() : false}
                onSort={() => handleSort('status')}
              />
            </TableHead>
            <TableHead>Email</TableHead>
            <TableHead className="text-right">
              <DataTableColumnHeader
                title="Amount"
                sorted={sortKey() === 'amount' ? sortDir() : false}
                onSort={() => handleSort('amount')}
              />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginatedData().map((payment) => (
            <TableRow>
              <TableCell className="font-medium">{payment.id}</TableCell>
              <TableCell>{payment.status}</TableCell>
              <TableCell>{payment.email}</TableCell>
              <TableCell className="text-right">${payment.amount.toFixed(2)}</TableCell>
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
        Page {page() + 1} of {pageCount()}
      </DataTablePagination>
    </div>
  )
}

// Filtering demo: Email filter + pagination
export function DataTableFilteringDemo() {
  const [filter, setFilter] = createSignal('')
  const [page, setPage] = createSignal(0)
  const pageSize = 5

  const filteredData = createMemo(() =>
    /* @client */ paymentsExtended.filter(row =>
      row.email.toLowerCase().includes(filter().toLowerCase())
    )
  )

  const pageCount = createMemo(() =>
    Math.max(1, Math.ceil(filteredData().length / pageSize))
  )

  const paginatedData = createMemo(() =>
    filteredData().slice(page() * pageSize, (page() + 1) * pageSize)
  )

  const handleFilterInput = (e: Event) => {
    const value = (e.target as HTMLInputElement).value
    setFilter(value)
    setPage(0)
  }

  return (
    <div className="w-full space-y-4">
      <input
        type="text"
        placeholder="Filter emails..."
        className="flex h-9 w-full max-w-sm rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        value={filter()}
        onInput={handleFilterInput}
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[100px]">ID</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Email</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginatedData().map((payment) => (
            <TableRow>
              <TableCell className="font-medium">{payment.id}</TableCell>
              <TableCell>{payment.status}</TableCell>
              <TableCell>{payment.email}</TableCell>
              <TableCell className="text-right">${payment.amount.toFixed(2)}</TableCell>
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
        Page {page() + 1} of {pageCount()}
      </DataTablePagination>
    </div>
  )
}

// Selection demo: Row checkboxes
export function DataTableSelectionDemo() {
  const [selected, setSelected] = createSignal<boolean[]>(payments.map(() => false))

  const selectedCount = createMemo(() => selected().filter(Boolean).length)
  const isAllSelected = createMemo(() => selectedCount() === payments.length && payments.length > 0)

  const toggleAll = () => {
    if (isAllSelected()) {
      setSelected(payments.map(() => false))
    } else {
      setSelected(payments.map(() => true))
    }
  }

  const toggleRow = (index: number) => {
    setSelected(prev => prev.map((v, i) => i === index ? !v : v))
  }

  return (
    <div className="w-full">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40px]">
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
          {payments.map((payment, index) => (
            <TableRow data-state={selected()[index] ? 'selected' : undefined}>
              <TableCell>
                <Checkbox
                  checked={selected()[index]}
                  onCheckedChange={() => toggleRow(index)}
                  aria-label={`Select ${payment.id}`}
                />
              </TableCell>
              <TableCell className="font-medium">{payment.id}</TableCell>
              <TableCell>{payment.status}</TableCell>
              <TableCell>{payment.email}</TableCell>
              <TableCell className="text-right">${payment.amount.toFixed(2)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="py-4 text-sm text-muted-foreground">
        {selectedCount()} of {payments.length} row(s) selected.
      </div>
    </div>
  )
}
