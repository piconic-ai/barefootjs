import { createSignal, createEffect, provideContext, useContext } from '@barefootjs/dom'
import type { BarRegistration } from './types'
import { BarChartContext, ChartConfigContext } from './context'
import { createBandScale, createLinearScale } from './utils/scales'

const SVG_NS = 'http://www.w3.org/2000/svg'
const DEFAULT_MARGIN = { top: 10, right: 12, bottom: 30, left: 40 }
const ASPECT_RATIO = 0.5

/**
 * Init function for BarChart component.
 * Creates SVG, provides context to children (Bar, XAxis, etc.).
 */
export function initBarChart(scope: Element, props: Record<string, unknown>): void {
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

  const [bars, setBars] = createSignal<BarRegistration[]>([])
  const [xDataKey, setXDataKey] = createSignal('')
  const [xScale, setXScale] = createSignal<ReturnType<typeof createBandScale> | null>(null)
  const [yScale, setYScale] = createSignal<ReturnType<typeof createLinearScale> | null>(null)

  const registerBar = (bar: BarRegistration) => {
    setBars((prev) => [...prev, bar])
  }

  const unregisterBar = (dataKey: string) => {
    setBars((prev) => prev.filter((b) => b.dataKey !== dataKey))
  }

  provideContext(BarChartContext, {
    svgGroup: () => g,
    container: () => el,
    data: () => data,
    xDataKey,
    xScale,
    yScale,
    innerWidth: () => iw,
    innerHeight: () => ih,
    config: () => config,
    bars,
    registerBar,
    unregisterBar,
    setXDataKey,
  })

  // Recompute scales when bars or xDataKey change
  createEffect(() => {
    const currentBars = bars()
    const key = xDataKey()
    if (!key || currentBars.length === 0) return
    // Wrap in arrow functions: D3 scales are functions, and signal setters
    // interpret function args as updater functions
    setXScale(() => createBandScale(data, key, iw))
    setYScale(() => createLinearScale(data, currentBars.map((b) => b.dataKey), ih))
  })
}
