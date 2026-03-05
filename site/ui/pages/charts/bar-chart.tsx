/**
 * Bar Chart Documentation Page
 */

import {
  BarChartPreviewDemo,
  BarChartBasicDemo,
  BarChartMultipleDemo,
  BarChartInteractiveDemo,
} from '@/components/bar-chart-demo'
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
  { id: 'installation', title: 'Installation' },
  { id: 'examples', title: 'Examples' },
  { id: 'basic', title: 'Basic', branch: 'start' },
  { id: 'multiple', title: 'Multiple', branch: 'child' },
  { id: 'interactive', title: 'Interactive', branch: 'end' },
  { id: 'api-reference', title: 'API Reference' },
]

const previewCode = `"use client"

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

export function BarChartPreviewDemo() {
  return (
    <ChartContainer config={chartConfig} className="w-full">
      <BarChart data={chartData}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="month"
          tickFormatter={(v: string) => v.slice(0, 3)}
        />
        <YAxis />
        <ChartTooltip />
        <Bar
          dataKey="desktop"
          fill="var(--color-desktop)"
          radius={4}
        />
      </BarChart>
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

export function BarChartBasicDemo() {
  return (
    <ChartContainer config={chartConfig} className="w-full">
      <BarChart data={chartData}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="month"
          tickFormatter={(v: string) => v.slice(0, 3)}
        />
        <YAxis />
        <Bar
          dataKey="desktop"
          fill="var(--color-desktop)"
          radius={4}
        />
      </BarChart>
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

export function BarChartMultipleDemo() {
  return (
    <ChartContainer config={chartConfig} className="w-full">
      <BarChart data={chartData}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="month"
          tickFormatter={(v: string) => v.slice(0, 3)}
        />
        <YAxis />
        <ChartTooltip />
        <Bar dataKey="desktop" fill="var(--color-desktop)" radius={4} />
        <Bar dataKey="mobile" fill="var(--color-mobile)" radius={4} />
      </BarChart>
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

export function BarChartInteractiveDemo() {
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
        <BarChart data={chartData}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="month"
            tickFormatter={(v: string) => v.slice(0, 3)}
          />
          <YAxis />
          <ChartTooltip />
          <Bar
            dataKey={category()}
            fill={\\\`var(--color-\\\${category()})\\\`}
            radius={4}
          />
        </BarChart>
      </ChartContainer>
    </div>
  )
}`

const barChartProps: PropDefinition[] = [
  {
    name: 'data',
    type: 'Record<string, unknown>[]',
    description: 'Array of data objects. Each object represents one group on the X axis.',
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

const barProps: PropDefinition[] = [
  {
    name: 'dataKey',
    type: 'string',
    description: 'The key in the data objects to use for bar values.',
  },
  {
    name: 'fill',
    type: 'string',
    defaultValue: 'currentColor',
    description: 'Fill color for the bars. Supports CSS variables like var(--color-desktop).',
  },
  {
    name: 'radius',
    type: 'number',
    defaultValue: '0',
    description: 'Border radius for rounded bar corners.',
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

export function BarChartPage() {
  return (
    <DocPage slug="bar-chart" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Bar Chart"
          description="A composable bar chart built with SVG and D3 scales."
          {...getChartNavLinks('bar-chart')}
        />

        <Example title="" code={previewCode}>
          <BarChartPreviewDemo />
        </Example>

        <Section id="installation" title="Installation">
          <PackageManagerTabs command="bun add @barefootjs/chart" />
        </Section>

        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="Basic" code={basicCode}>
              <BarChartBasicDemo />
            </Example>

            <Example title="Multiple" code={multipleCode}>
              <BarChartMultipleDemo />
            </Example>

            <Example title="Interactive" code={interactiveCode}>
              <BarChartInteractiveDemo />
            </Example>
          </div>
        </Section>

        <Section id="api-reference" title="API Reference">
          <div className="space-y-8">
            <div>
              <h3 className="text-lg font-semibold mb-4">BarChart</h3>
              <PropsTable props={barChartProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">ChartContainer</h3>
              <PropsTable props={chartContainerProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">Bar</h3>
              <PropsTable props={barProps} />
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
