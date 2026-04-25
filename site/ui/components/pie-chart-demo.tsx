"use client"
/**
 * PieChartDemo Components
 *
 * Interactive demos for the Pie Chart component.
 * Uses JSX component API with @barefootjs/chart.
 */

import { createSignal } from '@barefootjs/client'
import type { ChartConfig } from '@barefootjs/chart'
import {
  ChartContainer,
  PieChart,
  Pie,
  PieTooltip,
} from '@ui/components/ui/chart'

const chartConfig: ChartConfig = {
  done: { label: 'Done', color: 'hsl(220 14% 30%)' },
  inProgress: { label: 'In Progress', color: 'hsl(220 14% 50%)' },
  todo: { label: 'To Do', color: 'hsl(220 14% 70%)' },
  backlog: { label: 'Backlog', color: 'hsl(220 14% 85%)' },
}

const chartData = [
  { status: 'done', tasks: 42 },
  { status: 'inProgress', tasks: 18 },
  { status: 'todo', tasks: 25 },
  { status: 'backlog', tasks: 15 },
]

/**
 * Preview demo — task status pie chart
 */
export function PieChartPreviewDemo() {
  return (
    <div className="w-full space-y-2">
      <div>
        <h4 className="text-sm font-medium">Task Status</h4>
        <p className="text-xs text-muted-foreground">Current Sprint</p>
      </div>
      <ChartContainer config={chartConfig} className="w-full max-w-[400px] mx-auto">
        <PieChart data={chartData}>
          <PieTooltip />
          <Pie dataKey="tasks" nameKey="status" />
        </PieChart>
      </ChartContainer>
    </div>
  )
}

/**
 * Basic demo — minimal pie chart
 */
export function PieChartBasicDemo() {
  return (
    <div className="w-full">
      <ChartContainer config={chartConfig} className="w-full max-w-[400px] mx-auto">
        <PieChart data={chartData}>
          <Pie dataKey="tasks" nameKey="status" />
        </PieChart>
      </ChartContainer>
    </div>
  )
}

/**
 * Donut demo — pie chart with inner radius
 */
export function PieChartDonutDemo() {
  return (
    <div className="w-full space-y-2">
      <div className="flex items-center gap-4 flex-wrap">
        {Object.entries(chartConfig).map(([key, cfg]) => (
          <div key={key} className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm" style={`background:${cfg.color}`} />
            <span className="text-xs text-muted-foreground">{cfg.label}</span>
          </div>
        ))}
      </div>
      <ChartContainer config={chartConfig} className="w-full max-w-[400px] mx-auto">
        <PieChart data={chartData}>
          <PieTooltip />
          <Pie dataKey="tasks" nameKey="status" innerRadius={0.4} />
        </PieChart>
      </ChartContainer>
    </div>
  )
}

/**
 * Interactive demo — signal-driven metric switching
 */
export function PieChartInteractiveDemo() {
  const interactiveData = [
    { status: 'done', tasks: 42, points: 68 },
    { status: 'inProgress', tasks: 18, points: 32 },
    { status: 'todo', tasks: 25, points: 40 },
    { status: 'backlog', tasks: 15, points: 20 },
  ]

  const [metric, setMetric] = createSignal<'tasks' | 'points'>('tasks')

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Metric:</span>
        <button
          className={`inline-flex items-center justify-center rounded-md text-sm font-medium h-8 px-3 ${
            metric() === 'tasks'
              ? 'bg-primary text-primary-foreground'
              : 'border border-input bg-background hover:bg-accent hover:text-accent-foreground'
          }`}
          onClick={() => setMetric('tasks')}
        >
          Tasks
        </button>
        <button
          className={`inline-flex items-center justify-center rounded-md text-sm font-medium h-8 px-3 ${
            metric() === 'points'
              ? 'bg-primary text-primary-foreground'
              : 'border border-input bg-background hover:bg-accent hover:text-accent-foreground'
          }`}
          onClick={() => setMetric('points')}
        >
          Points
        </button>
      </div>
      <ChartContainer config={chartConfig} className="w-full max-w-[400px] mx-auto">
        <PieChart data={interactiveData}>
          <PieTooltip />
          <Pie dataKey={metric()} nameKey="status" innerRadius={0.3} paddingAngle={2} />
        </PieChart>
      </ChartContainer>
    </div>
  )
}
