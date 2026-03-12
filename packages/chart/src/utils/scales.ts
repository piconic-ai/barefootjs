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
