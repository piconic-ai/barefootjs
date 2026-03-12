import { useContext, createEffect, onCleanup } from '@barefootjs/dom'
import { area as d3Area, curveLinear } from 'd3-shape'
import { AreaChartContext } from './context'

const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * Init function for Area component.
 * Registers itself with AreaChart context and renders area + line paths.
 * Props are read inside effects to support reactive signal-driven values.
 */
export function initArea(_scope: Element, props: Record<string, unknown>): void {
  const ctx = useContext(AreaChartContext)

  let currentDataKey: string | null = null

  // Registration effect: re-register when dataKey changes
  createEffect(() => {
    const dataKey = props.dataKey as string
    const fill = (props.fill as string) ?? 'currentColor'
    const stroke = (props.stroke as string) ?? fill
    const fillOpacity = (props.fillOpacity as number) ?? 0.2

    if (currentDataKey !== null) {
      ctx.unregisterArea(currentDataKey)
    }
    ctx.registerArea({ dataKey, fill, stroke, fillOpacity })
    currentDataKey = dataKey
  })

  onCleanup(() => {
    if (currentDataKey !== null) ctx.unregisterArea(currentDataKey)
  })

  // Rendering effect: re-render when signals or props change
  let areaGroup: SVGGElement | null = null

  createEffect(() => {
    const dataKey = props.dataKey as string
    const fill = (props.fill as string) ?? 'currentColor'
    const stroke = (props.stroke as string) ?? fill
    const fillOpacity = (props.fillOpacity as number) ?? 0.2

    const g = ctx.svgGroup()
    const xs = ctx.xScale()
    const ys = ctx.yScale()
    if (!g || !xs || !ys) return

    // Clear previous rendering
    if (areaGroup) {
      areaGroup.remove()
      areaGroup = null
    }

    const data = ctx.data()
    const xKey = ctx.xDataKey()
    const innerHeight = ctx.innerHeight()

    areaGroup = document.createElementNS(SVG_NS, 'g')
    areaGroup.setAttribute('class', `chart-area chart-area-${dataKey}`)

    // Build area path using d3-shape
    const areaGen = d3Area<Record<string, unknown>>()
      .x((d) => xs(String(d[xKey])) ?? 0)
      .y0(innerHeight)
      .y1((d) => ys(Number(d[dataKey]) || 0))
      .curve(curveLinear)

    const areaPath = document.createElementNS(SVG_NS, 'path')
    areaPath.setAttribute('d', areaGen(data) ?? '')
    areaPath.setAttribute('fill', fill)
    areaPath.setAttribute('fill-opacity', String(fillOpacity))
    areaPath.setAttribute('data-key', dataKey)
    areaGroup.appendChild(areaPath)

    // Build line path (stroke only, on top of the filled area)
    const lineGen = d3Area<Record<string, unknown>>()
      .x((d) => xs(String(d[xKey])) ?? 0)
      .y0((d) => ys(Number(d[dataKey]) || 0))
      .y1((d) => ys(Number(d[dataKey]) || 0))
      .curve(curveLinear)

    const linePath = document.createElementNS(SVG_NS, 'path')
    linePath.setAttribute('d', lineGen(data) ?? '')
    linePath.setAttribute('fill', 'none')
    linePath.setAttribute('stroke', stroke)
    linePath.setAttribute('stroke-width', '2')
    linePath.setAttribute('data-key', dataKey)
    areaGroup.appendChild(linePath)

    // Add invisible hover dots at each data point
    for (const datum of data) {
      const xValue = String(datum[xKey])
      const yValue = Number(datum[dataKey]) || 0
      const cx = xs(xValue) ?? 0
      const cy = ys(yValue)

      const dot = document.createElementNS(SVG_NS, 'circle')
      dot.setAttribute('cx', String(cx))
      dot.setAttribute('cy', String(cy))
      dot.setAttribute('r', '12')
      dot.setAttribute('fill', 'transparent')
      dot.setAttribute('data-x', xValue)
      dot.setAttribute('data-y', String(yValue))
      dot.setAttribute('data-key', dataKey)
      dot.setAttribute('class', 'chart-area-dot')
      areaGroup.appendChild(dot)
    }

    g.appendChild(areaGroup)
  })
}
