"use client"
/**
 * AnalyticsDashboardDemo
 *
 * Website analytics dashboard with multi-level memo chains, dynamic charts,
 * controlled search input, inner loops (tags), and conditional row expansion.
 *
 * Compiler stress targets:
 * - 5-level memo chain (filter → sort → paginate + aggregate + chart data)
 * - Per-item signals in component loops (KPI cards)
 * - Dynamic chart data from memo chain (AreaChart + PieChart)
 * - Controlled input focus preservation
 * - Inner loops (tags.map inside rows.map)
 * - Conditional rendering inside loop (expandable rows)
 * - Multiple signal reads in single expression
 */

import { createSignal, createMemo } from '@barefootjs/dom'
import type { ChartConfig } from '@barefootjs/chart'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@ui/components/ui/card'
import { Badge } from '@ui/components/ui/badge'
import { Button } from '@ui/components/ui/button'
import { Input } from '@ui/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@ui/components/ui/select'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@ui/components/ui/table'
import { Progress } from '@ui/components/ui/progress'
import { Separator } from '@ui/components/ui/separator'
import {
  ChartContainer, AreaChart, Area, AreaCartesianGrid, AreaXAxis, AreaYAxis, AreaChartTooltip,
  PieChart, Pie, PieTooltip,
} from '@ui/components/ui/chart'

// --- Types ---

type TrafficSource = 'organic' | 'direct' | 'referral' | 'social' | 'paid'
type SortKey = 'page' | 'views' | 'visitors' | 'bounceRate' | 'revenue' | null
type SortDir = 'asc' | 'desc'

type PageMetric = {
  id: string
  page: string
  source: TrafficSource
  views: number
  visitors: number
  bounceRate: number
  avgDuration: number
  conversions: number
  revenue: number
  tags: string[]
  date: string
}

// --- Mock Data ---

const sourceColors: Record<TrafficSource, string> = {
  organic: 'hsl(142 71% 45%)',
  direct: 'hsl(221 83% 53%)',
  referral: 'hsl(280 65% 60%)',
  social: 'hsl(340 75% 55%)',
  paid: 'hsl(38 92% 50%)',
}

const sourceBadgeVariant = {
  organic: 'default',
  direct: 'secondary',
  referral: 'outline',
  social: 'default',
  paid: 'outline',
} as const

const chartConfig: ChartConfig = {
  views: { label: 'Page Views', color: 'hsl(221 83% 53%)' },
  visitors: { label: 'Visitors', color: 'hsl(142 71% 45%)' },
}

const pieChartConfig: ChartConfig = {
  organic: { label: 'Organic', color: sourceColors.organic },
  direct: { label: 'Direct', color: sourceColors.direct },
  referral: { label: 'Referral', color: sourceColors.referral },
  social: { label: 'Social', color: sourceColors.social },
  paid: { label: 'Paid', color: sourceColors.paid },
}

