"use client"
/**
 * DashboardDemo Component
 *
 * Sales dashboard block combining Cards, Table, Badge, Tabs, and Input.
 * Compiler stress: .map() rendering, conditional Badge inside loops,
 * reactive .filter().map() chain, multiple sibling Card components.
 */

import { createSignal, createMemo } from '@barefootjs/dom'
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
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@ui/components/ui/tabs'
import {
  ToastProvider,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
} from '@ui/components/ui/toast'
import { Separator } from '@ui/components/ui/separator'

// Static stats data
const stats = [
  { title: 'Total Revenue', value: '$45.2K', change: '+20.1% from last month' },
  { title: 'Orders', value: '2,350', change: '+180 from last month' },
  { title: 'Customers', value: '1,234', change: '+19% from last month' },
  { title: 'Conversion Rate', value: '3.2%', change: '+0.4% from last month' },
]

// Status → Badge variant mapping (module-level constant used inside reactive .map())
const statusBadgeVariant: Record<string, string> = {
  completed: 'default',
  processing: 'secondary',
  pending: 'outline',
  cancelled: 'destructive',
}

// Order data with typed status
type OrderStatus = 'completed' | 'processing' | 'pending' | 'cancelled'

type Order = {
  id: string
  customer: string
  email: string
  amount: number
  status: OrderStatus
}

const orders: Order[] = [
  { id: 'ORD001', customer: 'Alice Johnson', email: 'alice@example.com', amount: 250.00, status: 'completed' },
  { id: 'ORD002', customer: 'Bob Smith', email: 'bob@example.com', amount: 150.00, status: 'processing' },
  { id: 'ORD003', customer: 'Carol White', email: 'carol@example.com', amount: 350.00, status: 'completed' },
  { id: 'ORD004', customer: 'David Brown', email: 'david@example.com', amount: 450.00, status: 'pending' },
  { id: 'ORD005', customer: 'Eve Davis', email: 'eve@example.com', amount: 550.00, status: 'cancelled' },
]

// Activity data
type ActivityType = 'order' | 'customer' | 'refund'

type Activity = {
  id: string
  type: ActivityType
  description: string
  time: string
}

const activities: Activity[] = [
  { id: 'ACT001', type: 'order', description: 'New order #ORD006 placed', time: '2 minutes ago' },
  { id: 'ACT002', type: 'customer', description: 'New customer registered', time: '15 minutes ago' },
  { id: 'ACT003', type: 'refund', description: 'Refund processed for #ORD003', time: '1 hour ago' },
  { id: 'ACT004', type: 'order', description: 'Order #ORD001 shipped', time: '2 hours ago' },
  { id: 'ACT005', type: 'customer', description: 'Customer updated profile', time: '3 hours ago' },
]

// Activity type labels — conditional inside loop
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

/**
 * Dashboard demo — sales metrics, filterable orders, activity feed
 *
 * Compiler stress points:
 * - .map() rendering inside Table (loop children)
 * - Conditional Badge variant inside .map() (conditional in loop)
 * - .filter().map() chain (reactive filtered list)
 * - Multiple Card components at same level (sibling components)
 * - Input onChange -> signal -> filtered list (reactive chain)
 * - Tabs branch switching with different content per tab
 */
export function DashboardDemo() {
  // Tab state
  const [selectedTab, setSelectedTab] = createSignal('overview')
  const isOverviewSelected = createMemo(() => selectedTab() === 'overview')
  const isAnalyticsSelected = createMemo(() => selectedTab() === 'analytics')

  // Search filter for orders table
  const [searchQuery, setSearchQuery] = createSignal('')

  // Reactive filtered orders — .filter().map() chain stress test
  const filteredOrders = createMemo(() =>
    /* @client */ orders.filter((order) =>
      order.customer.toLowerCase().includes(searchQuery().toLowerCase()) ||
      order.email.toLowerCase().includes(searchQuery().toLowerCase()) ||
      order.id.toLowerCase().includes(searchQuery().toLowerCase())
    )
  )

  // Toast state for action feedback
  const [toastOpen, setToastOpen] = createSignal(false)
  const [toastMessage, setToastMessage] = createSignal('')

  const showToast = (message: string) => {
    setToastMessage(message)
    setToastOpen(true)
    setTimeout(() => setToastOpen(false), 3000)
  }

  const handleExport = () => {
    showToast('Report exported successfully')
  }

  return (
    <div className="w-full min-w-0 overflow-hidden space-y-6">
      {/* Tab navigation */}
      <Tabs value={selectedTab()} onValueChange={setSelectedTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger
              value="overview"
              selected={isOverviewSelected()}
              disabled={false}
              onClick={() => setSelectedTab('overview')}
            >
              Overview
            </TabsTrigger>
            <TabsTrigger
              value="analytics"
              selected={isAnalyticsSelected()}
              disabled={false}
              onClick={() => setSelectedTab('analytics')}
            >
              Analytics
            </TabsTrigger>
          </TabsList>
          <Button variant="outline" size="sm" onClick={handleExport}>
            Export
          </Button>
        </div>

        {/* Overview Tab */}
        <TabsContent value="overview" selected={isOverviewSelected()}>
          <div className="space-y-6">
            {/* Stats cards — .map() with multiple sibling Cards */}
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              {stats.map((stat) => (
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>{stat.title}</CardDescription>
                    <CardTitle className="text-2xl">{stat.value}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">{stat.change}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Orders table — .filter().map() with conditional Badge */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Orders</CardTitle>
                <CardDescription>You have {filteredOrders().length} orders matching your search.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <Input
                    placeholder="Search orders..."
                    value={searchQuery()}
                    onInput={(e) => setSearchQuery(e.target.value)}
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
                </div>
              </CardContent>
            </Card>

            {/* Activity feed — .map() with conditional per activity type */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Latest actions across your store</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {activities.map((activity) => (
                    <div className="flex items-center gap-4">
                      <Badge variant={activityBadgeVariant[activity.type]} className="w-20 justify-center">
                        {activityLabels[activity.type]}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">{activity.description}</p>
                        <p className="text-xs text-muted-foreground">{activity.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" selected={isAnalyticsSelected()}>
          <div className="space-y-6">
            {/* Summary stats in analytics view — reuses same .map() pattern */}
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Revenue Trend</CardTitle>
                  <CardDescription>Monthly revenue over time</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">January</span>
                      <span className="font-medium">$12,450</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">February</span>
                      <span className="font-medium">$14,320</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">March</span>
                      <span className="font-medium">$18,461</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Top Customers</CardTitle>
                  <CardDescription>Highest spending customers</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {orders
                      .sort((a, b) => b.amount - a.amount)
                      .slice(0, 3)
                      .map((order) => (
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium">{order.customer}</p>
                            <p className="text-xs text-muted-foreground">{order.email}</p>
                          </div>
                          <span className="text-sm font-medium">${order.amount.toFixed(2)}</span>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <ToastProvider position="bottom-right">
        <Toast variant="success" open={toastOpen()}>
          <div className="flex-1">
            <ToastTitle>Success</ToastTitle>
            <ToastDescription className="toast-message">{toastMessage()}</ToastDescription>
          </div>
          <ToastClose onClick={() => setToastOpen(false)} />
        </Toast>
      </ToastProvider>
    </div>
  )
}
