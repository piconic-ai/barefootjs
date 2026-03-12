// Export context for JSX wrapper components
export { BarChartContext, AreaChartContext, ChartConfigContext } from './context'

// Export init functions for JSX wrapper ref callbacks
export { applyChartCSSVariables, initChartContainer } from './chart-container'
export { initBarChart } from './bar-chart'
export { initBar } from './bar'
export { initAreaChart } from './area-chart'
export { initArea } from './area'
export { initLineChart } from './line-chart'
export { initLine } from './line'
export { initCartesianGrid } from './cartesian-grid'
export { initXAxis } from './x-axis'
export { initYAxis } from './y-axis'
export { initChartTooltip } from './tooltip'
export { initAreaXAxis } from './area-x-axis'
export { initAreaYAxis } from './area-y-axis'
export { initAreaCartesianGrid } from './area-cartesian-grid'
export { initAreaChartTooltip } from './area-tooltip'

// Type exports
export type {
  ChartConfig,
  BarRegistration,
  AreaRegistration,
  ChartContainerProps,
  BarChartProps,
  BarProps,
  AreaChartProps,
  AreaProps,
  LineChartProps,
  LineProps,
  CartesianGridProps,
  XAxisProps,
  YAxisProps,
  ChartTooltipProps,
} from './types'
