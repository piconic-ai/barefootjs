import { useContext, createEffect } from '@barefootjs/dom'
import { BarChartContext } from './context'

const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * Init function for XAxis component.
 * Sets xDataKey on context and renders X axis labels.
 */
export function initXAxis(_scope: Element, props: Record<string, unknown>): void {
  const ctx = useContext(BarChartContext)
  const dataKey = props.dataKey as string
  const tickFormatter = props.tickFormatter as ((value: string) => string) | undefined
  const hide = props.hide as boolean | undefined

  // Tell BarChart which key to use for X axis
  ctx.setXDataKey(dataKey)

  if (hide) return

  let axisGroup: SVGGElement | null = null

  createEffect(() => {
    const g = ctx.svgGroup()
    const xs = ctx.xScale()
    if (!g || !xs) return

    if (axisGroup) {
      axisGroup.remove()
      axisGroup = null
    }

    const height = ctx.innerHeight()

    axisGroup = document.createElementNS(SVG_NS, 'g')
    axisGroup.setAttribute('class', 'chart-x-axis')
    axisGroup.setAttribute('transform', `translate(0,${height})`)

    // Axis line
    const line = document.createElementNS(SVG_NS, 'line')
    line.setAttribute('x1', '0')
    line.setAttribute('x2', String(xs.range()[1]))
    line.setAttribute('y1', '0')
    line.setAttribute('y2', '0')
    line.setAttribute('stroke', 'currentColor')
    line.setAttribute('stroke-opacity', '0.1')
    axisGroup.appendChild(line)

    // Tick labels
    const bandwidth = xs.bandwidth()
    for (const value of xs.domain()) {
      const x = (xs(value) ?? 0) + bandwidth / 2
      const text = document.createElementNS(SVG_NS, 'text')
      text.setAttribute('x', String(x))
      text.setAttribute('y', '20')
      text.setAttribute('text-anchor', 'middle')
      text.setAttribute('fill', 'currentColor')
      text.setAttribute('opacity', '0.5')
      text.setAttribute('font-size', '12')
      text.textContent = tickFormatter ? tickFormatter(value) : value
      axisGroup.appendChild(text)
    }

    g.appendChild(axisGroup)
  })
}
