import { scaleBand, scaleLinear, scalePoint, type ScaleBand, type ScaleLinear, type ScalePoint } from 'd3-scale'
import { max } from 'd3-array'

export function createBandScale(
  data: Record<string, unknown>[],
  dataKey: string,
  width: number,
): ScaleBand<string> {
  return scaleBand<string>()
    .domain(data.map((d) => String(d[dataKey])))
    .range([0, width])
    .padding(0.2)
}

export function createLinearScale(
  data: Record<string, unknown>[],
  dataKeys: string[],
  height: number,
): ScaleLinear<number, number> {
  const maxValue =
    max(data, (d) =>
      max(dataKeys, (key) => {
        const v = d[key]
        return typeof v === 'number' ? v : 0
      }),
    ) ?? 0
  return scaleLinear()
    .domain([0, maxValue])
    .nice()
    .range([height, 0])
}

export function createPointScale(
  data: Record<string, unknown>[],
  dataKey: string,
  width: number,
): ScalePoint<string> {
  return scalePoint<string>()
    .domain(data.map((d) => String(d[dataKey])))
    .range([0, width])
    .padding(0.5)
}

/**
 * Linear scale spanning `[0, max(data values across dataKeys)]`, mapped to
 * `[0, radius]`. Used by RadarChart to convert numeric series values into
 * polar radii. Returns null when no dataKeys are supplied so callers can
 * cheaply gate downstream rendering on registration completing.
 */
export function createRadarRadialScale(
  data: Record<string, unknown>[],
  dataKeys: string[],
  radius: number,
): ScaleLinear<number, number> | null {
  if (dataKeys.length === 0) return null
  const maxValue =
    max(data, (d) =>
      max(dataKeys, (key) => {
        const v = d[key]
        return typeof v === 'number' ? v : 0
      }),
    ) ?? 0
  return scaleLinear<number, number>().domain([0, maxValue]).nice().range([0, radius])
}
