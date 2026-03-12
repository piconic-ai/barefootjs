"use client"
/**
 * RadialChartDemo Components
 *
 * Interactive demos for the Radial Chart component.
 * Uses JSX component API with @barefootjs/chart.
 */

import { createSignal } from '@barefootjs/dom'
import type { ChartConfig } from '@barefootjs/chart'
import {
  ChartContainer,
  RadialChart,
  RadialBar,
  RadialChartLabel,
} from '@ui/components/ui/chart'

const chartConfig: ChartConfig = {
  safari: { label: 'Safari', color: 'hsl(221 83% 53%)' },
  chrome: { label: 'Chrome', color: 'hsl(142 76% 36%)' },
  firefox: { label: 'Firefox', color: 'hsl(38 92% 50%)' },
  edge: { label: 'Edge', color: 'hsl(280 65% 60%)' },
  other: { label: 'Other', color: 'hsl(340 75% 55%)' },
}

const chartData = [
  { browser: 'safari', visitors: 200, fill: 'var(--color-safari)' },
  { browser: 'chrome', visitors: 275, fill: 'var(--color-chrome)' },
  { browser: 'firefox', visitors: 187, fill: 'var(--color-firefox)' },
  { browser: 'edge', visitors: 173, fill: 'var(--color-edge)' },
  { browser: 'other', visitors: 90, fill: 'var(--color-other)' },
]

/**
 * Preview demo — browser visitors radial chart
 */
export function RadialChartPreviewDemo() {
  return (
    <div className="w-full space-y-2">
      <div>
        <h4 className="text-sm font-medium">Browser Visitors</h4>
        <p className="text-xs text-muted-foreground">January - June 2024</p>
      </div>
      <ChartContainer config={chartConfig} className="w-full">
        <RadialChart data={chartData} innerRadius={50} outerRadius={110}>
          <RadialBar dataKey="visitors" />
        </RadialChart>
      </ChartContainer>
    </div>
  )
}

/**
 * Basic demo — minimal radial chart
 */
export function RadialChartBasicDemo() {
  return (
    <div className="w-full">
      <ChartContainer config={chartConfig} className="w-full">
        <RadialChart data={chartData} innerRadius={50} outerRadius={110}>
          <RadialBar dataKey="visitors" />
        </RadialChart>
      </ChartContainer>
    </div>
  )
}

/**
 * Label demo — radial chart with center label showing total
 */
export function RadialChartLabelDemo() {
  const total = chartData.reduce((sum, d) => sum + d.visitors, 0)

  return (
    <div className="w-full space-y-2">
      <div>
        <h4 className="text-sm font-medium">Total Visitors</h4>
        <p className="text-xs text-muted-foreground">With center label</p>
      </div>
      <ChartContainer config={chartConfig} className="w-full">
        <RadialChart data={chartData} innerRadius={60} outerRadius={110}>
          <RadialBar dataKey="visitors" />
          <RadialChartLabel>
            <tspan className="text-3xl font-bold" style="fill: var(--foreground)">
              {total}
            </tspan>
            <tspan className="text-xs text-muted-foreground" style="fill: var(--muted-foreground)">
              Visitors
            </tspan>
          </RadialChartLabel>
        </RadialChart>
      </ChartContainer>
    </div>
  )
}

/**
 * Stacked demo — half-circle radial chart
 */
export function RadialChartHalfDemo() {
  return (
    <div className="w-full space-y-2">
      <div>
        <h4 className="text-sm font-medium">Half Circle</h4>
        <p className="text-xs text-muted-foreground">Custom start and end angle</p>
      </div>
      <ChartContainer config={chartConfig} className="w-full">
        <RadialChart data={chartData} startAngle={180} endAngle={0} innerRadius={50} outerRadius={110}>
          <RadialBar dataKey="visitors" />
        </RadialChart>
      </ChartContainer>
    </div>
  )
}

/**
 * Interactive demo — signal-driven data switching
 */
export function RadialChartInteractiveDemo() {
  const fullData = chartData
  const topThree = chartData.slice(0, 3)
  const [showAll, setShowAll] = createSignal(true)

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Show:</span>
        <button
          className={`inline-flex items-center justify-center rounded-md text-sm font-medium h-8 px-3 ${
            showAll()
              ? 'bg-primary text-primary-foreground'
              : 'border border-input bg-background hover:bg-accent hover:text-accent-foreground'
          }`}
          onClick={() => setShowAll(true)}
        >
          All Browsers
        </button>
        <button
          className={`inline-flex items-center justify-center rounded-md text-sm font-medium h-8 px-3 ${
            !showAll()
              ? 'bg-primary text-primary-foreground'
              : 'border border-input bg-background hover:bg-accent hover:text-accent-foreground'
          }`}
          onClick={() => setShowAll(false)}
        >
          Top 3
        </button>
      </div>
      <ChartContainer config={chartConfig} className="w-full">
        <RadialChart data={showAll() ? fullData : topThree} innerRadius={50} outerRadius={110}>
          <RadialBar dataKey="visitors" />
        </RadialChart>
      </ChartContainer>
    </div>
  )
}
