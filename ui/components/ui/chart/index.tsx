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
  initCartesianGrid as cartesianGridInit,
  initXAxis as xAxisInit,
  initYAxis as yAxisInit,
  initChartTooltip as chartTooltipInit,
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

export {
  ChartContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  ChartTooltip,
}

export type {
  ChartContainerProps,
  BarChartProps,
  BarProps,
  CartesianGridProps,
  XAxisProps,
  YAxisProps,
  ChartTooltipProps,
}
