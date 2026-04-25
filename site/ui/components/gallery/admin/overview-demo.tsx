"use client"

import { createMemo, createSignal, createEffect } from '@barefootjs/client'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@ui/components/ui/card'
import { Badge } from '@ui/components/ui/badge'
import { Input } from '@ui/components/ui/input'
import { Button } from '@ui/components/ui/button'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@ui/components/ui/table'
import { Separator } from '@ui/components/ui/separator'
import {
  TIME_RANGE_LABELS,
  TIME_RANGE_MULTIPLIER,
  readTimeRange,
  writeTimeRange,
  readUnreadCount,
  writeUnreadCount,
  type TimeRange,
} from '../../shared/gallery-admin-storage'

type OrderStatus = 'completed' | 'processing' | 'pending' | 'cancelled'

interface RecentOrder {
  id: string
  customer: string
  email: string
  amount: number
  status: OrderStatus
}

const statusBadgeVariant: Record<OrderStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  completed: 'default',
  processing: 'secondary',
  pending: 'outline',
  cancelled: 'destructive',
}

const orders: RecentOrder[] = [
  { id: 'ORD001', customer: 'Alice Johnson', email: 'alice@example.com', amount: 250.00, status: 'completed' },
  { id: 'ORD002', customer: 'Bob Smith', email: 'bob@example.com', amount: 150.00, status: 'processing' },
  { id: 'ORD003', customer: 'Carol White', email: 'carol@example.com', amount: 350.00, status: 'completed' },
  { id: 'ORD004', customer: 'David Brown', email: 'david@example.com', amount: 450.00, status: 'pending' },
  { id: 'ORD005', customer: 'Eve Davis', email: 'eve@example.com', amount: 550.00, status: 'cancelled' },
]

type ActivityType = 'order' | 'customer' | 'refund'

const activityLabels: Record<ActivityType, string> = {
  order: 'Order',
  customer: 'Customer',
  refund: 'Refund',
}

const activityBadgeVariant: Record<ActivityType, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  order: 'default',
  customer: 'secondary',
  refund: 'destructive',
}

const activities: Array<{ id: string; type: ActivityType; description: string; time: string }> = [
  { id: 'ACT001', type: 'order', description: 'New order #ORD006 placed', time: '2 minutes ago' },
  { id: 'ACT002', type: 'customer', description: 'New customer registered', time: '15 minutes ago' },
  { id: 'ACT003', type: 'refund', description: 'Refund processed for #ORD003', time: '1 hour ago' },
  { id: 'ACT004', type: 'order', description: 'Order #ORD001 shipped', time: '2 hours ago' },
]

const BASE_REVENUE = 45200
const BASE_ORDERS = 2350
const BASE_CUSTOMERS = 1234
const BASE_CONVERSION = 3.2

function formatCurrency(value: number): string {
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(1)}K`
  }
  return `$${value.toFixed(0)}`
}

export function AdminOverviewDemo() {
  const [timeRange, setTimeRange] = createSignal<TimeRange>(readTimeRange())
  const [unread, setUnread] = createSignal<number>(readUnreadCount())
  const [searchQuery, setSearchQuery] = createSignal('')

  createEffect(() => {
    writeTimeRange(timeRange())
  })

  createEffect(() => {
    writeUnreadCount(unread())
  })

  // Pick up time-range + unread changes dispatched by sibling islands
  // (header filter + unread badge) — separate hydration scopes share state
  // only through the sessionStorage event bridge. See admin-storage.ts.
  // Each admin route is a full page nav so listeners don't accumulate.
  if (typeof window !== 'undefined') {
    window.addEventListener('barefoot:admin-storage', () => {
      setTimeRange(readTimeRange())
      setUnread(readUnreadCount())
    })
  }

  const revenue = createMemo(() => Math.round(BASE_REVENUE * TIME_RANGE_MULTIPLIER[timeRange()]))
  const orderCount = createMemo(() => Math.round(BASE_ORDERS * TIME_RANGE_MULTIPLIER[timeRange()]))
  const customerCount = createMemo(() => Math.round(BASE_CUSTOMERS * TIME_RANGE_MULTIPLIER[timeRange()]))
  const conversionRate = createMemo(() => (BASE_CONVERSION * (0.9 + TIME_RANGE_MULTIPLIER[timeRange()] * 0.1)).toFixed(1))

  const filteredOrders = createMemo(() =>
    orders.filter((order) =>
      order.customer.toLowerCase().includes(searchQuery().toLowerCase()) ||
      order.email.toLowerCase().includes(searchQuery().toLowerCase()) ||
      order.id.toLowerCase().includes(searchQuery().toLowerCase())
    )
  )

  const notifyOncall = () => {
    setUnread(unread() + 1)
  }

  return (
    <div className="w-full min-w-0 space-y-6">
      <div className="flex items-center justify-between">
        <p className="admin-overview-range text-sm text-muted-foreground">
          Showing metrics for <span className="font-medium text-foreground">{TIME_RANGE_LABELS[timeRange()]}</span>
        </p>
        <Button size="sm" variant="outline" className="admin-overview-notify" onClick={notifyOncall}>
          Notify on-call
        </Button>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Revenue</CardDescription>
            <CardTitle className="admin-kpi-revenue text-2xl">{formatCurrency(revenue())}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">vs. previous window</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Orders</CardDescription>
            <CardTitle className="admin-kpi-orders text-2xl">{orderCount().toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">across all channels</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Customers</CardDescription>
            <CardTitle className="admin-kpi-customers text-2xl">{customerCount().toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">active in window</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Conversion Rate</CardDescription>
            <CardTitle className="admin-kpi-conversion text-2xl">{conversionRate()}%</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">blended across sources</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Orders</CardTitle>
          <CardDescription>
            {filteredOrders().length} order{filteredOrders().length === 1 ? '' : 's'} matching your search
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Search orders..."
            value={searchQuery()}
            onInput={(e: Event) => setSearchQuery((e.target as HTMLInputElement).value)}
          />
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Order</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders().map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">{order.id}</TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium">{order.customer}</p>
                        <p className="text-xs text-muted-foreground">{order.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant[order.status]}>{order.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">${order.amount.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Latest actions across your store</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {activities.map((activity) => (
              <div key={activity.id} className="flex items-center gap-4">
                <Badge variant={activityBadgeVariant[activity.type]} className="w-20 justify-center">
                  {activityLabels[activity.type]}
                </Badge>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{activity.description}</p>
                  <p className="text-xs text-muted-foreground">{activity.time}</p>
                </div>
              </div>
            ))}
            <Separator />
            <p className="text-xs text-muted-foreground">
              Window scaled by {TIME_RANGE_MULTIPLIER[timeRange()]}× — shared with Analytics.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
