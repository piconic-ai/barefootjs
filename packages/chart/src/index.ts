// Context types consumed by JSX-native chart containers and primitives.
export { BarChartContext, RadialChartContext, RadarChartContext, PieChartContext, AreaChartContext, ChartConfigContext } from './context'

// Scale utilities used by JSX-native chart containers.
export { createBandScale, createLinearScale, createPointScale, createRadarRadialScale } from './utils/scales'

// Arc geometry helpers for JSX-native radial primitives. d3-shape stays
// inside this package so consumer bundles avoid pulling in bare specifiers
// the browser import map does not resolve.
export { buildRadialBarArcs, buildPieSlices, type RadialBarArcSpec, type PieSliceSpec } from './utils/arcs'

// Line geometry helpers for the JSX-native `Line` primitive (#1080 step 3).
export { buildLinePath, buildLinePoints, type LinePoint } from './utils/lines'

// Area geometry helpers for the JSX-native `Area` primitive (#1080 step 3).
export { buildAreaPaths, buildAreaDots, type AreaPaths, type AreaDot } from './utils/areas'

// Radar geometry helpers for the JSX-native `Radar` primitive (#1080 step 3).
export { buildRadarVertices, buildRadarPolygonPoints, type RadarVertex } from './utils/radar'

// Stable CSS class names for chart primitives. Imported (rather than
// declared inline) so the JSX compiler's cssLayerPrefixer leaves them alone
// — the e2e selectors target the un-prefixed forms.
export {
  CHART_CLASS_GRID,
  CHART_CLASS_X_AXIS,
  CHART_CLASS_Y_AXIS,
  CHART_CLASS_POLAR_GRID,
  CHART_CLASS_POLAR_ANGLE_AXIS,
  CHART_CLASS_RADIAL_BAR,
  CHART_CLASS_RADIAL_LABEL,
  CHART_CLASS_BAR,
  CHART_CLASS_LINE,
  CHART_CLASS_AREA,
  CHART_CLASS_AREA_DOT,
  CHART_CLASS_RADAR,
  CHART_CLASS_PIE,
  CHART_CLASS_TOOLTIP,
} from './utils/classes'

// Helper used by the JSX-native ChartContainer ref to project ChartConfig
// entries onto CSS custom properties.
export { applyChartCSSVariables } from './chart-container'

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
