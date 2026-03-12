import { createSignal, provideContext, useContext } from '@barefootjs/dom'
import type { RadialBarRegistration } from './types'
import { RadialChartContext, ChartConfigContext } from './context'

const SVG_NS = 'http://www.w3.org/2000/svg'
const DEFAULT_MARGIN = 10

/**
 * Init function for RadialChart component.
 * Creates SVG with a centered coordinate system, provides context to children.
 * Props are read lazily via accessor functions to support reactive updates.
 */
export function initRadialChart(scope: Element, props: Record<string, unknown>): void {
  const { config } = useContext(ChartConfigContext)

  const el = scope as HTMLElement
  const containerRect = el.getBoundingClientRect()
  const size = Math.min(containerRect.width || 300, containerRect.height || 300) || 300
  const width = containerRect.width || size
  const height = size

  el.style.height = `${height}px`
  el.style.minHeight = ''

  const margin = DEFAULT_MARGIN
  const iw = width - margin * 2
  const ih = height - margin * 2
  const cx = width / 2
  const cy = height / 2
  const maxRadius = Math.min(iw, ih) / 2

  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
  svg.style.width = '100%'
  svg.style.height = `${height}px`
  svg.style.display = 'block'

  const g = document.createElementNS(SVG_NS, 'g')
  g.setAttribute('transform', `translate(${cx},${cy})`)
  svg.appendChild(g)
  el.appendChild(svg)

  const [radialBars, setRadialBars] = createSignal<RadialBarRegistration[]>([])

  const registerRadialBar = (bar: RadialBarRegistration) => {
    setRadialBars((prev) => [...prev, bar])
  }

  const unregisterRadialBar = (dataKey: string) => {
    setRadialBars((prev) => prev.filter((b) => b.dataKey !== dataKey))
  }

  // Read props lazily so signal-driven prop changes propagate
  provideContext(RadialChartContext, {
    svgGroup: () => g,
    container: () => el,
    data: () => (props.data as Record<string, unknown>[]) ?? [],
    innerRadius: () => {
      const v = props.innerRadius as number | undefined
      return v != null ? v : maxRadius * 0.4
    },
    outerRadius: () => {
      const v = props.outerRadius as number | undefined
      return v != null ? v : maxRadius
    },
    startAngle: () => (props.startAngle as number) ?? 0,
    endAngle: () => (props.endAngle as number) ?? 360,
    config: () => config,
    centerX: () => cx,
    centerY: () => cy,
    radialBars,
    registerRadialBar,
    unregisterRadialBar,
  })
}
