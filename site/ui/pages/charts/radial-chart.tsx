/**
 * Radial Chart Documentation Page
 */

import {
  RadialChartPreviewDemo,
  RadialChartBasicDemo,
  RadialChartLabelDemo,
  RadialChartHalfDemo,
  RadialChartInteractiveDemo,
} from '@/components/radial-chart-demo'
import { RadialChartPlayground } from '@/components/radial-chart-playground'
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
  { id: 'label', title: 'Label', branch: 'child' },
  { id: 'half-circle', title: 'Half Circle', branch: 'child' },
  { id: 'interactive', title: 'Interactive', branch: 'end' },
  { id: 'api-reference', title: 'API Reference' },
]

const usageCode = `"use client"

import type { ChartConfig } from "@barefootjs/chart"
import {
  ChartContainer,
  RadialChart,
  RadialBar,
} from "@/components/ui/chart"

const chartConfig: ChartConfig = {
  safari: { label: "Safari", color: "hsl(221 83% 53%)" },
  chrome: { label: "Chrome", color: "hsl(142 76% 36%)" },
  firefox: { label: "Firefox", color: "hsl(38 92% 50%)" },
  edge: { label: "Edge", color: "hsl(280 65% 60%)" },
  other: { label: "Other", color: "hsl(340 75% 55%)" },
}

const chartData = [
  { browser: "safari", visitors: 200, fill: "var(--color-safari)" },
  { browser: "chrome", visitors: 275, fill: "var(--color-chrome)" },
  { browser: "firefox", visitors: 187, fill: "var(--color-firefox)" },
  { browser: "edge", visitors: 173, fill: "var(--color-edge)" },
  { browser: "other", visitors: 90, fill: "var(--color-other)" },
]

export function MyRadialChart() {
  return (
    <ChartContainer config={chartConfig} className="w-full">
      <RadialChart
        data={chartData}
        innerRadius={50}
        outerRadius={110}
      >
        <RadialBar dataKey="visitors" />
      </RadialChart>
    </ChartContainer>
  )
}`

const basicCode = `"use client"

import type { ChartConfig } from "@barefootjs/chart"

const chartConfig: ChartConfig = {
  safari: { label: "Safari", color: "hsl(221 83% 53%)" },
  chrome: { label: "Chrome", color: "hsl(142 76% 36%)" },
  // ...
}

const chartData = [
  { browser: "safari", visitors: 200, fill: "var(--color-safari)" },
  { browser: "chrome", visitors: 275, fill: "var(--color-chrome)" },
  // ...
]

export function RadialChartBasicDemo() {
  return (
    <ChartContainer config={chartConfig} className="w-full">
      <RadialChart data={chartData} innerRadius={50} outerRadius={110}>
        <RadialBar dataKey="visitors" />
      </RadialChart>
    </ChartContainer>
  )
}`

const labelCode = `"use client"

import {
  ChartContainer,
  RadialChart,
  RadialBar,
  RadialChartLabel,
} from "@/components/ui/chart"

export function RadialChartLabelDemo() {
  const total = chartData.reduce((sum, d) => sum + d.visitors, 0)

  return (
    <ChartContainer config={chartConfig} className="w-full">
      <RadialChart data={chartData} innerRadius={60} outerRadius={110}>
        <RadialBar dataKey="visitors" />
        <RadialChartLabel>
          <tspan className="text-3xl font-bold">{total}</tspan>
          <tspan className="text-xs">Visitors</tspan>
        </RadialChartLabel>
      </RadialChart>
    </ChartContainer>
  )
}`

const halfCode = `"use client"

export function RadialChartHalfDemo() {
  return (
    <ChartContainer config={chartConfig} className="w-full">
      <RadialChart
        data={chartData}
        startAngle={180}
        endAngle={0}
        innerRadius={50}
        outerRadius={110}
      >
        <RadialBar dataKey="visitors" />
      </RadialChart>
    </ChartContainer>
  )
}`

const interactiveCode = `"use client"

import { createSignal } from "@barefootjs/dom"

export function RadialChartInteractiveDemo() {
  const [showAll, setShowAll] = createSignal(true)

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <button onClick={() => setShowAll(true)}>
          All Browsers
        </button>
        <button onClick={() => setShowAll(false)}>
          Top 3
        </button>
      </div>
      <ChartContainer config={chartConfig} className="w-full">
        <RadialChart
          data={showAll() ? fullData : topThree}
          innerRadius={50}
          outerRadius={110}
        >
          <RadialBar dataKey="visitors" />
        </RadialChart>
      </ChartContainer>
    </div>
  )
}`

const radialChartProps: PropDefinition[] = [
  {
    name: 'data',
    type: 'Record<string, unknown>[]',
    description: 'Array of data objects. Each object represents one ring in the radial chart.',
  },
  {
    name: 'innerRadius',
    type: 'number',
    defaultValue: '40% of max',
    description: 'Inner radius of the radial chart in pixels.',
  },
  {
    name: 'outerRadius',
    type: 'number',
    defaultValue: 'auto',
    description: 'Outer radius of the radial chart in pixels.',
  },
  {
    name: 'startAngle',
    type: 'number',
    defaultValue: '0',
    description: 'Start angle in degrees (0 = top, clockwise).',
  },
  {
    name: 'endAngle',
    type: 'number',
    defaultValue: '360',
    description: 'End angle in degrees.',
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

const radialBarProps: PropDefinition[] = [
  {
    name: 'dataKey',
    type: 'string',
    description: 'The key in the data objects to use for arc values.',
  },
  {
    name: 'fill',
    type: 'string',
    defaultValue: 'currentColor',
    description: 'Fill color for the arcs. Each data item can override with its own fill property.',
  },
]

const radialChartLabelProps: PropDefinition[] = [
  {
    name: 'children',
    type: 'ReactNode',
    description: 'Content to display in the center of the radial chart.',
  },
]

export function RadialChartRefPage() {
  return (
    <DocPage slug="radial-chart" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Radial Chart"
          description="A composable radial bar chart built with SVG and D3 scales."
          {...getChartNavLinks('radial-chart')}
        />

        {/* Props Playground */}
        <RadialChartPlayground />

        <Section id="installation" title="Installation">
          <PackageManagerTabs command="bun add @barefootjs/chart" />
        </Section>

        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <RadialChartPreviewDemo />
          </Example>
        </Section>

        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="Basic" code={basicCode}>
              <RadialChartBasicDemo />
            </Example>

            <Example title="Label" code={labelCode}>
              <RadialChartLabelDemo />
            </Example>

            <Example title="Half Circle" code={halfCode}>
              <RadialChartHalfDemo />
            </Example>

            <Example title="Interactive" code={interactiveCode}>
              <RadialChartInteractiveDemo />
            </Example>
          </div>
        </Section>

        <Section id="api-reference" title="API Reference">
          <div className="space-y-8">
            <div>
              <h3 className="text-lg font-semibold mb-4">RadialChart</h3>
              <PropsTable props={radialChartProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">ChartContainer</h3>
              <PropsTable props={chartContainerProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">RadialBar</h3>
              <PropsTable props={radialBarProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">RadialChartLabel</h3>
              <PropsTable props={radialChartLabelProps} />
            </div>
          </div>
        </Section>
      </div>
    </DocPage>
  )
}