const allData: PageMetric[] = [
  { id: 'p01', page: '/home', source: 'organic', views: 12400, visitors: 8200, bounceRate: 32, avgDuration: 145, conversions: 820, revenue: 24600, tags: ['landing', 'high-value'], date: '2024-01' },
  { id: 'p02', page: '/pricing', source: 'direct', views: 8900, visitors: 6100, bounceRate: 28, avgDuration: 210, conversions: 610, revenue: 18300, tags: ['landing', 'conversion'], date: '2024-01' },
  { id: 'p03', page: '/blog/intro', source: 'organic', views: 6700, visitors: 5400, bounceRate: 45, avgDuration: 180, conversions: 270, revenue: 5400, tags: ['content', 'seo'], date: '2024-02' },
  { id: 'p04', page: '/docs/getting-started', source: 'referral', views: 5200, visitors: 4100, bounceRate: 22, avgDuration: 320, conversions: 410, revenue: 8200, tags: ['docs'], date: '2024-02' },
  { id: 'p05', page: '/about', source: 'social', views: 3800, visitors: 3200, bounceRate: 55, avgDuration: 90, conversions: 95, revenue: 1900, tags: ['info'], date: '2024-03' },
  { id: 'p06', page: '/blog/advanced', source: 'organic', views: 4500, visitors: 3600, bounceRate: 38, avgDuration: 240, conversions: 180, revenue: 3600, tags: ['content', 'seo'], date: '2024-03' },
  { id: 'p07', page: '/pricing', source: 'paid', views: 9200, visitors: 7800, bounceRate: 30, avgDuration: 195, conversions: 780, revenue: 23400, tags: ['landing', 'conversion', 'high-value'], date: '2024-03' },
  { id: 'p08', page: '/contact', source: 'direct', views: 2100, visitors: 1800, bounceRate: 42, avgDuration: 120, conversions: 180, revenue: 3600, tags: ['info'], date: '2024-04' },
  { id: 'p09', page: '/home', source: 'social', views: 7600, visitors: 5900, bounceRate: 35, avgDuration: 130, conversions: 590, revenue: 17700, tags: ['landing', 'high-value'], date: '2024-04' },
  { id: 'p10', page: '/docs/api', source: 'referral', views: 4800, visitors: 3900, bounceRate: 20, avgDuration: 350, conversions: 390, revenue: 7800, tags: ['docs', 'technical'], date: '2024-04' },
  { id: 'p11', page: '/blog/tutorial', source: 'organic', views: 8100, visitors: 6500, bounceRate: 33, avgDuration: 260, conversions: 325, revenue: 6500, tags: ['content', 'seo', 'high-value'], date: '2024-05' },
  { id: 'p12', page: '/home', source: 'paid', views: 11200, visitors: 9100, bounceRate: 29, avgDuration: 155, conversions: 910, revenue: 27300, tags: ['landing', 'conversion'], date: '2024-05' },
  { id: 'p13', page: '/pricing', source: 'organic', views: 7300, visitors: 5800, bounceRate: 26, avgDuration: 220, conversions: 580, revenue: 17400, tags: ['landing', 'conversion'], date: '2024-05' },
  { id: 'p14', page: '/docs/components', source: 'referral', views: 3900, visitors: 3100, bounceRate: 18, avgDuration: 380, conversions: 310, revenue: 6200, tags: ['docs', 'technical'], date: '2024-06' },
  { id: 'p15', page: '/blog/release', source: 'social', views: 5600, visitors: 4200, bounceRate: 40, avgDuration: 170, conversions: 210, revenue: 4200, tags: ['content'], date: '2024-06' },
  { id: 'p16', page: '/home', source: 'organic', views: 13100, visitors: 8800, bounceRate: 31, avgDuration: 150, conversions: 880, revenue: 26400, tags: ['landing', 'high-value'], date: '2024-06' },
  { id: 'p17', page: '/contact', source: 'social', views: 1900, visitors: 1600, bounceRate: 48, avgDuration: 95, conversions: 80, revenue: 1600, tags: ['info'], date: '2024-01' },
  { id: 'p18', page: '/docs/getting-started', source: 'organic', views: 6100, visitors: 4900, bounceRate: 21, avgDuration: 310, conversions: 490, revenue: 9800, tags: ['docs', 'seo'], date: '2024-02' },
  { id: 'p19', page: '/blog/comparison', source: 'paid', views: 7400, visitors: 6200, bounceRate: 34, avgDuration: 200, conversions: 620, revenue: 18600, tags: ['content', 'conversion', 'high-value'], date: '2024-04' },
  { id: 'p20', page: '/pricing', source: 'referral', views: 4100, visitors: 3300, bounceRate: 25, avgDuration: 230, conversions: 330, revenue: 9900, tags: ['landing', 'conversion'], date: '2024-06' },
]

const PAGE_SIZE = 8
const REVENUE_TARGET = 300000

// --- Helpers ---

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatCurrency(value: number): string {
  return `$${value.toLocaleString()}`
}

// --- Component ---

