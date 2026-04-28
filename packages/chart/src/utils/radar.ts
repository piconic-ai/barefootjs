import type { ScaleLinear } from 'd3-scale'

export interface RadarVertex {
  /** Stable identifier — combines axis index and label for keyed mapArray. */
  key: string
  /** Polar angle in radians; 0 points up, increases clockwise. */
  angle: number
  /** Polar radius from the chart centre. */
  r: number
  /** Cartesian x coordinate (radius * cos(angle)). */
  x: number
  /** Cartesian y coordinate (radius * sin(angle)). */
  y: number
  /** Axis label drawn from `data[i][axisKey]`. */
  label: string
  /** Numeric series value drawn from `data[i][dataKey]`. */
  value: number
}

/**
 * Compute the per-axis vertices for a radar series. Each input datum becomes
 * one vertex placed at angle = `(2π / n) * i - π/2` and radius = `radialScale(value)`.
 */
export function buildRadarVertices(
  data: Record<string, unknown>[],
  dataKey: string,
  axisKey: string,
  radialScale: ScaleLinear<number, number>,
): RadarVertex[] {
  const n = data.length
  if (n === 0) return []
  const angleStep = (2 * Math.PI) / n
  return data.map((datum, i) => {
    const value = Number(datum[dataKey]) || 0
    const label = String(datum[axisKey])
    const angle = angleStep * i - Math.PI / 2
    const r = radialScale(value)
    return {
      key: `${i}-${label}`,
      angle,
      r,
      x: r * Math.cos(angle),
      y: r * Math.sin(angle),
      label,
      value,
    }
  })
}

/** Convert vertices into the `points` attribute of a `<polygon>`. */
export function buildRadarPolygonPoints(vertices: RadarVertex[]): string {
  return vertices.map((v) => `${v.x},${v.y}`).join(' ')
}
