/**
 * Radar Chart Documentation Page
 */

import {
  RadarChartPreviewDemo,
  RadarChartBasicDemo,
  RadarChartMultipleDemo,
  RadarChartInteractiveDemo,
} from '@/components/radar-chart-demo'
import { RadarChartPlayground } from '@/components/radar-chart-playground'
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
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  RadarTooltip,
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

export function MyRadarChart() {
  return (
    <ChartContainer config={chartConfig} className="w-full">
      <RadarChart data={chartData}>
        <PolarGrid />
        <PolarAngleAxis
          dataKey="month"
          tickFormatter={(v: string) => v.slice(0, 3)}
        />
        <RadarTooltip />
        <Radar
          dataKey="desktop"
          fill="var(--color-desktop)"
          fillOpacity={0.6}
        />
      </RadarChart>
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

export function RadarChartBasicDemo() {
  return (
    <ChartContainer config={chartConfig} className="w-full">
      <RadarChart data={chartData}>
        <PolarGrid />
        <PolarAngleAxis
          dataKey="month"
          tickFormatter={(v: string) => v.slice(0, 3)}
        />
        <Radar
          dataKey="desktop"
          fill="var(--color-desktop)"
          fillOpacity={0.6}
        />
      </RadarChart>
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

export function RadarChartMultipleDemo() {
  return (
    <ChartContainer config={chartConfig} className="w-full">
      <RadarChart data={chartData}>
        <PolarGrid />
        <PolarAngleAxis
          dataKey="month"
          tickFormatter={(v: string) => v.slice(0, 3)}
        />
        <RadarTooltip />
        <Radar dataKey="desktop" fill="var(--color-desktop)" fillOpacity={0.4} />
        <Radar dataKey="mobile" fill="var(--color-mobile)" fillOpacity={0.4} />
      </RadarChart>
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

export function RadarChartInteractiveDemo() {
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
        <RadarChart data={chartData}>
          <PolarGrid />
          <PolarAngleAxis
            dataKey="month"
            tickFormatter={(v: string) => v.slice(0, 3)}
          />
          <RadarTooltip />
          <Radar
            dataKey={category()}
            fill={\\\`var(--color-\\\${category()})\\\`}
            fillOpacity={0.6}
          />
        </RadarChart>
      </ChartContainer>
    </div>
  )
}`

const radarChartProps: PropDefinition[] = [
  {
    name: 'data',
    type: 'Record<string, unknown>[]',
    description: 'Array of data objects. Each object represents one axis on the radar.',
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

const radarProps: PropDefinition[] = [
  {
    name: 'dataKey',
    type: 'string',
    description: 'The key in the data objects to use for radar values.',
  },
  {
    name: 'fill',
    type: 'string',
    defaultValue: 'currentColor',
    description: 'Fill color for the radar polygon. Supports CSS variables like var(--color-desktop).',
  },
  {
    name: 'fillOpacity',
    type: 'number',
    defaultValue: '0.6',
    description: 'Opacity of the radar polygon fill (0 to 1).',
  },
]

const polarGridProps: PropDefinition[] = [
  {
    name: 'gridType',
    type: "'polygon' | 'circle'",
    defaultValue: 'polygon',
    description: 'Shape of the concentric grid lines.',
  },
]

const polarAngleAxisProps: PropDefinition[] = [
  {
    name: 'dataKey',
    type: 'string',
    description: 'The key in the data objects to use for axis labels.',
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
    description: 'Hide the angle axis labels.',
  },
]

const radarTooltipProps: PropDefinition[] = [
  {
    name: 'labelFormatter',
    type: '(label: string) => string',
    description: 'Custom formatter for the tooltip label.',
  },
]

export function RadarChartRefPage() {
  return (
    <DocPage slug="radar-chart" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Radar Chart"
          description="A composable radar chart built with SVG and D3 scales."
          {...getChartNavLinks('radar-chart')}
        />

        {/* Props Playground */}
        <RadarChartPlayground />

        <Section id="installation" title="Installation">
          <PackageManagerTabs command="bun add @barefootjs/chart" />
        </Section>

        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <RadarChartPreviewDemo />
          </Example>
        </Section>

        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="Basic" code={basicCode}>
              <RadarChartBasicDemo />
            </Example>

            <Example title="Multiple" code={multipleCode}>
              <RadarChartMultipleDemo />
            </Example>

            <Example title="Interactive" code={interactiveCode}>
              <RadarChartInteractiveDemo />
            </Example>
          </div>
        </Section>

        <Section id="api-reference" title="API Reference">
          <div className="space-y-8">
            <div>
              <h3 className="text-lg font-semibold mb-4">RadarChart</h3>
              <PropsTable props={radarChartProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">ChartContainer</h3>
              <PropsTable props={chartContainerProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">Radar</h3>
              <PropsTable props={radarProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">PolarGrid</h3>
              <PropsTable props={polarGridProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">PolarAngleAxis</h3>
              <PropsTable props={polarAngleAxisProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">RadarTooltip</h3>
              <PropsTable props={radarTooltipProps} />
            </div>
          </div>
        </Section>
      </div>
    </DocPage>
  )
}
