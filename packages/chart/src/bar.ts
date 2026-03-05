import { useContext, createEffect, onCleanup } from '@barefootjs/dom'
import { BarChartContext } from './context'

const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * Init function for Bar component.
 * Registers itself with BarChart context and renders bar rects.
 * Props are read inside effects to support reactive signal-driven values.
 */
export function initBar(_scope: Element, props: Record<string, unknown>): void {
  const ctx = useContext(BarChartContext)

  let currentDataKey: string | null = null

  // Registration effect: re-register when dataKey changes
  createEffect(() => {
    const dataKey = props.dataKey as string
    const fill = (props.fill as string) ?? 'currentColor'
    const radius = (props.radius as number) ?? 0

    if (currentDataKey !== null) {
      ctx.unregisterBar(currentDataKey)
    }
    ctx.registerBar({ dataKey, fill, radius })
    currentDataKey = dataKey
  })

  onCleanup(() => {
    if (currentDataKey !== null) ctx.unregisterBar(currentDataKey)
  })

  // Rendering effect: re-render when signals or props change
  let barGroup: SVGGElement | null = null

  createEffect(() => {
    const dataKey = props.dataKey as string
    const fill = (props.fill as string) ?? 'currentColor'
    const radius = (props.radius as number) ?? 0

    const g = ctx.svgGroup()
    const xs = ctx.xScale()
    const ys = ctx.yScale()
    if (!g || !xs || !ys) return

    // Clear previous bars
    if (barGroup) {
      barGroup.remove()
      barGroup = null
    }

    const data = ctx.data()
    const xKey = ctx.xDataKey()
    const allBars = ctx.bars()
    const barCount = allBars.length
    const bandwidth = xs.bandwidth()
    const barWidth = barCount > 1 ? bandwidth / barCount : bandwidth
    const barIndex = allBars.findIndex((b) => b.dataKey === dataKey)
    const innerHeight = ctx.innerHeight()

    barGroup = document.createElementNS(SVG_NS, 'g')
    barGroup.setAttribute('class', `chart-bar chart-bar-${dataKey}`)

    for (const datum of data) {
      const xValue = String(datum[xKey])
      const yValue = Number(datum[dataKey]) || 0
      const x = (xs(xValue) ?? 0) + barIndex * barWidth
      const y = ys(yValue)
      const barHeight = innerHeight - y

      if (barHeight <= 0) continue

      const rect = document.createElementNS(SVG_NS, 'rect')
      rect.setAttribute('x', String(x))
      rect.setAttribute('y', String(y))
      rect.setAttribute('width', String(barWidth))
      rect.setAttribute('height', String(barHeight))
      rect.setAttribute('fill', fill)

      if (radius > 0) {
        rect.setAttribute('rx', String(radius))
        rect.setAttribute('ry', String(radius))
      }

      rect.setAttribute('data-x', xValue)
      rect.setAttribute('data-y', String(yValue))
      rect.setAttribute('data-key', dataKey)

      barGroup.appendChild(rect)
    }

    g.appendChild(barGroup)
  })
}
