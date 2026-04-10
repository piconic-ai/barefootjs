import { createEffect, onCleanup, useContext, untrack } from '@barefootjs/dom'
import { XYMinimap } from '@xyflow/system'
import { FlowContext } from './context'
import type { FlowStore } from './types'

const SVG_NS = 'http://www.w3.org/2000/svg'

export type MiniMapProps = {
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  width?: number
  height?: number
  nodeColor?: string | ((node: any) => string)
  pannable?: boolean
  zoomable?: boolean
}

/**
 * Init function for MiniMap component.
 * Renders a small overview of the graph with interactive pan/zoom.
 */
export function initMiniMap(scope: Element, props: Record<string, unknown>): void {
  const store = useContext(FlowContext) as FlowStore
  const el = scope as HTMLElement

  const position = (props.position as string) ?? 'bottom-right'
  const mapWidth = (props.width as number) ?? 200
  const mapHeight = (props.height as number) ?? 150
  const nodeColor = (props.nodeColor as string) ?? '#e2e2e2'
  const pannable = (props.pannable as boolean) ?? true
  const zoomable = (props.zoomable as boolean) ?? true

  // Container
  const container = document.createElement('div')
  container.className = 'bf-flow__minimap'
  container.style.position = 'absolute'
  container.style.zIndex = '5'
  container.style.overflow = 'hidden'
  container.style.borderRadius = '4px'
  container.style.boxShadow = '0 1px 4px rgba(0,0,0,0.15)'
  container.style.backgroundColor = '#fff'

  const [vertical, horizontal] = position.split('-')
  container.style[vertical as 'top' | 'bottom'] = '10px'
  container.style[horizontal as 'left' | 'right'] = '10px'

  // SVG for minimap
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('width', String(mapWidth))
  svg.setAttribute('height', String(mapHeight))
  svg.style.display = 'block'
  container.appendChild(svg)

  el.appendChild(container)

  // Initialize XYMinimap for pan/zoom interaction on minimap
  const pz = untrack(store.panZoom)
  if (pz) {
    const minimapInstance = XYMinimap({
      panZoom: pz,
      domNode: svg,
      getTransform: store.getTransform,
      getViewScale: () => untrack(store.viewport).zoom,
    })

    const infiniteExtent: [[number, number], [number, number]] = [
      [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
      [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
    ]

    minimapInstance.update({
      translateExtent: infiniteExtent,
      width: mapWidth,
      height: mapHeight,
      pannable,
      zoomable,
    })

    onCleanup(() => minimapInstance.destroy())
  }

  // Reactively render node rectangles in the minimap
  const nodesGroup = document.createElementNS(SVG_NS, 'g')
  svg.appendChild(nodesGroup)

  const viewportRect = document.createElementNS(SVG_NS, 'rect')
  viewportRect.setAttribute('fill', 'none')
  viewportRect.setAttribute('stroke', '#4a90d9')
  viewportRect.setAttribute('stroke-width', '2')
  svg.appendChild(viewportRect)

  createEffect(() => {
    const nodeLookup = store.nodeLookup()
    const vp = store.viewport()
    const w = store.width()
    const h = store.height()

    // Calculate bounds of all nodes
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const [, node] of nodeLookup) {
      const pos = node.internals.positionAbsolute
      const nw = node.measured.width ?? 150
      const nh = node.measured.height ?? 40
      minX = Math.min(minX, pos.x)
      minY = Math.min(minY, pos.y)
      maxX = Math.max(maxX, pos.x + nw)
      maxY = Math.max(maxY, pos.y + nh)
    }

    if (!isFinite(minX)) return

    // Add padding
    const padding = 50
    minX -= padding
    minY -= padding
    maxX += padding
    maxY += padding

    const boundsWidth = maxX - minX
    const boundsHeight = maxY - minY
    const scale = Math.min(mapWidth / boundsWidth, mapHeight / boundsHeight)

    // Clear and redraw nodes
    nodesGroup.innerHTML = ''
    for (const [, node] of nodeLookup) {
      const pos = node.internals.positionAbsolute
      const nw = node.measured.width ?? 150
      const nh = node.measured.height ?? 40

      const rect = document.createElementNS(SVG_NS, 'rect')
      rect.setAttribute('x', String((pos.x - minX) * scale))
      rect.setAttribute('y', String((pos.y - minY) * scale))
      rect.setAttribute('width', String(nw * scale))
      rect.setAttribute('height', String(nh * scale))
      const color = typeof nodeColor === 'function' ? (nodeColor as (n: any) => string)(node) : nodeColor
      rect.setAttribute('fill', color)
      rect.setAttribute('rx', '2')
      nodesGroup.appendChild(rect)
    }

    // Update viewport rectangle
    const vpX = (-vp.x / vp.zoom - minX) * scale
    const vpY = (-vp.y / vp.zoom - minY) * scale
    const vpW = (w / vp.zoom) * scale
    const vpH = (h / vp.zoom) * scale
    viewportRect.setAttribute('x', String(vpX))
    viewportRect.setAttribute('y', String(vpY))
    viewportRect.setAttribute('width', String(vpW))
    viewportRect.setAttribute('height', String(vpH))
  })

  onCleanup(() => container.remove())
}
