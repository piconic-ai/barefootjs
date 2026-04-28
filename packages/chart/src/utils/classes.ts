/**
 * Stable CSS class names for chart primitives.
 *
 * Exported as constants so consumers can reference them via
 * `<g className={CHART_CLASS_X_AXIS}>` in `"use client"` files. The compiler's
 * `cssLayerPrefixer` only rewrites locally-declared constants and static
 * className literals; imported identifiers are left alone, which keeps the
 * names un-prefixed for the e2e test selectors (`.chart-x-axis text`, ...).
 */

export const CHART_CLASS_GRID = 'chart-grid'
export const CHART_CLASS_X_AXIS = 'chart-x-axis'
export const CHART_CLASS_Y_AXIS = 'chart-y-axis'
export const CHART_CLASS_POLAR_GRID = 'chart-polar-grid'
export const CHART_CLASS_POLAR_ANGLE_AXIS = 'chart-polar-angle-axis'
export const CHART_CLASS_RADIAL_BAR = 'chart-radial-bar'
