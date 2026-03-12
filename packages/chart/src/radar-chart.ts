import { createSignal, createEffect, provideContext, useContext } from '@barefootjs/dom'
import type { RadarRegistration } from './types'
import { RadarChartContext, ChartConfigContext } from './context'
import { scaleLinear, type ScaleLinear } from 'd3-scale'
import { max } from 'd3-array'

const SVG_NS = 'http://www.w3.org/2000/svg'
const DEFAULT_MARGIN = { top: 40, right: 40, bottom: 40, left: 40 }
const ASPECT_RATIO = 1.0

/**
 * Init function for RadarChart component.
 * Creates SVG with centered coordinate system, provides context to children.
 */
export function initRadarChart(scope: Element, props: Record<string, unknown>): void {
  const data = (props.data as Record<string, unknown>[]) ?? []
  const { config } = useContext(ChartConfigContext)

  const el = scope as HTMLElement
  const containerRect = el.getBoundingClientRect()
  const width = containerRect.width || 500
  const height = Math.round(width * ASPECT_RATIO)

  el.style.height = `${height}px`
  el.style.minHeight = ''

  const margin = DEFAULT_MARGIN
  const iw = width - margin.left - margin.right
  const ih = height - margin.top - margin.bottom
  const radius = Math.min(iw, ih) / 2

  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
  svg.style.width = '100%'
  svg.style.height = `${height}px`
  svg.style.display = 'block'

  // Center the group in the SVG
  const cx = margin.left + iw / 2
  const cy = margin.top + ih / 2
  const g = document.createElementNS(SVG_NS, 'g')
  g.setAttribute('transform', `translate(${cx},${cy})`)
  svg.appendChild(g)
  el.appendChild(svg)

  const [radars, setRadars] = createSignal<RadarRegistration[]>([])
  const [dataKey, setDataKey] = createSignal('')
  const [radialScale, setRadialScale] = createSignal<ScaleLinear<number, number> | null>(null)

  const registerRadar = (radar: RadarRegistration) => {
    setRadars((prev) => [...prev, radar])
  }

  const unregisterRadar = (dk: string) => {
    setRadars((prev) => prev.filter((r) => r.dataKey !== dk))
  }

  provideContext(RadarChartContext, {
    svgGroup: () => g,
    container: () => el,
    data: () => data,
    dataKey,
    radius: () => radius,
    radialScale,
    config: () => config,
    radars,
    registerRadar,
    unregisterRadar,
    setDataKey,
  })

  // Recompute radial scale when radars change
  createEffect(() => {
    const currentRadars = radars()
    if (currentRadars.length === 0) return

    const radarKeys = currentRadars.map((r) => r.dataKey)
    const maxValue =
      max(data, (d) =>
        max(radarKeys, (key) => {
          const v = d[key]
          return typeof v === 'number' ? v : 0
        }),
      ) ?? 0

    setRadialScale(() => scaleLinear<number, number>().domain([0, maxValue]).nice().range([0, radius]))
  })
}
