/**
 * Line Chart Documentation Page
 */

import {
  LineChartPreviewDemo,
  LineChartBasicDemo,
  LineChartMultipleDemo,
  LineChartInteractiveDemo,
} from '@/components/line-chart-demo'
import { LineChartPlayground } from '@/components/line-chart-playground'
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
  { id: 'multiple', title: 'Multiple', branch: 'child' },
  { id: 'interactive', title: 'Interactive', branch: 'end' },
  { id: 'api-reference', title: 'API Reference' },
]

const usageCode = `"use client"

import type { ChartConfig } from "@barefootjs/chart"
import {
  ChartContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  ChartTooltip,
} from "@/components/ui/chart"

const chartConfig: ChartConfig = {
  desktop: { label: "Desktop", color: "hsl(221 83% 53%)" },
}

const chartData = [
  { month: "January", desktop: 186 },
  { month: "February", desktop: 305 },
  { month: "March", desktop: 237 },
  { month: "April", desktop: 73 },
  { month: "May", desktop: 209 },
  { month: "June", desktop: 214 },
]

export function MyLineChart() {
  return (
    <ChartContainer config={chartConfig} className="w-full">
      <LineChart data={chartData}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="month"
          tickFormatter={(v: string) => v.slice(0, 3)}
        />
        <YAxis />
        <ChartTooltip />
        <Line
          dataKey="desktop"
          stroke="var(--color-desktop)"
          type="monotone"
        />
      </LineChart>
    </ChartContainer>
  )
}`

const basicCode = `"use client"

import type { ChartConfig } from "@barefootjs/chart"

const chartConfig: ChartConfig = {
  desktop: { label: "Desktop", color: "hsl(221 83% 53%)" },
}

const chartData = [
  { month: "January", desktop: 186 },
  { month: "February", desktop: 305 },
  { month: "March", desktop: 237 },
  { month: "April", desktop: 73 },
  { month: "May", desktop: 209 },
  { month: "June", desktop: 214 },
]

export function LineChartBasicDemo() {
  return (
    <ChartContainer config={chartConfig} className="w-full">
      <LineChart data={chartData}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="month"
          tickFormatter={(v: string) => v.slice(0, 3)}
        />
        <YAxis />
        <Line
          dataKey="desktop"
          stroke="var(--color-desktop)"
          type="monotone"
        />
      </LineChart>
    </ChartContainer>
  )
}`

const multipleCode = `"use client"

import type { ChartConfig } from "@barefootjs/chart"

const chartConfig: ChartConfig = {
  desktop: { label: "Desktop", color: "hsl(221 83% 53%)" },
  mobile: { label: "Mobile", color: "hsl(280 65% 60%)" },
}

const chartData = [
  { month: "January", desktop: 186, mobile: 80 },
  { month: "February", desktop: 305, mobile: 200 },
  // ...
]

export function LineChartMultipleDemo() {
  return (
    <ChartContainer config={chartConfig} className="w-full">
      <LineChart data={chartData}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="month"
          tickFormatter={(v: string) => v.slice(0, 3)}
        />
        <YAxis />
        <ChartTooltip />
        <Line dataKey="desktop" stroke="var(--color-desktop)" type="monotone" />
        <Line dataKey="mobile" stroke="var(--color-mobile)" type="monotone" />
      </LineChart>
    </ChartContainer>
  )
}`

const interactiveCode = `"use client"

import { createSignal } from "@barefootjs/dom"
import type { ChartConfig } from "@barefootjs/chart"

const chartConfig: ChartConfig = {
  desktop: { label: "Desktop", color: "hsl(221 83% 53%)" },
  mobile: { label: "Mobile", color: "hsl(280 65% 60%)" },
}

export function LineChartInteractiveDemo() {
  const [category, setCategory] =
    createSignal<"desktop" | "mobile">("desktop")

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <button onClick={() => setCategory("desktop")}>
          Desktop
        </button>
        <button onClick={() => setCategory("mobile")}>
          Mobile
        </button>
      </div>
      <ChartContainer config={chartConfig} className="w-full">
        <LineChart data={chartData}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="month"
            tickFormatter={(v: string) => v.slice(0, 3)}
          />
          <YAxis />
          <ChartTooltip />
          <Line
            dataKey={category()}
            stroke={\\\`var(--color-\\\${category()})\\\`}
            type="monotone"
          />
        </LineChart>
      </ChartContainer>
    </div>
  )
}`

