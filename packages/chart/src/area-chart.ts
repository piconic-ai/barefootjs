import { createSignal, createEffect, provideContext, useContext } from '@barefootjs/dom'
import type { AreaRegistration } from './types'
import { AreaChartContext, ChartConfigContext } from './context'
import { createPointScale, createLinearScale } from './utils/scales'

const SVG_NS = 'http://www.w3.org/2000/svg'
const DEFAULT_MARGIN = { top: 10, right: 12, bottom: 30, left: 40 }
const ASPECT_RATIO = 0.5

/**
 * Init function for AreaChart component.
 * Creates SVG, provides context to children (Area, XAxis, etc.).
 */
export function initAreaChart(scope: Element, props: Record<string, unknown>): void {
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

  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
  svg.style.width = '100%'
  svg.style.height = `${height}px`
  svg.style.display = 'block'

  const g = document.createElementNS(SVG_NS, 'g')
  g.setAttribute('transform', `translate(${margin.left},${margin.top})`)
  svg.appendChild(g)
  el.appendChild(svg)

  const [areas, setAreas] = createSignal<AreaRegistration[]>([])
  const [xDataKey, setXDataKey] = createSignal('')
  const [xScale, setXScale] = createSignal<ReturnType<typeof createPointScale> | null>(null)
  const [yScale, setYScale] = createSignal<ReturnType<typeof createLinearScale> | null>(null)

  const registerArea = (area: AreaRegistration) => {
    setAreas((prev) => [...prev, area])
  }

  const unregisterArea = (dataKey: string) => {
    setAreas((prev) => prev.filter((a) => a.dataKey !== dataKey))
  }

  provideContext(AreaChartContext, {
    svgGroup: () => g,
    container: () => el,
    data: () => data,
    xDataKey,
    xScale,
    yScale,
    innerWidth: () => iw,
    innerHeight: () => ih,
    config: () => config,
    areas,
    registerArea,
    unregisterArea,
    setXDataKey,
  })

  // Recompute scales when areas or xDataKey change
  createEffect(() => {
    const currentAreas = areas()
    const key = xDataKey()
    if (!key || currentAreas.length === 0) return
    setXScale(() => createPointScale(data, key, iw))
    setYScale(() => createLinearScale(data, currentAreas.map((a) => a.dataKey), ih))
  })
}
