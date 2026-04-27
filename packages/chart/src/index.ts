// Context types consumed by JSX-native chart containers and the imperative
// primitive `init*` callbacks until step 2 of the chart migration (#1080).
export { BarChartContext, RadialChartContext, RadarChartContext, PieChartContext, AreaChartContext, ChartConfigContext } from './context'

// Scale utilities used by JSX-native chart containers.
export { createBandScale, createLinearScale, createPointScale, createRadarRadialScale } from './utils/scales'

// Helper used by the JSX-native ChartContainer ref to project ChartConfig
// entries onto CSS custom properties.
export { applyChartCSSVariables } from './chart-container'

// Imperative `init*` callbacks for chart primitives. Containers (BarChart,
// AreaChart, LineChart, RadialChart, RadarChart, PieChart, ChartContainer)
// are now JSX-native and live in `ui/components/ui/chart/index.tsx`; the
// primitives below stay imperative until step 2 of #1080.
export { initBar } from './bar'
export { initArea } from './area'
export { initLine } from './line'
export { initCartesianGrid } from './cartesian-grid'
export { initXAxis } from './x-axis'
export { initYAxis } from './y-axis'
export { initChartTooltip } from './tooltip'
export { initRadialBar } from './radial-bar'
export { initRadialChartLabel } from './radial-chart-label'
export { initRadar } from './radar'
export { initPolarGrid } from './polar-grid'
export { initPolarAngleAxis } from './polar-angle-axis'
export { initRadarTooltip } from './radar-tooltip'
export { initPie } from './pie'
export { initPieTooltip } from './pie-tooltip'
export { initAreaXAxis } from './area-x-axis'
export { initAreaYAxis } from './area-y-axis'
export { initAreaCartesianGrid } from './area-cartesian-grid'
export { initAreaChartTooltip } from './area-tooltip'

// Type exports
export type {
  ChartConfig,
  BarRegistration,
  RadialBarRegistration,
  RadarRegistration,
  PieRegistration,
  AreaRegistration,
  ChartContainerProps,
  BarChartProps,
  BarProps,
  PieChartProps,
  PieProps,
  PieTooltipProps,
  AreaChartProps,
  AreaProps,
  LineChartProps,
  LineProps,
  CartesianGridProps,
  XAxisProps,
  YAxisProps,
  ChartTooltipProps,
  RadialChartProps,
  RadialBarProps,
  RadialChartLabelProps,
  RadarChartProps,
  RadarProps,
  PolarGridProps,
  PolarAngleAxisProps,
  RadarTooltipProps,
} from './types'