const lineChartProps: PropDefinition[] = [
  {
    name: 'data',
    type: 'Record<string, unknown>[]',
    description: 'Array of data objects. Each object represents one point on the X axis.',
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

const lineProps: PropDefinition[] = [
  {
    name: 'dataKey',
    type: 'string',
    description: 'The key in the data objects to use for line values.',
  },
  {
    name: 'stroke',
    type: 'string',
    defaultValue: 'currentColor',
    description: 'Stroke color for the line. Supports CSS variables like var(--color-desktop).',
  },
  {
    name: 'strokeWidth',
    type: 'number',
    defaultValue: '2',
    description: 'Width of the line stroke in pixels.',
  },
  {
    name: 'type',
    type: '"linear" | "monotone"',
    defaultValue: 'monotone',
    description: 'Curve interpolation type. "monotone" for smooth curves, "linear" for straight segments.',
  },
  {
    name: 'dot',
    type: 'boolean',
    defaultValue: 'true',
    description: 'Whether to show dots at data points.',
  },
]

const xAxisProps: PropDefinition[] = [
  {
    name: 'dataKey',
    type: 'string',
    description: 'The key in the data objects to use for X axis labels.',
  },
  {
    name: 'tickFormatter',
    type: '(value: string) => string',
    description: 'Custom formatter for tick labels.',
  },
  {
    name: 'hide',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Hide the X axis.',
  },
]

const yAxisProps: PropDefinition[] = [
  {
    name: 'tickFormatter',
    type: '(value: number) => string',
    description: 'Custom formatter for tick labels.',
  },
  {
    name: 'hide',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Hide the Y axis.',
  },
]

const cartesianGridProps: PropDefinition[] = [
  {
    name: 'vertical',
    type: 'boolean',
    defaultValue: 'true',
    description: 'Show vertical grid lines.',
  },
  {
    name: 'horizontal',
    type: 'boolean',
    defaultValue: 'true',
    description: 'Show horizontal grid lines.',
  },
]

const chartTooltipProps: PropDefinition[] = [
  {
    name: 'labelFormatter',
    type: '(label: string) => string',
    description: 'Custom formatter for the tooltip label.',
  },
]

export function LineChartRefPage() {
  return (
    <DocPage slug="line-chart" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Line Chart"
          description="A composable line chart built with SVG, D3 scales, and D3 shape."
          {...getChartNavLinks('line-chart')}
        />

        {/* Props Playground */}
        <LineChartPlayground />

        <Section id="installation" title="Installation">
          <PackageManagerTabs command="bun add @barefootjs/chart" />
        </Section>

        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <LineChartPreviewDemo />
          </Example>
        </Section>

        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="Basic" code={basicCode}>
              <LineChartBasicDemo />
            </Example>

            <Example title="Multiple" code={multipleCode}>
              <LineChartMultipleDemo />
            </Example>

            <Example title="Interactive" code={interactiveCode}>
              <LineChartInteractiveDemo />
            </Example>
          </div>
        </Section>

        <Section id="api-reference" title="API Reference">
          <div className="space-y-8">
            <div>
              <h3 className="text-lg font-semibold mb-4">LineChart</h3>
              <PropsTable props={lineChartProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">ChartContainer</h3>
              <PropsTable props={chartContainerProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">Line</h3>
              <PropsTable props={lineProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">XAxis</h3>
              <PropsTable props={xAxisProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">YAxis</h3>
              <PropsTable props={yAxisProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">CartesianGrid</h3>
              <PropsTable props={cartesianGridProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">ChartTooltip</h3>
              <PropsTable props={chartTooltipProps} />
            </div>
          </div>
        </Section>
      </div>
    </DocPage>
  )
}
