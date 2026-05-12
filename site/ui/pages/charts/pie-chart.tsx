/**
 * Pie Chart Documentation Page
 */

import {
  PieChartPreviewDemo,
  PieChartBasicDemo,
  PieChartDonutDemo,
  PieChartInteractiveDemo,
  PieChartAnimatedDemo,
} from '@/components/pie-chart-demo'
import { PieChartPlayground } from '@/components/pie-chart-playground'
import {
  DocPage,
  PageHeader,
  Section,
  Example,
  PropsTable,
  PackageManagerTabs,
  type PropDefinition,
  type TocItem,
} from '../../components/shared/docs'
import { getChartNavLinks } from '../../components/shared/PageNavigation'

const tocItems: TocItem[] = [
  { id: 'preview', title: 'Preview' },
  { id: 'installation', title: 'Installation' },
  { id: 'usage', title: 'Usage' },
  { id: 'examples', title: 'Examples' },
  { id: 'basic', title: 'Basic', branch: 'start' },
  { id: 'donut', title: 'Donut', branch: 'child' },
  { id: 'interactive', title: 'Interactive', branch: 'child' },
  { id: 'animated', title: 'Animated', branch: 'end' },
  { id: 'api-reference', title: 'API Reference' },
]

const usageCode = `"use client"

import type { ChartConfig } from "@barefootjs/chart"
import {
  ChartContainer,
  PieChart,
  Pie,
  PieTooltip,
} from "@/components/ui/chart"

const chartConfig: ChartConfig = {
  done: { label: "Done", color: "hsl(220 14% 30%)" },
  inProgress: { label: "In Progress", color: "hsl(220 14% 50%)" },
  todo: { label: "To Do", color: "hsl(220 14% 70%)" },
  backlog: { label: "Backlog", color: "hsl(220 14% 85%)" },
}

const chartData = [
  { status: "done", tasks: 42 },
  { status: "inProgress", tasks: 18 },
  { status: "todo", tasks: 25 },
  { status: "backlog", tasks: 15 },
]

export function MyPieChart() {
  return (
    <ChartContainer config={chartConfig} className="w-full">
      <PieChart data={chartData}>
        <PieTooltip />
        <Pie dataKey="tasks" nameKey="status" />
      </PieChart>
    </ChartContainer>
  )
}`

const basicCode = `"use client"

import type { ChartConfig } from "@barefootjs/chart"

const chartConfig: ChartConfig = {
  done: { label: "Done", color: "hsl(220 14% 30%)" },
  inProgress: { label: "In Progress", color: "hsl(220 14% 50%)" },
  todo: { label: "To Do", color: "hsl(220 14% 70%)" },
  backlog: { label: "Backlog", color: "hsl(220 14% 85%)" },
}

const chartData = [
  { status: "done", tasks: 42 },
  { status: "inProgress", tasks: 18 },
  { status: "todo", tasks: 25 },
  { status: "backlog", tasks: 15 },
]

export function PieChartBasicDemo() {
  return (
    <ChartContainer config={chartConfig} className="w-full">
      <PieChart data={chartData}>
        <Pie dataKey="tasks" nameKey="status" />
      </PieChart>
    </ChartContainer>
  )
}`

const donutCode = `"use client"

import type { ChartConfig } from "@barefootjs/chart"

const chartConfig: ChartConfig = {
  done: { label: "Done", color: "hsl(220 14% 30%)" },
  inProgress: { label: "In Progress", color: "hsl(220 14% 50%)" },
  // ...
}

export function PieChartDonutDemo() {
  return (
    <ChartContainer config={chartConfig} className="w-full">
      <PieChart data={chartData}>
        <PieTooltip />
        <Pie
          dataKey="tasks"
          nameKey="status"
          innerRadius={0.4}
        />
      </PieChart>
    </ChartContainer>
  )
}`

const interactiveCode = `"use client"

import { createSignal } from "@barefootjs/client"
import type { ChartConfig } from "@barefootjs/chart"

const chartConfig: ChartConfig = {
  done: { label: "Done", color: "hsl(220 14% 30%)" },
  inProgress: { label: "In Progress", color: "hsl(220 14% 50%)" },
  // ...
}

const interactiveData = [
  { status: "done", tasks: 42, points: 68 },
  { status: "inProgress", tasks: 18, points: 32 },
  // ...
]

export function PieChartInteractiveDemo() {
  const [metric, setMetric] =
    createSignal<"tasks" | "points">("tasks")

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <button onClick={() => setMetric("tasks")}>
          Tasks
        </button>
        <button onClick={() => setMetric("points")}>
          Points
        </button>
      </div>
      <ChartContainer config={chartConfig} className="w-full">
        <PieChart data={interactiveData}>
          <PieTooltip />
          <Pie
            dataKey={metric()}
            nameKey="status"
            innerRadius={0.3}
            paddingAngle={2}
          />
        </PieChart>
      </ChartContainer>
    </div>
  )
}`

