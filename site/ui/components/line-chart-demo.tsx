"use client"
/**
 * LineChartDemo Components
 *
 * Interactive demos for the Line Chart component.
 * Uses JSX component API with @barefootjs/chart.
 */

import { createSignal, createMemo } from '@barefootjs/client'
import type { ChartConfig } from '@barefootjs/chart'
import {
  ChartContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  ChartTooltip,
} from '@ui/components/ui/chart'

const chartConfig: ChartConfig = {
  desktop: { label: 'Desktop', color: 'hsl(221 83% 53%)' },
  mobile: { label: 'Mobile', color: 'hsl(280 65% 60%)' },
}

const chartData = [
  { month: 'January', desktop: 186, mobile: 80 },
  { month: 'February', desktop: 305, mobile: 200 },
  { month: 'March', desktop: 237, mobile: 120 },
  { month: 'April', desktop: 73, mobile: 190 },
  { month: 'May', desktop: 209, mobile: 130 },
  { month: 'June', desktop: 214, mobile: 140 },
]

/**
 * Preview demo — monthly visitors line chart
 */
export function LineChartPreviewDemo() {
  return (
    <div className="w-full space-y-2">
      <div>
        <h4 className="text-sm font-medium">Monthly Visitors</h4>
        <p className="text-xs text-muted-foreground">January - June 2024</p>
      </div>
      <ChartContainer config={chartConfig} className="w-full">
        <LineChart data={chartData}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="month" tickFormatter={(v: string) => v.slice(0, 3)} />
          <YAxis />
          <ChartTooltip />
          <Line dataKey="desktop" stroke={'var(--color-desktop)'} type="monotone" />
        </LineChart>
      </ChartContainer>
    </div>
  )
}

/**
 * Basic demo — minimal line chart
 */
export function LineChartBasicDemo() {
  return (
    <div className="w-full">
      <ChartContainer config={chartConfig} className="w-full">
        <LineChart data={chartData}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="month" tickFormatter={(v: string) => v.slice(0, 3)} />
          <YAxis />
          <Line dataKey="desktop" stroke={'var(--color-desktop)'} type="monotone" />
        </LineChart>
      </ChartContainer>
    </div>
  )
}

/**
 * Multiple series demo — desktop and mobile lines
 */
export function LineChartMultipleDemo() {
  return (
    <div className="w-full space-y-2">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm" style="background:hsl(221 83% 53%)" />
          <span className="text-xs text-muted-foreground">Desktop</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm" style="background:hsl(280 65% 60%)" />
          <span className="text-xs text-muted-foreground">Mobile</span>
        </div>
      </div>
      <ChartContainer config={chartConfig} className="w-full">
        <LineChart data={chartData}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="month" tickFormatter={(v: string) => v.slice(0, 3)} />
          <YAxis />
          <ChartTooltip />
          <Line dataKey="desktop" stroke={'var(--color-desktop)'} type="monotone" />
          <Line dataKey="mobile" stroke={'var(--color-mobile)'} type="monotone" />
        </LineChart>
      </ChartContainer>
    </div>
  )
}

/**
 * Interactive demo — signal-driven category switching
 */
export function LineChartInteractiveDemo() {
  const [category, setCategory] = createSignal<'desktop' | 'mobile'>('desktop')

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Show:</span>
        <button
          className={`inline-flex items-center justify-center rounded-md text-sm font-medium h-8 px-3 ${
            category() === 'desktop'
              ? 'bg-primary text-primary-foreground'
              : 'border border-input bg-background hover:bg-accent hover:text-accent-foreground'
          }`}
          onClick={() => setCategory('desktop')}
        >
          Desktop
        </button>
        <button
          className={`inline-flex items-center justify-center rounded-md text-sm font-medium h-8 px-3 ${
            category() === 'mobile'
              ? 'bg-primary text-primary-foreground'
              : 'border border-input bg-background hover:bg-accent hover:text-accent-foreground'
          }`}
          onClick={() => setCategory('mobile')}
        >
          Mobile
        </button>
      </div>
      <ChartContainer config={chartConfig} className="w-full">
        <LineChart data={chartData}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="month" tickFormatter={(v: string) => v.slice(0, 3)} />
          <YAxis />
          <ChartTooltip />
          <Line dataKey={category()} stroke={`var(--color-${category()})`} type="monotone" />
        </LineChart>
      </ChartContainer>
    </div>
  )
}

/**
 * Zoom demo — signal-driven X-axis windowing.
 *
 * Two range inputs slice the underlying 12-point dataset into a window
 * via a `createMemo`. Every reactive read in the chart subtree
 * (`viewBox`, point spacing, the SVG path's `d` string, axis tick
 * positions) cascades from that one memo, so a slider tick triggers a
 * full memo chain re-evaluation without re-keying the chart.
 */
const yearlyData = [
  { month: 'January', desktop: 186, mobile: 80 },
  { month: 'February', desktop: 305, mobile: 200 },
  { month: 'March', desktop: 237, mobile: 120 },
  { month: 'April', desktop: 73, mobile: 190 },
  { month: 'May', desktop: 209, mobile: 130 },
  { month: 'June', desktop: 214, mobile: 140 },
  { month: 'July', desktop: 278, mobile: 168 },
  { month: 'August', desktop: 312, mobile: 220 },
  { month: 'September', desktop: 251, mobile: 175 },
  { month: 'October', desktop: 198, mobile: 145 },
  { month: 'November', desktop: 264, mobile: 210 },
  { month: 'December', desktop: 343, mobile: 290 },
]

export function LineChartZoomDemo() {
  const [start, setStart] = createSignal(0)
  const [end, setEnd] = createSignal(yearlyData.length - 1)

  const visibleData = createMemo(() => {
    const a = Math.min(start(), end())
    const b = Math.max(start(), end())
    return yearlyData.slice(a, b + 1)
  })

  const visibleLabel = createMemo(() => {
    const data = visibleData()
    if (data.length === 0) return '—'
    return `${data[0].month.slice(0, 3)} – ${data[data.length - 1].month.slice(0, 3)}`
  })

  return (
    <div className="w-full space-y-4" data-line-zoom-demo>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted-foreground">Window:</span>
          <span className="font-medium" data-zoom-window>
            {visibleLabel()}
          </span>
          <span className="text-xs text-muted-foreground" data-zoom-count>
            ({visibleData().length} of {yearlyData.length} months)
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="w-10">From</span>
            <input
              type="range"
              min="0"
              max={String(yearlyData.length - 1)}
              value={String(start())}
              onInput={(e: Event) => setStart(Number((e.target as HTMLInputElement).value))}
              data-zoom-from
              className="flex-1 accent-primary"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="w-10">To</span>
            <input
              type="range"
              min="0"
              max={String(yearlyData.length - 1)}
              value={String(end())}
              onInput={(e: Event) => setEnd(Number((e.target as HTMLInputElement).value))}
              data-zoom-to
              className="flex-1 accent-primary"
            />
          </label>
        </div>
      </div>
      <ChartContainer config={chartConfig} className="w-full">
        <LineChart data={visibleData()}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="month" tickFormatter={(v: string) => v.slice(0, 3)} />
          <YAxis />
          <ChartTooltip />
          <Line dataKey="desktop" stroke={'var(--color-desktop)'} type="monotone" />
          <Line dataKey="mobile" stroke={'var(--color-mobile)'} type="monotone" />
        </LineChart>
      </ChartContainer>
    </div>
  )
}
