import { useContext, createEffect } from '@barefootjs/dom'
import { RadialChartContext } from './context'

const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * Init function for RadialChartLabel component.
 * Renders content in the center of the radial chart using a foreignObject.
 */
export function initRadialChartLabel(scope: Element, _props: Record<string, unknown>): void {
  const ctx = useContext(RadialChartContext)

  createEffect(() => {
    const g = ctx.svgGroup()
    if (!g) return

    const innerR = ctx.innerRadius()

    // Create a foreignObject centered in the donut hole
    const size = innerR * 2 * 0.7 // Use 70% of inner diameter to give padding
    const fo = document.createElementNS(SVG_NS, 'foreignObject')
    fo.setAttribute('x', String(-size / 2))
    fo.setAttribute('y', String(-size / 2))
    fo.setAttribute('width', String(size))
    fo.setAttribute('height', String(size))
    fo.setAttribute('class', 'chart-radial-label')

    // Create a container div for the label content
    const div = document.createElement('div')
    div.style.width = '100%'
    div.style.height = '100%'
    div.style.display = 'flex'
    div.style.flexDirection = 'column'
    div.style.alignItems = 'center'
    div.style.justifyContent = 'center'
    div.style.textAlign = 'center'

    // Move children from the scope element into the center label
    const el = scope as HTMLElement
    while (el.firstChild) {
      div.appendChild(el.firstChild)
    }

    fo.appendChild(div)
    g.appendChild(fo)
  })
}
