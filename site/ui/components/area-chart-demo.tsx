"use client"
/**
 * AreaChartDemo Components
 *
 * Interactive demos for the Area Chart component.
 * Uses JSX component API with @barefootjs/chart.
 */

import { createSignal } from '@barefootjs/dom'
import type { ChartConfig } from '@barefootjs/chart'
import {
  ChartContainer,
  AreaChart,
  Area,
  AreaCartesianGrid,
  AreaXAxis,
  AreaYAxis,
  AreaChartTooltip,
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
 * Preview demo — monthly visitors area chart
 */
export function AreaChartPreviewDemo() {
  return (
    <div className="w-full space-y-2">
      <div>
        <h4 className="text-sm font-medium">Monthly Visitors</h4>
        <p className="text-xs text-muted-foreground">January - June 2024</p>
      </div>
      <ChartContainer config={chartConfig} className="w-full">
        <AreaChart data={chartData}>
          <AreaCartesianGrid vertical={false} />
          <AreaXAxis dataKey="month" tickFormatter={(v: string) => v.slice(0, 3)} />
          <AreaYAxis />
          <AreaChartTooltip />
          <Area dataKey="desktop" fill={'var(--color-desktop)'} stroke={'var(--color-desktop)'} />
        </AreaChart>
      </ChartContainer>
    </div>
  )
}

/**
 * Basic demo — minimal area chart
 */
export function AreaChartBasicDemo() {
  return (
    <div className="w-full">
      <ChartContainer config={chartConfig} className="w-full">
        <AreaChart data={chartData}>
          <AreaCartesianGrid vertical={false} />
          <AreaXAxis dataKey="month" tickFormatter={(v: string) => v.slice(0, 3)} />
          <AreaYAxis />
          <Area dataKey="desktop" fill={'var(--color-desktop)'} stroke={'var(--color-desktop)'} />
        </AreaChart>
      </ChartContainer>
    </div>
  )
}

/**
 * Multiple series demo — stacked areas for desktop and mobile
 */
export function AreaChartMultipleDemo() {
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
        <AreaChart data={chartData}>
          <AreaCartesianGrid vertical={false} />
          <AreaXAxis dataKey="month" tickFormatter={(v: string) => v.slice(0, 3)} />
          <AreaYAxis />
          <AreaChartTooltip />
          <Area dataKey="desktop" fill={'var(--color-desktop)'} stroke={'var(--color-desktop)'} />
          <Area dataKey="mobile" fill={'var(--color-mobile)'} stroke={'var(--color-mobile)'} />
        </AreaChart>
      </ChartContainer>
    </div>
  )
}

/**
 * Interactive demo — signal-driven category switching
 */
export function AreaChartInteractiveDemo() {
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
        <AreaChart data={chartData}>
          <AreaCartesianGrid vertical={false} />
          <AreaXAxis dataKey="month" tickFormatter={(v: string) => v.slice(0, 3)} />
          <AreaYAxis />
          <AreaChartTooltip />
          <Area dataKey={category()} fill={`var(--color-${category()})`} stroke={`var(--color-${category()})`} />
        </AreaChart>
      </ChartContainer>
    </div>
  )
}
