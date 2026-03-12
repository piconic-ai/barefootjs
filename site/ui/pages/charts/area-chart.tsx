/**
 * Area Chart Documentation Page
 */

import {
  AreaChartPreviewDemo,
  AreaChartBasicDemo,
  AreaChartMultipleDemo,
  AreaChartInteractiveDemo,
} from '@/components/area-chart-demo'
import { AreaChartPlayground } from '@/components/area-chart-playground'
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
  AreaChart,
  Area,
  AreaCartesianGrid,
  AreaXAxis,
  AreaYAxis,
  AreaChartTooltip,
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

export function MyAreaChart() {
  return (
    <ChartContainer config={chartConfig} className="w-full">
      <AreaChart data={chartData}>
        <AreaCartesianGrid vertical={false} />
        <AreaXAxis
          dataKey="month"
          tickFormatter={(v: string) => v.slice(0, 3)}
        />
        <AreaYAxis />
        <AreaChartTooltip />
        <Area
          dataKey="desktop"
          fill="var(--color-desktop)"
          stroke="var(--color-desktop)"
        />
      </AreaChart>
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

export function AreaChartBasicDemo() {
  return (
    <ChartContainer config={chartConfig} className="w-full">
      <AreaChart data={chartData}>
        <AreaCartesianGrid vertical={false} />
        <AreaXAxis
          dataKey="month"
          tickFormatter={(v: string) => v.slice(0, 3)}
        />
        <AreaYAxis />
        <Area
          dataKey="desktop"
          fill="var(--color-desktop)"
          stroke="var(--color-desktop)"
        />
      </AreaChart>
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

export function AreaChartMultipleDemo() {
  return (
    <ChartContainer config={chartConfig} className="w-full">
      <AreaChart data={chartData}>
        <AreaCartesianGrid vertical={false} />
        <AreaXAxis
          dataKey="month"
          tickFormatter={(v: string) => v.slice(0, 3)}
        />
        <AreaYAxis />
        <AreaChartTooltip />
        <Area dataKey="desktop" fill="var(--color-desktop)" stroke="var(--color-desktop)" />
        <Area dataKey="mobile" fill="var(--color-mobile)" stroke="var(--color-mobile)" />
      </AreaChart>
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

export function AreaChartInteractiveDemo() {
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
        <AreaChart data={chartData}>
          <AreaCartesianGrid vertical={false} />
          <AreaXAxis
            dataKey="month"
            tickFormatter={(v: string) => v.slice(0, 3)}
          />
          <AreaYAxis />
          <AreaChartTooltip />
          <Area
            dataKey={category()}
            fill={\\\`var(--color-\\\${category()})\\\`}
            stroke={\\\`var(--color-\\\${category()})\\\`}
          />
        </AreaChart>
      </ChartContainer>
    </div>
  )
}`

const areaChartProps: PropDefinition[] = [
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

const areaProps: PropDefinition[] = [
  {
    name: 'dataKey',
    type: 'string',
    description: 'The key in the data objects to use for area values.',
  },
  {
    name: 'fill',
    type: 'string',
    defaultValue: 'currentColor',
    description: 'Fill color for the area. Supports CSS variables like var(--color-desktop).',
  },
  {
    name: 'stroke',
    type: 'string',
    defaultValue: 'fill value',
    description: 'Stroke color for the area line.',
  },
  {
    name: 'fillOpacity',
    type: 'number',
    defaultValue: '0.2',
    description: 'Opacity of the filled area (0–1).',
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

export function AreaChartRefPage() {
  return (
    <DocPage slug="area-chart" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Area Chart"
          description="A composable area chart built with SVG, D3 scales, and d3-shape."
          {...getChartNavLinks('area-chart')}
        />

        {/* Props Playground */}
        <AreaChartPlayground />

        <Section id="installation" title="Installation">
          <PackageManagerTabs command="bun add @barefootjs/chart" />
        </Section>

        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <AreaChartPreviewDemo />
          </Example>
        </Section>

        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="Basic" code={basicCode}>
              <AreaChartBasicDemo />
            </Example>

            <Example title="Multiple" code={multipleCode}>
              <AreaChartMultipleDemo />
            </Example>

            <Example title="Interactive" code={interactiveCode}>
              <AreaChartInteractiveDemo />
            </Example>
          </div>
        </Section>

        <Section id="api-reference" title="API Reference">
          <div className="space-y-8">
            <div>
              <h3 className="text-lg font-semibold mb-4">AreaChart</h3>
              <PropsTable props={areaChartProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">ChartContainer</h3>
              <PropsTable props={chartContainerProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">Area</h3>
              <PropsTable props={areaProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">AreaXAxis</h3>
              <PropsTable props={xAxisProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">AreaYAxis</h3>
              <PropsTable props={yAxisProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">AreaCartesianGrid</h3>
              <PropsTable props={cartesianGridProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">AreaChartTooltip</h3>
              <PropsTable props={chartTooltipProps} />
            </div>
          </div>
        </Section>
      </div>
    </DocPage>
  )
}
