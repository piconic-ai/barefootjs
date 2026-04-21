"use client"

import { createSignal, createMemo } from '@barefootjs/client'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
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

type OrderRow = {
  id: string
  customer: string
  status: 'processing' | 'shipped' | 'delivered' | 'cancelled'
  priority: 'low' | 'medium' | 'high'
  channel: string
  total: number
}

const statusVariant: Record<OrderRow['status'], 'default' | 'secondary' | 'outline' | 'destructive'> = {
  processing: 'default',
  shipped: 'secondary',
  delivered: 'outline',
  cancelled: 'destructive',
}

const priorityLabel: Record<OrderRow['priority'], string> = {
  low: '↓ Low',
  medium: '→ Medium',
  high: '↑ High',
}

const PAGE_SIZE = 6

const initialOrders: OrderRow[] = [
  { id: 'ORD-1001', customer: 'Alice Johnson', status: 'processing', priority: 'high', channel: 'Web', total: 248.5 },
  { id: 'ORD-1002', customer: 'Bob Smith', status: 'shipped', priority: 'medium', channel: 'Mobile', total: 89.9 },
  { id: 'ORD-1003', customer: 'Carol White', status: 'delivered', priority: 'low', channel: 'Web', total: 412.2 },
  { id: 'ORD-1004', customer: 'David Brown', status: 'processing', priority: 'medium', channel: 'Partner', total: 319.0 },
  { id: 'ORD-1005', customer: 'Eve Davis', status: 'cancelled', priority: 'high', channel: 'Web', total: 0 },
  { id: 'ORD-1006', customer: 'Frank Miller', status: 'shipped', priority: 'high', channel: 'Web', total: 678.45 },
  { id: 'ORD-1007', customer: 'Grace Wilson', status: 'processing', priority: 'low', channel: 'Mobile', total: 59.0 },
  { id: 'ORD-1008', customer: 'Henry Moore', status: 'delivered', priority: 'medium', channel: 'Web', total: 189.99 },
  { id: 'ORD-1009', customer: 'Iris Taylor', status: 'processing', priority: 'low', channel: 'Web', total: 42.0 },
  { id: 'ORD-1010', customer: 'Jack Anderson', status: 'shipped', priority: 'medium', channel: 'Web', total: 312.75 },
  { id: 'ORD-1011', customer: 'Kate Thomas', status: 'delivered', priority: 'high', channel: 'Partner', total: 920.0 },
  { id: 'ORD-1012', customer: 'Leo Martin', status: 'processing', priority: 'medium', channel: 'Mobile', total: 145.25 },
]

type SortKey = 'customer' | 'status' | 'priority' | 'total' | null
type SortDir = 'asc' | 'desc'

