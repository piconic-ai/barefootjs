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

/** Registration info for a radar series */
export interface RadarRegistration {
  dataKey: string
  fill: string
  fillOpacity: number
}

/** Props for RadarChart */
export interface RadarChartProps {
  data: Record<string, unknown>[]
  children?: unknown
}

/** Props for Radar */
export interface RadarProps {
  dataKey: string
  fill?: string
  fillOpacity?: number
}

/** Props for PolarGrid */
export interface PolarGridProps {
  gridType?: 'polygon' | 'circle'
  show?: boolean
}

/** Props for PolarAngleAxis */
export interface PolarAngleAxisProps {
  dataKey: string
  tickFormatter?: (value: string) => string
  hide?: boolean
}

/** Props for RadarTooltip */
export interface RadarTooltipProps {
  labelFormatter?: (label: string) => string
}

/** Context value shared between RadarChart and its children */
export interface RadarChartContextValue {
  svgGroup: () => SVGGElement | null
  container: () => HTMLElement | null
  data: () => Record<string, unknown>[]
  dataKey: () => string
  radius: () => number
  radialScale: () => ScaleLinear<number, number> | null
  config: () => ChartConfig
  radars: () => RadarRegistration[]
  registerRadar: (radar: RadarRegistration) => void
  unregisterRadar: (dataKey: string) => void
  setDataKey: (key: string) => void
}
