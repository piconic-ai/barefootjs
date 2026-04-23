import { createEffect, onCleanup } from '@barefootjs/client'
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

  // Update pattern with viewport. Line/cross path data uses scaledGap as pixel
  // coordinates (same approach as @xyflow/react) so coordinates are always
  // exact and do not rely on SVG percentage resolution.
  createEffect(() => {
    const vp = store.viewport()
    const scaledGap = gap * vp.zoom
    if (!scaledGap || !Number.isFinite(scaledGap)) return

    pattern.setAttribute('width', String(scaledGap))
    pattern.setAttribute('height', String(scaledGap))
    pattern.setAttribute('x', String(vp.x % scaledGap))
    pattern.setAttribute('y', String(vp.y % scaledGap))

    if (variant === 'dots') {
      const circle = patternContent as SVGCircleElement
      circle.setAttribute('r', String(size * Math.max(vp.zoom, 0.5)))
      circle.setAttribute('cx', String(scaledGap / 2))
      circle.setAttribute('cy', String(scaledGap / 2))
    } else if (variant === 'lines') {
      const path = patternContent as SVGPathElement
      path.setAttribute('d', `M${scaledGap / 2} 0 V${scaledGap}`)
    } else {
      const path = patternContent as SVGPathElement
      const half = scaledGap / 2
      path.setAttribute('d', `M${half} 0 V${scaledGap} M0 ${half} H${scaledGap}`)
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

  // lines and cross both use a <path> whose 'd' attribute is updated reactively
  // with pixel values derived from scaledGap. This avoids SVG percentage values
  // which resolve against the viewport under patternUnits="userSpaceOnUse" and
  // would place lines outside the tile, causing them to be clipped away.
  const path = document.createElementNS(SVG_NS, 'path')
  path.setAttribute('stroke', color)
  path.setAttribute('stroke-width', String(lineWidth))
  path.setAttribute('fill', 'none')
  return path
}
