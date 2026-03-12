import { useContext, createEffect } from '@barefootjs/dom'
import { RadarChartContext } from './context'

const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * Init function for PolarGrid component.
 * Renders concentric polygon grid lines and radial spokes.
 */
export function initPolarGrid(_scope: Element, props: Record<string, unknown>): void {
  const ctx = useContext(RadarChartContext)

  let gridGroup: SVGGElement | null = null

  createEffect(() => {
    const gridType = (props.gridType as string) ?? 'polygon'
    const show = (props.show as boolean) !== false

    const g = ctx.svgGroup()
    const rs = ctx.radialScale()
    if (!g || !rs) return

    if (gridGroup) {
      gridGroup.remove()
      gridGroup = null
    }

    gridGroup = document.createElementNS(SVG_NS, 'g')
    gridGroup.setAttribute('class', 'chart-polar-grid')

    if (!show) {
      g.appendChild(gridGroup)
      return
    }

    const data = ctx.data()
    const n = data.length
    if (n === 0) return

    const radius = ctx.radius()
    const ticks = rs.ticks(5)
    const angleStep = (2 * Math.PI) / n

    // Concentric shapes
    for (const tick of ticks) {
      const r = rs(tick)
      if (r <= 0) continue

      if (gridType === 'circle') {
        const circle = document.createElementNS(SVG_NS, 'circle')
        circle.setAttribute('cx', '0')
        circle.setAttribute('cy', '0')
        circle.setAttribute('r', String(r))
        circle.setAttribute('fill', 'none')
        circle.setAttribute('stroke', 'currentColor')
        circle.setAttribute('stroke-opacity', '0.1')
        gridGroup.appendChild(circle)
      } else {
        const points: string[] = []
        for (let i = 0; i < n; i++) {
          const angle = angleStep * i - Math.PI / 2
          const x = r * Math.cos(angle)
          const y = r * Math.sin(angle)
          points.push(`${x},${y}`)
        }
        const polygon = document.createElementNS(SVG_NS, 'polygon')
        polygon.setAttribute('points', points.join(' '))
        polygon.setAttribute('fill', 'none')
        polygon.setAttribute('stroke', 'currentColor')
        polygon.setAttribute('stroke-opacity', '0.1')
        gridGroup.appendChild(polygon)
      }
    }

    // Radial lines from center to each vertex
    for (let i = 0; i < n; i++) {
      const angle = angleStep * i - Math.PI / 2
      const x = radius * Math.cos(angle)
      const y = radius * Math.sin(angle)

      const line = document.createElementNS(SVG_NS, 'line')
      line.setAttribute('x1', '0')
      line.setAttribute('y1', '0')
      line.setAttribute('x2', String(x))
      line.setAttribute('y2', String(y))
      line.setAttribute('stroke', 'currentColor')
      line.setAttribute('stroke-opacity', '0.1')
      gridGroup.appendChild(line)
    }

    g.appendChild(gridGroup)
  })
}
