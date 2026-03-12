import { useContext, createEffect, onCleanup } from '@barefootjs/dom'
import { RadialChartContext } from './context'
import { arc as d3Arc } from 'd3-shape'
import { scaleLinear } from 'd3-scale'
import { max } from 'd3-array'

const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * Init function for RadialBar component.
 * Renders arc segments for each data entry in a radial chart.
 * Each data entry becomes a concentric ring; the arc angle represents the value.
 */
export function initRadialBar(_scope: Element, props: Record<string, unknown>): void {
  const ctx = useContext(RadialChartContext)

  let currentDataKey: string | null = null

  // Registration effect
  createEffect(() => {
    const dataKey = props.dataKey as string
    const fill = (props.fill as string) ?? 'currentColor'

    if (currentDataKey !== null) {
      ctx.unregisterRadialBar(currentDataKey)
    }
    ctx.registerRadialBar({ dataKey, fill })
    currentDataKey = dataKey
  })

  onCleanup(() => {
    if (currentDataKey !== null) ctx.unregisterRadialBar(currentDataKey)
  })

  // Rendering effect
  let arcGroup: SVGGElement | null = null

  createEffect(() => {
    const dataKey = props.dataKey as string
    const fill = (props.fill as string) ?? 'currentColor'

    const g = ctx.svgGroup()
    if (!g) return

    // Clear previous arcs
    if (arcGroup) {
      arcGroup.remove()
      arcGroup = null
    }

    const data = ctx.data()
    if (data.length === 0) return

    const innerR = ctx.innerRadius()
    const outerR = ctx.outerRadius()
    const startDeg = ctx.startAngle()
    const endDeg = ctx.endAngle()

    // Convert degrees to radians (SVG arc convention: 0 = top, clockwise)
    const startRad = (startDeg - 90) * (Math.PI / 180)
    const endRad = (endDeg - 90) * (Math.PI / 180)

    // Find max value for angle scale
    const maxValue = max(data, (d) => {
      const v = d[dataKey]
      return typeof v === 'number' ? v : 0
    }) ?? 1

    const angleScale = scaleLinear()
      .domain([0, maxValue])
      .range([startRad, endRad])

    // Each data entry gets a concentric ring
    const ringCount = data.length
    const ringThickness = (outerR - innerR) / ringCount
    const ringPadding = Math.max(1, ringThickness * 0.1)

    const arcGenerator = d3Arc<{ innerR: number; outerR: number; startAngle: number; endAngle: number }>()
      .innerRadius((d) => d.innerR)
      .outerRadius((d) => d.outerR)
      .startAngle((d) => d.startAngle)
      .endAngle((d) => d.endAngle)
      .cornerRadius(4)

    arcGroup = document.createElementNS(SVG_NS, 'g')
    arcGroup.setAttribute('class', `chart-radial-bar chart-radial-bar-${dataKey}`)

    for (let i = 0; i < data.length; i++) {
      const datum = data[i]
      const value = Number(datum[dataKey]) || 0

      const rInner = innerR + i * ringThickness + ringPadding / 2
      const rOuter = innerR + (i + 1) * ringThickness - ringPadding / 2

      // Background track
      const trackPath = document.createElementNS(SVG_NS, 'path')
      const trackD = arcGenerator({
        innerR: rInner,
        outerR: rOuter,
        startAngle: startRad,
        endAngle: endRad,
      })
      if (trackD) {
        trackPath.setAttribute('d', trackD)
        trackPath.setAttribute('fill', 'currentColor')
        trackPath.setAttribute('opacity', '0.1')
        arcGroup.appendChild(trackPath)
      }

      // Value arc
      const valueAngle = angleScale(value)
      const arcPath = document.createElementNS(SVG_NS, 'path')
      const arcD = arcGenerator({
        innerR: rInner,
        outerR: rOuter,
        startAngle: startRad,
        endAngle: valueAngle,
      })
      if (arcD) {
        arcPath.setAttribute('d', arcD)
        arcPath.setAttribute('fill', fill)
        arcPath.setAttribute('data-key', dataKey)
        arcPath.setAttribute('data-value', String(value))
        arcPath.setAttribute('data-index', String(i))

        // Use per-item color from config if data has a fill/color property
        const itemFill = datum.fill as string | undefined
        if (itemFill) {
          arcPath.setAttribute('fill', itemFill)
        }

        arcGroup.appendChild(arcPath)
      }
    }

    g.appendChild(arcGroup)
  })
}
