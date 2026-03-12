import type { ScaleBand, ScaleLinear } from 'd3-scale'

/** Color and label configuration for chart data series */
export type ChartConfig = Record<
  string,
  {
    label: string
    color: string
  }
>

/** Registration info for a bar series */
export interface BarRegistration {
  dataKey: string
  fill: string
  radius: number
}

/** Props for ChartContainer */
export interface ChartContainerProps {
  config: ChartConfig
  className?: string
  children?: unknown
}

/** Props for BarChart */
export interface BarChartProps {
  data: Record<string, unknown>[]
  children?: unknown
}

/** Props for Bar */
export interface BarProps {
  dataKey: string
  fill?: string
  radius?: number
}

/** Props for CartesianGrid */
export interface CartesianGridProps {
  vertical?: boolean
  horizontal?: boolean
}

/** Props for XAxis */
export interface XAxisProps {
  dataKey: string
  tickFormatter?: (value: string) => string
  hide?: boolean
}

/** Props for YAxis */
export interface YAxisProps {
  hide?: boolean
  tickFormatter?: (value: number) => string
}

/** Props for ChartTooltip */
export interface ChartTooltipProps {
  labelFormatter?: (label: string) => string
}

/** Registration info for a radial bar series */
export interface RadialBarRegistration {
  dataKey: string
  fill: string
}

/** Props for RadialChart */
export interface RadialChartProps {
  data: Record<string, unknown>[]
  innerRadius?: number
  outerRadius?: number
  startAngle?: number
  endAngle?: number
  children?: unknown
}

/** Props for RadialBar */
export interface RadialBarProps {
  dataKey: string
  fill?: string
  stackId?: string
}

/** Props for RadialChartLabel */
export interface RadialChartLabelProps {
  children?: unknown
}

/** Context value shared between RadialChart and its children */
export interface RadialChartContextValue {
  svgGroup: () => SVGGElement | null
  container: () => HTMLElement | null
  data: () => Record<string, unknown>[]
  innerRadius: () => number
  outerRadius: () => number
  startAngle: () => number
  endAngle: () => number
  config: () => ChartConfig
  centerX: () => number
  centerY: () => number
  radialBars: () => RadialBarRegistration[]
  registerRadialBar: (bar: RadialBarRegistration) => void
  unregisterRadialBar: (dataKey: string) => void
}

/** Context value shared between BarChart and its children */
export interface BarChartContextValue {
  svgGroup: () => SVGGElement | null
  container: () => HTMLElement | null
  data: () => Record<string, unknown>[]
  xDataKey: () => string
  xScale: () => ScaleBand<string> | null
  yScale: () => ScaleLinear<number, number> | null
  innerWidth: () => number
  innerHeight: () => number
  config: () => ChartConfig
  bars: () => BarRegistration[]
  registerBar: (bar: BarRegistration) => void
  unregisterBar: (dataKey: string) => void
  setXDataKey: (key: string) => void
}
