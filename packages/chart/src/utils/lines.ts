import { line as d3Line, curveMonotoneX, curveLinear } from 'd3-shape'
import type { ScaleBand } from 'd3-scale'
import type { ScaleLinear } from 'd3-scale'

export interface LinePoint {
  key: string
  cx: number
  cy: number
  xValue: string
  yValue: number
}

/**
 * Build the SVG `d` attribute for a line series. Pure helper — d3-shape stays
 * inside `@barefootjs/chart` so consumer bundles avoid pulling in bare
 * specifiers the browser import map does not resolve.
 */
export function buildLinePath(
  data: Record<string, unknown>[],
  xKey: string,
  yKey: string,
  xs: ScaleBand<string>,
  ys: ScaleLinear<number, number>,
  type: 'linear' | 'monotone',
): string {
  const bandwidth = xs.bandwidth()
  const points: [number, number][] = data.map((datum) => {
    const xValue = String(datum[xKey])
    const yValue = Number(datum[yKey]) || 0
    return [(xs(xValue) ?? 0) + bandwidth / 2, ys(yValue)]
  })

  const generator = d3Line<[number, number]>()
    .x((d) => d[0])
    .y((d) => d[1])
  generator.curve(type === 'monotone' ? curveMonotoneX : curveLinear)

  return generator(points) ?? ''
}

/** Build the per-point geometry used to render hover/visual dots. */
export function buildLinePoints(
  data: Record<string, unknown>[],
  xKey: string,
  yKey: string,
  xs: ScaleBand<string>,
  ys: ScaleLinear<number, number>,
): LinePoint[] {
  const bandwidth = xs.bandwidth()
  return data.map((datum) => {
    const xValue = String(datum[xKey])
    const yValue = Number(datum[yKey]) || 0
    return {
      key: `${yKey}-${xValue}`,
      cx: (xs(xValue) ?? 0) + bandwidth / 2,
      cy: ys(yValue),
      xValue,
      yValue,
    }
  })
}
