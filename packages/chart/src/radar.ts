import { useContext, createEffect, onCleanup } from '@barefootjs/dom'
import { RadarChartContext } from './context'

const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * Init function for Radar component.
 * Registers itself with RadarChart context and renders radar polygon + dots.
 * Props are read inside effects to support reactive signal-driven values.
 */
export function initRadar(_scope: Element, props: Record<string, unknown>): void {
  const ctx = useContext(RadarChartContext)

  let currentDataKey: string | null = null

  // Registration effect: re-register when dataKey changes
  createEffect(() => {
    const dataKey = props.dataKey as string
    const fill = (props.fill as string) ?? 'currentColor'
    const fillOpacity = (props.fillOpacity as number) ?? 0.6

    if (currentDataKey !== null) {
      ctx.unregisterRadar(currentDataKey)
    }
    ctx.registerRadar({ dataKey, fill, fillOpacity })
    currentDataKey = dataKey
  })

  onCleanup(() => {
    if (currentDataKey !== null) ctx.unregisterRadar(currentDataKey)
  })

  // Rendering effect: re-render when signals or props change
  let radarGroup: SVGGElement | null = null

  createEffect(() => {
    const dataKey = props.dataKey as string
    const fill = (props.fill as string) ?? 'currentColor'
    const fillOpacity = (props.fillOpacity as number) ?? 0.6

    const g = ctx.svgGroup()
    const rs = ctx.radialScale()
    if (!g || !rs) return

    // Clear previous rendering
    if (radarGroup) {
      radarGroup.remove()
      radarGroup = null
    }

    const data = ctx.data()
    const axisKey = ctx.dataKey()
    const n = data.length
    if (n === 0) return

    radarGroup = document.createElementNS(SVG_NS, 'g')
    radarGroup.setAttribute('class', `chart-radar chart-radar-${dataKey}`)

    // Compute polygon points
    const angleStep = (2 * Math.PI) / n
    const points: string[] = []

    for (let i = 0; i < n; i++) {
      const datum = data[i]
      const value = Number(datum[dataKey]) || 0
      const angle = angleStep * i - Math.PI / 2
      const r = rs(value)
      const x = r * Math.cos(angle)
      const y = r * Math.sin(angle)
      points.push(`${x},${y}`)
    }

    // Filled polygon
    const polygon = document.createElementNS(SVG_NS, 'polygon')
    polygon.setAttribute('points', points.join(' '))
    polygon.setAttribute('fill', fill)
    polygon.setAttribute('fill-opacity', String(fillOpacity))
    polygon.setAttribute('stroke', fill)
    polygon.setAttribute('stroke-width', '2')
    polygon.setAttribute('data-key', dataKey)
    radarGroup.appendChild(polygon)

    // Data point dots (also serve as tooltip hover targets)
    for (let i = 0; i < n; i++) {
      const datum = data[i]
      const value = Number(datum[dataKey]) || 0
      const angle = angleStep * i - Math.PI / 2
      const r = rs(value)
      const x = r * Math.cos(angle)
      const y = r * Math.sin(angle)

      const circle = document.createElementNS(SVG_NS, 'circle')
      circle.setAttribute('cx', String(x))
      circle.setAttribute('cy', String(y))
      circle.setAttribute('r', '3')
      circle.setAttribute('fill', fill)
      circle.setAttribute('data-key', dataKey)
      circle.setAttribute('data-axis', String(datum[axisKey]))
      circle.setAttribute('data-value', String(value))
      radarGroup.appendChild(circle)
    }

    g.appendChild(radarGroup)
  })
}