export function AnalyticsDashboardDemo() {
  // Signals (user inputs)
  const [searchQuery, setSearchQuery] = createSignal('')
  const [sourceFilter, setSourceFilter] = createSignal('all')
  const [sortKey, setSortKey] = createSignal<SortKey>(null)
  const [sortDir, setSortDir] = createSignal<SortDir>('asc')
  const [currentPage, setCurrentPage] = createSignal(0)
  const [expandedRow, setExpandedRow] = createSignal<string | null>(null)

  // L1: Filter by search + source
  const filteredData = createMemo(() => {
    const query = searchQuery().toLowerCase()
    const source = sourceFilter()
    return allData.filter(row => {
      if (source !== 'all' && row.source !== source) return false
      if (query && !row.page.toLowerCase().includes(query) && !row.tags.some(t => t.includes(query))) return false
      return true
    })
  })

  // L2: Sort
  const sortedData = createMemo(() => {
    const key = sortKey()
    if (!key) return filteredData()
    const dir = sortDir()
    return [...filteredData()].sort((a, b) => {
      const aVal = a[key]
      const bVal = b[key]
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return dir === 'asc' ? aVal - bVal : bVal - aVal
      }
      return dir === 'asc'
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal))
    })
  })

  // L3: Paginate
  const totalPages = createMemo(() => Math.max(1, Math.ceil(sortedData().length / PAGE_SIZE)))
  const paginatedData = createMemo(() =>
    sortedData().slice(currentPage() * PAGE_SIZE, (currentPage() + 1) * PAGE_SIZE)
  )

  // L4: Aggregate stats (KPI cards)
  const aggregateStats = createMemo(() => {
    const data = filteredData()
    const totalViews = data.reduce((s, r) => s + r.views, 0)
    const totalVisitors = data.reduce((s, r) => s + r.visitors, 0)
    const totalRevenue = data.reduce((s, r) => s + r.revenue, 0)
    const totalConversions = data.reduce((s, r) => s + r.conversions, 0)
    const avgBounce = data.length > 0
      ? Math.round(data.reduce((s, r) => s + r.bounceRate, 0) / data.length)
      : 0
    const avgDuration = data.length > 0
      ? Math.round(data.reduce((s, r) => s + r.avgDuration, 0) / data.length)
      : 0
    const conversionRate = totalVisitors > 0
      ? ((totalConversions / totalVisitors) * 100).toFixed(1)
      : '0.0'
    return { totalViews, totalVisitors, totalRevenue, totalConversions, avgBounce, avgDuration, conversionRate }
  })

  // Derived scalar memos for footer text expressions.
  // Using filteredData() directly avoids the compiler inlining aggregateStats()'s
  // object literal into SSR template expressions (which breaks ${...} parsing).
  const totalConversions = createMemo(() => filteredData().reduce((s, r) => s + r.conversions, 0))
  const totalRevenue = createMemo(() => filteredData().reduce((s, r) => s + r.revenue, 0))

  // L5: Chart data (group by month)
  const chartData = createMemo(() => {
    const byMonth = new Map<string, { month: string; views: number; visitors: number }>()
    for (const row of filteredData()) {
      const existing = byMonth.get(row.date) || { month: row.date, views: 0, visitors: 0 }
      existing.views += row.views
      existing.visitors += row.visitors
      byMonth.set(row.date, existing)
    }
    return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month))
  })

  // L5b: Source breakdown (for pie chart)
  const sourceBreakdown = createMemo(() => {
    const bySource = new Map<string, { source: string; revenue: number; fill: string }>()
    for (const row of filteredData()) {
      const existing = bySource.get(row.source) || { source: row.source, revenue: 0, fill: sourceColors[row.source] }
      existing.revenue += row.revenue
      bySource.set(row.source, existing)
    }
    return [...bySource.values()]
  })

  // Handlers
  const handleSort = (key: 'page' | 'views' | 'visitors' | 'bounceRate' | 'revenue') => {
    if (sortKey() === key) {
      setSortDir(sortDir() === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
    setCurrentPage(0)
  }

  const handleSourceChange = (value: string) => {
    setSourceFilter(value)
    setCurrentPage(0)
  }

  const toggleExpand = (id: string) => {
    setExpandedRow(expandedRow() === id ? null : id)
  }

  return (
    <div className="w-full min-w-0 overflow-hidden space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Website Analytics</h2>
          {/* Multiple signal reads in single expression */}
          <p className="analytics-subtitle text-sm text-muted-foreground">
            Showing {filteredData().length} of {allData.length} pages
          </p>
        </div>
        <Select value={sourceFilter()} onValueChange={handleSourceChange}>
          <SelectTrigger className="source-filter w-[180px]">
            <SelectValue placeholder="All Sources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="organic">Organic</SelectItem>
            <SelectItem value="direct">Direct</SelectItem>
            <SelectItem value="referral">Referral</SelectItem>
            <SelectItem value="social">Social</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards — per-item signals in component loop */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Views</CardDescription>
            <CardTitle className="kpi-views text-2xl">{aggregateStats().totalViews.toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent>
            <Progress value={Math.min(100, (aggregateStats().totalViews / 150000) * 100)} className="h-1" />
            <p className="text-xs text-muted-foreground mt-1">of 150k target</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Unique Visitors</CardDescription>
            <CardTitle className="kpi-visitors text-2xl">{aggregateStats().totalVisitors.toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={aggregateStats().totalVisitors > 50000 ? 'default' : 'secondary'}>
              {aggregateStats().totalVisitors > 50000 ? 'On track' : 'Below target'}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Revenue</CardDescription>
            <CardTitle className="kpi-revenue text-2xl">{formatCurrency(aggregateStats().totalRevenue)}</CardTitle>
          </CardHeader>
          <CardContent>
            <Progress value={Math.min(100, (aggregateStats().totalRevenue / REVENUE_TARGET) * 100)} className="h-1" />
            <p className="text-xs text-muted-foreground mt-1">of {formatCurrency(REVENUE_TARGET)} target</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Avg Bounce Rate</CardDescription>
            <CardTitle className="kpi-bounce text-2xl">{aggregateStats().avgBounce}%</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={aggregateStats().avgBounce < 35 ? 'default' : 'destructive'}>
              {aggregateStats().avgBounce < 35 ? 'Good' : 'Needs improvement'}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Conversions</CardDescription>
            <CardTitle className="kpi-conversions text-2xl">{aggregateStats().totalConversions.toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{aggregateStats().conversionRate}% conversion rate</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Avg Duration</CardDescription>
            <CardTitle className="kpi-duration text-2xl">{formatDuration(aggregateStats().avgDuration)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">across {filteredData().length} pages</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Traffic Over Time</CardTitle>
            <CardDescription>Page views and visitors by month</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="w-full h-[250px]">
              <AreaChart data={chartData()}>
                <AreaCartesianGrid vertical={false} />
                <AreaXAxis dataKey="month" tickFormatter={(v: string) => v.replace('2024-', '')} />
                <AreaYAxis />
                <AreaChartTooltip />
                <Area dataKey="views" fill={'var(--color-views)'} stroke={'var(--color-views)'} fillOpacity={0.3} />
                <Area dataKey="visitors" fill={'var(--color-visitors)'} stroke={'var(--color-visitors)'} fillOpacity={0.3} />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Revenue by Source</CardTitle>
            <CardDescription>Distribution across traffic sources</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={pieChartConfig} className="w-full h-[250px]">
              <PieChart data={sourceBreakdown()}>
                <PieTooltip />
                <Pie dataKey="revenue" nameKey="source" />
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Search + Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle className="text-base">Page Metrics</CardTitle>
            <Input
              placeholder="Search pages or tags..."
              value={searchQuery()}
              onInput={(e) => { setSearchQuery(e.target.value); setCurrentPage(0) }}
              className="analytics-search max-w-xs"
            />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer" onClick={() => handleSort('page')}>
                  Page {sortKey() === 'page' ? (sortDir() === 'asc' ? '↑' : '↓') : ''}
                </TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="cursor-pointer text-right" onClick={() => handleSort('views')}>
                  Views {sortKey() === 'views' ? (sortDir() === 'asc' ? '↑' : '↓') : ''}
                </TableHead>
                <TableHead className="cursor-pointer text-right" onClick={() => handleSort('visitors')}>
                  Visitors {sortKey() === 'visitors' ? (sortDir() === 'asc' ? '↑' : '↓') : ''}
                </TableHead>
                <TableHead className="cursor-pointer text-right" onClick={() => handleSort('bounceRate')}>
                  Bounce {sortKey() === 'bounceRate' ? (sortDir() === 'asc' ? '↑' : '↓') : ''}
                </TableHead>
                <TableHead className="cursor-pointer text-right" onClick={() => handleSort('revenue')}>
                  Revenue {sortKey() === 'revenue' ? (sortDir() === 'asc' ? '↑' : '↓') : ''}
                </TableHead>
                <TableHead>Tags</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedData().map(row => (
                <TableRow key={row.id} className="analytics-row cursor-pointer" onClick={() => toggleExpand(row.id)}>
                  <TableCell className="font-medium">{row.page}</TableCell>
                  <TableCell>
                    <Badge variant={sourceBadgeVariant[row.source]}>{row.source}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{row.views.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{row.visitors.toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    <span className={row.bounceRate > 40 ? 'text-destructive' : row.bounceRate < 30 ? 'text-green-600' : ''}>
                      {row.bounceRate}%
                    </span>
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(row.revenue)}</TableCell>
                  <TableCell>
                    {/* Inner loop: tags.map inside rows.map */}
                    <div className="flex flex-wrap gap-1">
                      {row.tags.map(tag => (
                        <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-4">
            <p className="analytics-page-info text-sm text-muted-foreground">
              Page {currentPage() + 1} of {totalPages()}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage() === 0}
                onClick={() => setCurrentPage(currentPage() - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage() >= totalPages() - 1}
                onClick={() => setCurrentPage(currentPage() + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Footer stats — multiple signal reads */}
      <div className="analytics-footer flex items-center gap-4 text-sm text-muted-foreground">
        <span>{filteredData().length} of {allData.length} pages</span>
        <Separator orientation="vertical" decorative className="h-4" />
        <span>{totalConversions().toLocaleString()} conversions</span>
        <Separator orientation="vertical" decorative className="h-4" />
        <span>{formatCurrency(totalRevenue())} total revenue</span>
      </div>
    </div>
  )
}
