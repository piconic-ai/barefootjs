// Export context for JSX wrapper components
export { BarChartContext, RadarChartContext, ChartConfigContext } from './context'

// Export init functions for JSX wrapper ref callbacks
export { applyChartCSSVariables, initChartContainer } from './chart-container'
export { initBarChart } from './bar-chart'
export { initBar } from './bar'
export { initCartesianGrid } from './cartesian-grid'
export { initXAxis } from './x-axis'
export { initYAxis } from './y-axis'
export { initChartTooltip } from './tooltip'
export { initRadarChart } from './radar-chart'
export { initRadar } from './radar'
export { initPolarGrid } from './polar-grid'
export { initPolarAngleAxis } from './polar-angle-axis'
export { initRadarTooltip } from './radar-tooltip'

// Type exports
export type {
  ChartConfig,
  BarRegistration,
  RadarRegistration,
  ChartContainerProps,
  BarChartProps,
  BarProps,
  CartesianGridProps,
  XAxisProps,
  YAxisProps,
  ChartTooltipProps,
  RadarChartProps,
  RadarProps,
  PolarGridProps,
  PolarAngleAxisProps,
  RadarTooltipProps,
} from './types'
