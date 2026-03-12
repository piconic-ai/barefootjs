import type { ScaleBand, ScaleLinear, ScalePoint } from 'd3-scale'

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

/** Props for LineChart */
export interface LineChartProps {
  data: Record<string, unknown>[]
  children?: unknown
}

/** Props for Line */
export interface LineProps {
  dataKey: string
  stroke?: string
  strokeWidth?: number
  type?: 'linear' | 'monotone'
  dot?: boolean
}

/** Props for ChartTooltip */
export interface ChartTooltipProps {
  labelFormatter?: (label: string) => string
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

/** Registration info for an area series */
export interface AreaRegistration {
  dataKey: string
  fill: string
  stroke: string
  fillOpacity: number
}

/** Props for AreaChart */
export interface AreaChartProps {
  data: Record<string, unknown>[]
  children?: unknown
}

/** Props for Area */
export interface AreaProps {
  dataKey: string
  fill?: string
  stroke?: string
  fillOpacity?: number
}

/** Context value shared between AreaChart and its children */
export interface AreaChartContextValue {
  svgGroup: () => SVGGElement | null
  container: () => HTMLElement | null
  data: () => Record<string, unknown>[]
  xDataKey: () => string
  xScale: () => ScalePoint<string> | null
  yScale: () => ScaleLinear<number, number> | null
  innerWidth: () => number
  innerHeight: () => number
  config: () => ChartConfig
  areas: () => AreaRegistration[]
  registerArea: (area: AreaRegistration) => void
  unregisterArea: (dataKey: string) => void
  setXDataKey: (key: string) => void
}
