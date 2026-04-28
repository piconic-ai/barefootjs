import { area as d3Area, curveLinear } from 'd3-shape'
import type { ScalePoint, ScaleLinear } from 'd3-scale'

export interface AreaPaths {
  /** Filled area path from the bottom of the chart up to each y value. */
  area: string
  /** Stroke-only path along the top of the area (degenerate area where y0 === y1). */
  line: string
}

export interface AreaDot {
  key: string
  cx: number
  cy: number
  xValue: string
  yValue: number
}

/**
 * Build the SVG `d` attributes for an area series. Pure helper — d3-shape
 * stays inside `@barefootjs/chart` so consumer bundles avoid pulling in bare
 * specifiers the browser import map does not resolve.
 */
export function buildAreaPaths(
  data: Record<string, unknown>[],
  xKey: string,
  yKey: string,
  xs: ScalePoint<string>,
  ys: ScaleLinear<number, number>,
  innerHeight: number,
): AreaPaths {
  const fillGen = d3Area<Record<string, unknown>>()
    .x((d) => xs(String(d[xKey])) ?? 0)
    .y0(innerHeight)
    .y1((d) => ys(Number(d[yKey]) || 0))
    .curve(curveLinear)

  const lineGen = d3Area<Record<string, unknown>>()
    .x((d) => xs(String(d[xKey])) ?? 0)
    .y0((d) => ys(Number(d[yKey]) || 0))
    .y1((d) => ys(Number(d[yKey]) || 0))
    .curve(curveLinear)

  return {
    area: fillGen(data) ?? '',
    line: lineGen(data) ?? '',
  }
}

/** Build the per-point geometry used to render invisible hover-target dots. */
export function buildAreaDots(
  data: Record<string, unknown>[],
  xKey: string,
  yKey: string,
  xs: ScalePoint<string>,
  ys: ScaleLinear<number, number>,
): AreaDot[] {
  return data.map((datum) => {
    const xValue = String(datum[xKey])
    const yValue = Number(datum[yKey]) || 0
    return {
      key: `${yKey}-${xValue}`,
      cx: xs(xValue) ?? 0,
      cy: ys(yValue),
      xValue,
      yValue,
    }
  })
}
