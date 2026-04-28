import { arc as d3Arc } from 'd3-shape'
import { scaleLinear } from 'd3-scale'
import { max } from 'd3-array'

export interface RadialBarArcSpec {
  /** Background-track path (full sweep, dim). */
  trackD: string | null
  /** Foreground value path (proportional to data value). */
  arcD: string | null
  /** Numeric value used to size the arc. */
  value: number
  /** Optional per-datum fill override (when datum.fill is set). */
  itemFill?: string
  /** Index in the input data, used as a stable identifier for SVG. */
  index: number
}

/**
 * Build the arc geometry for a single radial-bar series. Each input datum
 * becomes a concentric ring within `[innerR, outerR]`, with the value arc
 * sweeping from `startDeg` (top) to a fraction of the dataset max.
 *
 * Pure data — caller renders one `<path d={track.trackD}>` plus one
 * `<path d={track.arcD}>` per spec, keeping the d3-shape dependency inside
 * `@barefootjs/chart` and out of consumer bundles.
 */
export function buildRadialBarArcs(
  data: Record<string, unknown>[],
  dataKey: string,
  innerR: number,
  outerR: number,
  startDeg: number,
  endDeg: number,
): RadialBarArcSpec[] {
  if (data.length === 0) return []

  // SVG arc convention: 0° = top, clockwise. d3-shape uses 0 = right, ccw,
  // so subtract 90° before converting to radians.
  const startRad = (startDeg - 90) * (Math.PI / 180)
  const endRad = (endDeg - 90) * (Math.PI / 180)

  const maxValue =
    max(data, (d) => {
      const v = d[dataKey]
      return typeof v === 'number' ? v : 0
    }) ?? 1

  const angleScale = scaleLinear().domain([0, maxValue]).range([startRad, endRad])

  const ringCount = data.length
  const ringThickness = (outerR - innerR) / ringCount
  const ringPadding = Math.max(1, ringThickness * 0.1)

  const arcGenerator = d3Arc<{
    innerR: number
    outerR: number
    startAngle: number
    endAngle: number
  }>()
    .innerRadius((d) => d.innerR)
    .outerRadius((d) => d.outerR)
    .startAngle((d) => d.startAngle)
    .endAngle((d) => d.endAngle)
    .cornerRadius(4)

  return data.map((datum, i) => {
    const value = Number(datum[dataKey]) || 0
    const rInner = innerR + i * ringThickness + ringPadding / 2
    const rOuter = innerR + (i + 1) * ringThickness - ringPadding / 2
    const itemFill = datum.fill as string | undefined

    return {
      trackD: arcGenerator({
        innerR: rInner,
        outerR: rOuter,
        startAngle: startRad,
        endAngle: endRad,
      }),
      arcD: arcGenerator({
        innerR: rInner,
        outerR: rOuter,
        startAngle: startRad,
        endAngle: angleScale(value),
      }),
      value,
      itemFill,
      index: i,
    }
  })
}
