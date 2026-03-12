import { useContext, createEffect } from '@barefootjs/dom'
import { AreaChartContext } from './context'

const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * Init function for YAxis in AreaChart context.
 * Renders Y axis tick labels via context.
 */
export function initAreaYAxis(_scope: Element, props: Record<string, unknown>): void {
  const ctx = useContext(AreaChartContext)

  let axisGroup: SVGGElement | null = null

  createEffect(() => {
    const hide = props.hide as boolean | undefined
    const tickFormatter = props.tickFormatter as ((value: number) => string) | undefined

    if (hide) {
      if (axisGroup) {
        axisGroup.remove()
        axisGroup = null
      }
      return
    }

    const g = ctx.svgGroup()
    const ys = ctx.yScale()
    if (!g || !ys) return

    if (axisGroup) {
      axisGroup.remove()
      axisGroup = null
    }

    axisGroup = document.createElementNS(SVG_NS, 'g')
    axisGroup.setAttribute('class', 'chart-y-axis')

    // Axis line
    const line = document.createElementNS(SVG_NS, 'line')
    line.setAttribute('x1', '0')
    line.setAttribute('x2', '0')
    line.setAttribute('y1', String(ys.range()[0]))
    line.setAttribute('y2', String(ys.range()[1]))
    line.setAttribute('stroke', 'currentColor')
    line.setAttribute('stroke-opacity', '0.1')
    axisGroup.appendChild(line)

    // Tick labels
    for (const tick of ys.ticks()) {
      const y = ys(tick)
      const text = document.createElementNS(SVG_NS, 'text')
      text.setAttribute('x', '-8')
      text.setAttribute('y', String(y))
      text.setAttribute('text-anchor', 'end')
      text.setAttribute('dominant-baseline', 'middle')
      text.setAttribute('fill', 'currentColor')
      text.setAttribute('opacity', '0.5')
      text.setAttribute('font-size', '12')
      text.textContent = tickFormatter ? tickFormatter(tick) : String(tick)
      axisGroup.appendChild(text)
    }

    g.appendChild(axisGroup)
  })
}
