import { createEffect, onCleanup } from '@barefootjs/client/runtime'
import { useFlow } from './hooks'
import { SVG_NS } from './constants'
import type { FlowStore } from './types'

export type BackgroundVariant = 'dots' | 'lines' | 'cross'

export type BackgroundProps = {
  variant?: BackgroundVariant
  gap?: number
  size?: number
  color?: string
  lineWidth?: number
}

/**
 * Init function for Background component.
 * Renders an SVG pattern background that moves with the viewport.
 *
 * When called outside the barefootjs render pipeline (e.g., from a plain
 * script), pass the store explicitly via props._store since useFlow()
 * context may not be available.
 */
export function initBackground(scope: Element, props: Record<string, unknown>): void {
  const store = (props._store as FlowStore | undefined) ?? useFlow()
  const el = scope as HTMLElement

  const variant = (props.variant as BackgroundVariant) ?? 'dots'
  const gap = (props.gap as number) ?? 20
  const size = (props.size as number) ?? 1
  const color = (props.color as string) ?? '#ddd'
  const lineWidth = (props.lineWidth as number) ?? 1

  // Create SVG background
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.style.position = 'absolute'
  svg.style.top = '0'
  svg.style.left = '0'
  svg.style.width = '100%'
  svg.style.height = '100%'
  svg.style.pointerEvents = 'none'
  svg.style.zIndex = '0'

  const patternId = `bf-bg-${Math.random().toString(36).slice(2, 8)}`

  const defs = document.createElementNS(SVG_NS, 'defs')
  const pattern = document.createElementNS(SVG_NS, 'pattern')
  pattern.setAttribute('id', patternId)
  pattern.setAttribute('patternUnits', 'userSpaceOnUse')

  const patternContent = createPatternContent(variant, size, color, lineWidth)
  pattern.appendChild(patternContent)
  defs.appendChild(pattern)
  svg.appendChild(defs)

  const rect = document.createElementNS(SVG_NS, 'rect')
  rect.setAttribute('width', '100%')
  rect.setAttribute('height', '100%')
  rect.setAttribute('fill', `url(#${patternId})`)
  svg.appendChild(rect)

  el.appendChild(svg)

  // Update pattern with viewport
  createEffect(() => {
    const vp = store.viewport()
    const scaledGap = gap * vp.zoom
    if (!scaledGap || !isFinite(scaledGap)) return

    pattern.setAttribute('width', String(scaledGap))
    pattern.setAttribute('height', String(scaledGap))
    pattern.setAttribute('x', String(vp.x % scaledGap))
    pattern.setAttribute('y', String(vp.y % scaledGap))

    // Update size based on zoom for dots
    if (variant === 'dots') {
      const circle = patternContent as SVGCircleElement
      circle.setAttribute('r', String(size * Math.max(vp.zoom, 0.5)))
      circle.setAttribute('cx', String(scaledGap / 2))
      circle.setAttribute('cy', String(scaledGap / 2))
    }
  })

  onCleanup(() => svg.remove())
}

function createPatternContent(
  variant: BackgroundVariant,
  size: number,
  color: string,
  lineWidth: number,
): SVGElement {
  if (variant === 'dots') {
    const circle = document.createElementNS(SVG_NS, 'circle')
    circle.setAttribute('r', String(size))
    circle.setAttribute('fill', color)
    return circle
  }

  if (variant === 'lines') {
    const line = document.createElementNS(SVG_NS, 'line')
    line.setAttribute('x1', '0')
    line.setAttribute('y1', '0')
    line.setAttribute('x2', '0')
    line.setAttribute('y2', '100%')
    line.setAttribute('stroke', color)
    line.setAttribute('stroke-width', String(lineWidth))
    return line
  }

  // cross
  const g = document.createElementNS(SVG_NS, 'g')
  const line1 = document.createElementNS(SVG_NS, 'line')
  line1.setAttribute('x1', '0')
  line1.setAttribute('y1', '50%')
  line1.setAttribute('x2', '100%')
  line1.setAttribute('y2', '50%')
  line1.setAttribute('stroke', color)
  line1.setAttribute('stroke-width', String(lineWidth))

  const line2 = document.createElementNS(SVG_NS, 'line')
  line2.setAttribute('x1', '50%')
  line2.setAttribute('y1', '0')
  line2.setAttribute('x2', '50%')
  line2.setAttribute('y2', '100%')
  line2.setAttribute('stroke', color)
  line2.setAttribute('stroke-width', String(lineWidth))

  g.appendChild(line1)
  g.appendChild(line2)
  return g
}
