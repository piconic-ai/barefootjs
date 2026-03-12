"use client"

/**
 * Chart JSX Components
 *
 * "use client" wrappers that delegate to @barefootjs/chart init functions
 * via ref callbacks. Follows the Dialog pattern: ref runs during init,
 * before children's initChild calls, so provideContext/useContext works.
 */

import {
  initChartContainer as chartContainerInit,
  initBarChart as barChartInit,
  initBar as barInit,
  initAreaChart as areaChartInit,
  initArea as areaInit,
  initCartesianGrid as cartesianGridInit,
  initXAxis as xAxisInit,
  initYAxis as yAxisInit,
  initChartTooltip as chartTooltipInit,
  initAreaXAxis as areaXAxisInit,
  initAreaYAxis as areaYAxisInit,
  initAreaCartesianGrid as areaCartesianGridInit,
  initAreaChartTooltip as areaChartTooltipInit,
  initLineChart as lineChartInit,
  initLine as lineInit,
} from '@barefootjs/chart'

/** Color and label configuration for chart data series */
type ChartConfig = Record<string, { label: string; color: string }>

interface ChartContainerProps {
  config: ChartConfig
  className?: string
  children?: unknown
}

interface BarChartProps {
  data: Record<string, unknown>[]
  children?: unknown
}

interface BarProps {
  dataKey: string
  fill?: string
  radius?: number
}

interface CartesianGridProps {
  vertical?: boolean
  horizontal?: boolean
}

interface XAxisProps {
  dataKey: string
  tickFormatter?: (value: string) => string
  hide?: boolean
}

interface YAxisProps {
  hide?: boolean
  tickFormatter?: (value: number) => string
}

interface AreaChartProps {
  data: Record<string, unknown>[]
  children?: unknown
}

interface LineChartProps {
  data: Record<string, unknown>[]
  children?: unknown
}

interface AreaProps {
  dataKey: string
  fill?: string
  stroke?: string
  fillOpacity?: number
}

interface AreaCartesianGridProps {
  vertical?: boolean
  horizontal?: boolean
}

interface AreaXAxisProps {
  dataKey: string
  tickFormatter?: (value: string) => string
  hide?: boolean
}

interface AreaYAxisProps {
  hide?: boolean
  tickFormatter?: (value: number) => string
}

interface AreaChartTooltipProps {
  labelFormatter?: (label: string) => string
}

interface LineProps {
  dataKey: string
  stroke?: string
  strokeWidth?: number
  type?: 'linear' | 'monotone'
  dot?: boolean
}

interface ChartTooltipProps {
  labelFormatter?: (label: string) => string
}

function ChartContainer(props: ChartContainerProps) {
  const handleMount = (el: HTMLElement) => {
    chartContainerInit(el, props as unknown as Record<string, unknown>)
  }

  return (
    <div data-slot="chart-container" className={props.className ?? ''} ref={handleMount}>
      {props.children}
    </div>
  )
}

function BarChart(props: BarChartProps) {
  const handleMount = (el: HTMLElement) => {
    barChartInit(el, props as unknown as Record<string, unknown>)
  }

  return (
    <div data-slot="bar-chart" ref={handleMount}>
      {props.children}
    </div>
  )
}

function Bar(props: BarProps) {
  const handleMount = (el: HTMLElement) => {
    barInit(el, props as unknown as Record<string, unknown>)
  }

  return <span data-slot="bar" style="display:none" ref={handleMount} />
}

function CartesianGrid(props: CartesianGridProps) {
  const handleMount = (el: HTMLElement) => {
    cartesianGridInit(el, props as unknown as Record<string, unknown>)
  }

  return <span data-slot="cartesian-grid" style="display:none" ref={handleMount} />
}

function XAxis(props: XAxisProps) {
  const handleMount = (el: HTMLElement) => {
    xAxisInit(el, props as unknown as Record<string, unknown>)
  }

  return <span data-slot="x-axis" style="display:none" ref={handleMount} />
}

function YAxis(props: YAxisProps) {
  const handleMount = (el: HTMLElement) => {
    yAxisInit(el, props as unknown as Record<string, unknown>)
  }

  return <span data-slot="y-axis" style="display:none" ref={handleMount} />
}

function ChartTooltip(props: ChartTooltipProps) {
  const handleMount = (el: HTMLElement) => {
    chartTooltipInit(el, props as unknown as Record<string, unknown>)
  }

  return <span data-slot="chart-tooltip" style="display:none" ref={handleMount} />
}

function AreaChart(props: AreaChartProps) {
  const handleMount = (el: HTMLElement) => {
    areaChartInit(el, props as unknown as Record<string, unknown>)
  }

  return (
    <div data-slot="area-chart" ref={handleMount}>
      {props.children}
    </div>
  )
}

function Area(props: AreaProps) {
  const handleMount = (el: HTMLElement) => {
    areaInit(el, props as unknown as Record<string, unknown>)
  }

  return <span data-slot="area" style="display:none" ref={handleMount} />
}

function AreaCartesianGrid(props: AreaCartesianGridProps) {
  const handleMount = (el: HTMLElement) => {
    areaCartesianGridInit(el, props as unknown as Record<string, unknown>)
  }

  return <span data-slot="area-cartesian-grid" style="display:none" ref={handleMount} />
}

function AreaXAxis(props: AreaXAxisProps) {
  const handleMount = (el: HTMLElement) => {
    areaXAxisInit(el, props as unknown as Record<string, unknown>)
  }

  return <span data-slot="area-x-axis" style="display:none" ref={handleMount} />
}

function AreaYAxis(props: AreaYAxisProps) {
  const handleMount = (el: HTMLElement) => {
    areaYAxisInit(el, props as unknown as Record<string, unknown>)
  }

  return <span data-slot="area-y-axis" style="display:none" ref={handleMount} />
}

function AreaChartTooltip(props: AreaChartTooltipProps) {
  const handleMount = (el: HTMLElement) => {
    areaChartTooltipInit(el, props as unknown as Record<string, unknown>)
  }

  return <span data-slot="area-chart-tooltip" style="display:none" ref={handleMount} />
}

function LineChart(props: LineChartProps) {
  const handleMount = (el: HTMLElement) => {
    lineChartInit(el, props as unknown as Record<string, unknown>)
  }

  return (
    <div data-slot="line-chart" ref={handleMount}>
      {props.children}
    </div>
  )
}

function Line(props: LineProps) {
  const handleMount = (el: HTMLElement) => {
    lineInit(el, props as unknown as Record<string, unknown>)
  }

  return <span data-slot="line" style="display:none" ref={handleMount} />
}

export {
  ChartContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  LineChart,
  Line,
  CartesianGrid,
  AreaCartesianGrid,
  XAxis,
  AreaXAxis,
  YAxis,
  AreaYAxis,
  ChartTooltip,
  AreaChartTooltip,
}

export type {
  ChartContainerProps,
  BarChartProps,
  BarProps,
  AreaChartProps,
  AreaProps,
  AreaCartesianGridProps,
  AreaXAxisProps,
  AreaYAxisProps,
  AreaChartTooltipProps,
  LineChartProps,
  LineProps,
  CartesianGridProps,
  XAxisProps,
  YAxisProps,
  ChartTooltipProps,
}