const animatedCode = `"use client"

import { createSignal, createEffect, onCleanup } from "@barefootjs/client"
import { buildPieSlices } from "@barefootjs/chart"

const DURATION = 1200
const DASH = 800

export function PieChartAnimatedDemo() {
  const [animating, setAnimating] = createSignal(false)
  const [progress, setProgress] = createSignal(1)

  const slices = buildPieSlices(
    chartData, "tasks", "status", chartConfig,
    400, 400, 0.3, 0.85, 2,
  )

  createEffect(() => {
    if (!animating()) return
    setProgress(0)
    const start = performance.now()
    let frame = 0
    const tick = (now) => {
      const t = Math.min(1, (now - start) / DURATION)
      setProgress(t)
      if (t < 1) frame = requestAnimationFrame(tick)
      else setAnimating(false)
    }
    frame = requestAnimationFrame(tick)
    onCleanup(() => cancelAnimationFrame(frame))
  })

  return (
    <div>
      <button
        onClick={() => setAnimating(true)}
        disabled={animating()}
      >
        {animating() ? "Animating…" : "Animate"}
      </button>
      <svg viewBox="0 0 400 400">
        <g transform="translate(200,200)">
          {slices.map((s) => (
            <path
              key={s.name}
              d={s.d}
              fill={s.fill}
              stroke-dasharray={String(DASH)}
              stroke-dashoffset={String(DASH * (1 - progress()))}
            />
          ))}
        </g>
      </svg>
    </div>
  )
}`

const pieChartProps: PropDefinition[] = [
  {
    name: 'data',
    type: 'Record<string, unknown>[]',
    description: 'Array of data objects. Each object represents one slice of the pie.',
  },
]

const chartContainerProps: PropDefinition[] = [
  {
    name: 'config',
    type: 'ChartConfig',
    description: 'Maps each data key to a label and color. Sets CSS variables for theming.',
  },
  {
    name: 'className',
    type: 'string',
    description: 'Additional CSS class names for the container element.',
  },
]

const pieProps: PropDefinition[] = [
  {
    name: 'dataKey',
    type: 'string',
    description: 'The key in the data objects to use for slice values.',
  },
  {
    name: 'nameKey',
    type: 'string',
    defaultValue: 'name',
    description: 'The key in the data objects to use for slice names (matches config keys).',
  },
  {
    name: 'innerRadius',
    type: 'number',
    defaultValue: '0',
    description: 'Inner radius ratio (0-1). Set > 0 for a donut chart.',
  },
  {
    name: 'outerRadius',
    type: 'number',
    defaultValue: '0.8',
    description: 'Outer radius ratio (0-1).',
  },
  {
    name: 'paddingAngle',
    type: 'number',
    defaultValue: '0',
    description: 'Padding angle between slices in degrees.',
  },
]

const pieTooltipProps: PropDefinition[] = [
  {
    name: 'labelFormatter',
    type: '(label: string) => string',
    description: 'Custom formatter for the tooltip label.',
  },
]

export function PieChartRefPage() {
  return (
    <DocPage slug="pie-chart" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Pie Chart"
          description="A composable pie chart built with SVG and D3 shapes."
          {...getChartNavLinks('pie-chart')}
        />

        {/* Props Playground */}
        <PieChartPlayground />

        <Section id="installation" title="Installation">
          <PackageManagerTabs command="bun add @barefootjs/chart" />
        </Section>

        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <PieChartPreviewDemo />
          </Example>
        </Section>

        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="Basic" code={basicCode}>
              <PieChartBasicDemo />
            </Example>

            <Example title="Donut" code={donutCode}>
              <PieChartDonutDemo />
            </Example>

            <Example title="Interactive" code={interactiveCode}>
              <PieChartInteractiveDemo />
            </Example>

            <Example title="Animated" code={animatedCode}>
              <PieChartAnimatedDemo />
            </Example>
          </div>
        </Section>

        <Section id="api-reference" title="API Reference">
          <div className="space-y-8">
            <div>
              <h3 className="text-lg font-semibold mb-4">PieChart</h3>
              <PropsTable props={pieChartProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">ChartContainer</h3>
              <PropsTable props={chartContainerProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">Pie</h3>
              <PropsTable props={pieProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">PieTooltip</h3>
              <PropsTable props={pieTooltipProps} />
            </div>
          </div>
        </Section>
      </div>
    </DocPage>
  )
}
