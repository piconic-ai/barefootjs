import { useContext, createEffect } from '@barefootjs/dom'
import { RadarChartContext } from './context'

const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * Init function for PolarAngleAxis component.
 * Sets the dataKey on context and renders labels around the radar perimeter.
 */
export function initPolarAngleAxis(_scope: Element, props: Record<string, unknown>): void {
  const ctx = useContext(RadarChartContext)

  // Set dataKey on context (like XAxis does for BarChart)
  createEffect(() => {
    const dataKey = props.dataKey as string
    if (dataKey) ctx.setDataKey(dataKey)
  })

  let axisGroup: SVGGElement | null = null

  createEffect(() => {
    const tickFormatter = props.tickFormatter as ((value: string) => string) | undefined
    const hide = (props.hide as boolean) ?? false

    const g = ctx.svgGroup()
    const rs = ctx.radialScale()
    if (!g || !rs) return

    if (axisGroup) {
      axisGroup.remove()
      axisGroup = null
    }

    if (hide) return

    const data = ctx.data()
    const axisKey = ctx.dataKey()
    const n = data.length
    if (n === 0 || !axisKey) return

    const radius = ctx.radius()
    const angleStep = (2 * Math.PI) / n
    const labelOffset = 16

    axisGroup = document.createElementNS(SVG_NS, 'g')
    axisGroup.setAttribute('class', 'chart-polar-angle-axis')

    for (let i = 0; i < n; i++) {
      const datum = data[i]
      const label = String(datum[axisKey])
      const displayLabel = tickFormatter ? tickFormatter(label) : label
      const angle = angleStep * i - Math.PI / 2

      const x = (radius + labelOffset) * Math.cos(angle)
      const y = (radius + labelOffset) * Math.sin(angle)

      const text = document.createElementNS(SVG_NS, 'text')
      text.setAttribute('x', String(x))
      text.setAttribute('y', String(y))
      text.setAttribute('text-anchor', 'middle')
      text.setAttribute('dominant-baseline', 'central')
      text.setAttribute('fill', 'currentColor')
      text.setAttribute('font-size', '12')
      text.setAttribute('opacity', '0.6')
      text.textContent = displayLabel
      axisGroup.appendChild(text)
    }

    g.appendChild(axisGroup)
  })
}