export function AdminOrdersDemo() {
  const [orders, setOrders] = createSignal<OrderRow[]>(initialOrders)
  const [filterText, setFilterText] = createSignal('')
  const [statusFilter, setStatusFilter] = createSignal<string>('all')
  const [sortKey, setSortKey] = createSignal<SortKey>(null)
  const [sortDir, setSortDir] = createSignal<SortDir>('asc')
  const [page, setPage] = createSignal(0)
  const [selected, setSelected] = createSignal<Set<string>>(new Set())
  const [toastOpen, setToastOpen] = createSignal(false)
  const [toastMessage, setToastMessage] = createSignal('')

  const filtered = createMemo(() => {
    const text = filterText().toLowerCase()
    const status = statusFilter()
    return orders().filter((o) => {
      if (status !== 'all' && o.status !== status) return false
      if (text && !o.customer.toLowerCase().includes(text) && !o.id.toLowerCase().includes(text)) return false
      return true
    })
  })

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

  const paginated = createMemo(() => {
    const start = page() * PAGE_SIZE
    return sorted().slice(start, start + PAGE_SIZE)
  })

  const totalPages = createMemo(() => Math.max(1, Math.ceil(sorted().length / PAGE_SIZE)))
  const selectedCount = createMemo(() => selected().size)
  const isAllPageSelected = createMemo(() => {
    const pageItems = paginated()
    if (pageItems.length === 0) return false
    return pageItems.every((t) => selected().has(t.id))
  })

  const showToast = (message: string) => {
    setToastMessage(message)
    setToastOpen(true)
    setTimeout(() => setToastOpen(false), 2000)
  }

  const handleSort = (key: SortKey) => {
    if (sortKey() === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
    setPage(0)
  }

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    const pageIds = paginated().map((t) => t.id)
    if (isAllPageSelected()) {
      setSelected((prev) => {
        const next = new Set(prev)
        for (const id of pageIds) next.delete(id)
        return next
      })
    } else {
      setSelected((prev) => {
        const next = new Set(prev)
        for (const id of pageIds) next.add(id)
        return next
      })
    }
  }

  const markShipped = () => {
    const ids = selected()
    setOrders((prev) => prev.map((o) => (ids.has(o.id) ? { ...o, status: 'shipped' as const } : o)))
    setSelected(new Set())
    showToast(`${ids.size} order(s) marked shipped`)
  }

  const cancelSelected = () => {
    const ids = selected()
    setOrders((prev) => prev.map((o) => (ids.has(o.id) ? { ...o, status: 'cancelled' as const, total: 0 } : o)))
    setSelected(new Set())
    showToast(`${ids.size} order(s) cancelled`)
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Orders</h2>
        <span className="text-sm text-muted-foreground">{orders().length} total</span>
      </div>

      <div className="admin-orders-table rounded-xl border bg-card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 p-4">
          <Input
            placeholder="Filter orders..."
            value={filterText()}
            onInput={(e: Event) => {
              setFilterText((e.target as HTMLInputElement).value)
              setPage(0)
            }}
            className="max-w-xs h-8 text-sm"
          />
          <select
            className="admin-orders-status h-8 rounded-md border bg-background px-2 text-sm"
            value={statusFilter()}
            onChange={(e: Event) => {
              setStatusFilter((e.target as HTMLSelectElement).value)
              setPage(0)
            }}
          >
            <option value="all">All statuses</option>
            <option value="processing">Processing</option>
            <option value="shipped">Shipped</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>
          {selectedCount() > 0 ? (
            <div className="flex items-center gap-2 ml-auto">
              <span className="admin-orders-selected text-sm text-muted-foreground">
                {selectedCount()} selected
              </span>
              <Button variant="outline" size="sm" onClick={markShipped}>
                Mark shipped
              </Button>
              <Button variant="destructive" size="sm" onClick={cancelSelected}>
                Cancel
              </Button>
            </div>
          ) : null}
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px] pl-4">
                <Checkbox checked={isAllPageSelected()} onCheckedChange={toggleSelectAll} />
              </TableHead>
              <TableHead className="w-[120px]">Order</TableHead>
              <TableHead>
                <DataTableColumnHeader
                  title="Customer"
                  sorted={sortKey() === 'customer' ? sortDir() : false}
                  onSort={() => handleSort('customer')}
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
              <TableHead className="text-right">
                <DataTableColumnHeader
                  title="Total"
                  sorted={sortKey() === 'total' ? sortDir() : false}
                  onSort={() => handleSort('total')}
                />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated().map((order) => (
              <TableRow
                key={order.id}
                className={`admin-orders-row ${selected().has(order.id) ? 'bg-muted/50' : ''}`}
              >
                <TableCell className="pl-4">
                  <Checkbox
                    checked={selected().has(order.id)}
                    onCheckedChange={() => toggleSelect(order.id)}
                  />
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{order.id}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {order.channel}
                    </Badge>
                    <span className="font-medium">{order.customer}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant[order.status]}>{order.status}</Badge>
                </TableCell>
                <TableCell className="text-sm">{priorityLabel[order.priority]}</TableCell>
                <TableCell className="text-right font-medium">${order.total.toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="p-4">
          <DataTablePagination
            canPrev={page() > 0}
            canNext={page() < totalPages() - 1}
            onPrev={() => setPage((p) => p - 1)}
            onNext={() => setPage((p) => p + 1)}
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
            <ToastTitle>Orders</ToastTitle>
            <ToastDescription className="toast-message">{toastMessage()}</ToastDescription>
          </div>
          <ToastClose onClick={() => setToastOpen(false)} />
        </Toast>
      </ToastProvider>
    </div>
  )
}
