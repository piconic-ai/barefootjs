import { useContext, createEffect, onCleanup } from '@barefootjs/dom'
import { line as d3Line, curveMonotoneX, curveLinear } from 'd3-shape'
import { BarChartContext } from './context'

const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * Init function for Line component.
 * Registers itself with chart context and renders SVG path + data point circles.
 * Uses BarChartContext for compatibility with shared components (XAxis, YAxis, etc.).
 */
export function initLine(_scope: Element, props: Record<string, unknown>): void {
  const ctx = useContext(BarChartContext)

  let currentDataKey: string | null = null

  // Registration effect: re-register when dataKey changes
  createEffect(() => {
    const dataKey = props.dataKey as string
    const stroke = (props.stroke as string) ?? 'currentColor'

    if (currentDataKey !== null) {
      ctx.unregisterBar(currentDataKey)
    }
    ctx.registerBar({ dataKey, fill: stroke, radius: 0 })
    currentDataKey = dataKey
  })

  onCleanup(() => {
    if (currentDataKey !== null) ctx.unregisterBar(currentDataKey)
  })

  // Rendering effect: re-render when signals or props change
  let lineGroup: SVGGElement | null = null

  createEffect(() => {
    const dataKey = props.dataKey as string
    const stroke = (props.stroke as string) ?? 'currentColor'
    const strokeWidth = (props.strokeWidth as number) ?? 2
    const type = (props.type as string) ?? 'monotone'
    const dot = props.dot !== false

    const g = ctx.svgGroup()
    const xs = ctx.xScale()
    const ys = ctx.yScale()
    if (!g || !xs || !ys) return

    // Clear previous line
    if (lineGroup) {
      lineGroup.remove()
      lineGroup = null
    }

    const data = ctx.data()
    const xKey = ctx.xDataKey()
    const bandwidth = xs.bandwidth()

    lineGroup = document.createElementNS(SVG_NS, 'g')
    lineGroup.setAttribute('class', `chart-line chart-line-${dataKey}`)

    // Build points array
    const points: [number, number][] = []
    for (const datum of data) {
      const xValue = String(datum[xKey])
      const yValue = Number(datum[dataKey]) || 0
      const x = (xs(xValue) ?? 0) + bandwidth / 2
      const y = ys(yValue)
      points.push([x, y])
    }

    // Draw path using d3-line
    const lineGenerator = d3Line<[number, number]>()
      .x((d) => d[0])
      .y((d) => d[1])

    if (type === 'monotone') {
      lineGenerator.curve(curveMonotoneX)
    } else {
      lineGenerator.curve(curveLinear)
    }

    const pathD = lineGenerator(points)
    if (pathD) {
      const path = document.createElementNS(SVG_NS, 'path')
      path.setAttribute('d', pathD)
      path.setAttribute('fill', 'none')
      path.setAttribute('stroke', stroke)
      path.setAttribute('stroke-width', String(strokeWidth))
      path.setAttribute('data-key', dataKey)
      lineGroup.appendChild(path)
    }

    // Draw dots at data points (for tooltip interaction and visual)
    if (dot) {
      for (let i = 0; i < data.length; i++) {
        const datum = data[i]
        const xValue = String(datum[xKey])
        const yValue = Number(datum[dataKey]) || 0
        const [x, y] = points[i]

        const circle = document.createElementNS(SVG_NS, 'circle')
        circle.setAttribute('cx', String(x))
        circle.setAttribute('cy', String(y))
        circle.setAttribute('r', '4')
        circle.setAttribute('fill', stroke)
        circle.setAttribute('data-x', xValue)
        circle.setAttribute('data-y', String(yValue))
        circle.setAttribute('data-key', dataKey)
        lineGroup.appendChild(circle)
      }
    }

    g.appendChild(lineGroup)
  })
}
