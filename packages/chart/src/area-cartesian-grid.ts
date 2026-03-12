import { useContext, createEffect } from '@barefootjs/dom'
import { AreaChartContext } from './context'

const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * Init function for CartesianGrid in AreaChart context.
 * Renders horizontal/vertical grid lines via context.
 */
export function initAreaCartesianGrid(_scope: Element, props: Record<string, unknown>): void {
  const ctx = useContext(AreaChartContext)

  let gridGroup: SVGGElement | null = null

  createEffect(() => {
    const horizontal = (props.horizontal as boolean) !== false
    const vertical = (props.vertical as boolean) ?? true

    const g = ctx.svgGroup()
    const ys = ctx.yScale()
    if (!g || !ys) return

    if (gridGroup) {
      gridGroup.remove()
      gridGroup = null
    }

    const width = ctx.innerWidth()
    const height = ctx.innerHeight()

    gridGroup = document.createElementNS(SVG_NS, 'g')
    gridGroup.setAttribute('class', 'chart-grid')

    if (horizontal) {
      for (const tick of ys.ticks()) {
        const y = ys(tick)
        const line = document.createElementNS(SVG_NS, 'line')
        line.setAttribute('x1', '0')
        line.setAttribute('x2', String(width))
        line.setAttribute('y1', String(y))
        line.setAttribute('y2', String(y))
        line.setAttribute('stroke', 'currentColor')
        line.setAttribute('stroke-opacity', '0.1')
        gridGroup.appendChild(line)
      }
    }

    if (vertical) {
      for (const tick of ys.ticks()) {
        const x = (tick / (ys.domain()[1] || 1)) * width
        const line = document.createElementNS(SVG_NS, 'line')
        line.setAttribute('x1', String(x))
        line.setAttribute('x2', String(x))
        line.setAttribute('y1', '0')
        line.setAttribute('y2', String(height))
        line.setAttribute('stroke', 'currentColor')
        line.setAttribute('stroke-opacity', '0.1')
        gridGroup.appendChild(line)
      }
    }

    g.appendChild(gridGroup)
  })
}
