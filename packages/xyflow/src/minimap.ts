import { createEffect, onCleanup, untrack } from '@barefootjs/client/runtime'
import { useFlow } from './hooks'
import { SVG_NS, INFINITE_EXTENT } from './constants'
import { applyPositionStyle } from './utils'

export type MiniMapProps = {
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  width?: number
  height?: number
  nodeColor?: string | ((node: any) => string)
  maskColor?: string
  maskStrokeColor?: string
  maskStrokeWidth?: number
  pannable?: boolean
  zoomable?: boolean
  zoomStep?: number
  inversePan?: boolean
  offsetScale?: number
}

/**
 * Calculate the bounding rect of all nodes in the node lookup.
 */
function getNodeBoundingRect(nodeLookup: Map<string, any>): {
  x: number
  y: number
  width: number
  height: number
} | null {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity

  for (const [, node] of nodeLookup) {
    const pos = node.internals.positionAbsolute
    const nw = node.measured.width ?? 150
    const nh = node.measured.height ?? 40
    minX = Math.min(minX, pos.x)
    minY = Math.min(minY, pos.y)
    maxX = Math.max(maxX, pos.x + nw)
    maxY = Math.max(maxY, pos.y + nh)
  }

  if (!isFinite(minX)) return null

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/**
 * Init function for MiniMap component.
 * Renders a small overview of the graph with interactive pan/zoom.
 *
 * Pan and zoom are implemented with direct pointer/wheel event handlers
 * rather than XYMinimap from @xyflow/system, because XYMinimap's D3 zoom
 * pan handlers check for 'mousemove'/'mousedown' event types but D3 zoom v3
 * dispatches PointerEvents ('pointermove'/'pointerdown'), making pan a no-op.
 */
export function initMiniMap(scope: Element, props: Record<string, unknown>): void {
  const store = useFlow()
  const el = scope as HTMLElement

  const position = (props.position as string) ?? 'bottom-right'
  const mapWidth = (props.width as number) ?? 200
  const mapHeight = (props.height as number) ?? 150
  const nodeColor = (props.nodeColor as string) ?? '#e2e8f0'
  const maskColor = (props.maskColor as string) ?? 'rgba(240, 240, 240, 0.6)'
  const maskStrokeColor = (props.maskStrokeColor as string) ?? 'none'
  const maskStrokeWidth = (props.maskStrokeWidth as number) ?? 0
  const pannable = (props.pannable as boolean) ?? true
  const zoomable = (props.zoomable as boolean) ?? true
  const zoomStep = (props.zoomStep as number) ?? 1
  const inversePan = (props.inversePan as boolean) ?? false
  const offsetScale = (props.offsetScale as number) ?? 5

  // Track the current viewScale for pan calculations.
  let currentViewScale = 1

  // Container — nopan/nowheel/nodrag classes prevent the main flow's D3 zoom
  // from intercepting events on the minimap.
  const container = document.createElement('div')
  container.className = 'bf-flow__minimap nopan nowheel nodrag'
  container.style.position = 'absolute'
  container.style.zIndex = '5'
  container.style.overflow = 'hidden'
  container.style.borderRadius = '4px'
  container.style.boxShadow = '0 1px 4px rgba(0,0,0,0.15)'
  container.style.backgroundColor = '#fff'

  // Stop event propagation so the main flow's D3 zoom doesn't interfere.
  for (const evt of [
    'mousedown', 'mousemove', 'mouseup',
    'pointerdown', 'pointermove', 'pointerup',
    'wheel', 'touchstart', 'touchmove', 'touchend', 'dblclick',
  ] as const) {
    container.addEventListener(evt, (e) => e.stopPropagation())
  }

  applyPositionStyle(container, position)

  // SVG for minimap with viewBox (set reactively)
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('width', String(mapWidth))
  svg.setAttribute('height', String(mapHeight))
  svg.style.display = 'block'
  if (pannable) {
    svg.style.cursor = 'grab'
  }
  container.appendChild(svg)

  el.appendChild(container)

  // Node rectangles group
  const nodesGroup = document.createElementNS(SVG_NS, 'g')
  svg.appendChild(nodesGroup)

  // Viewport mask: an SVG path with evenodd fill rule that masks the area
  // outside the current viewport, matching React Flow's approach.
  const maskPath = document.createElementNS(SVG_NS, 'path')
  maskPath.setAttribute('class', 'bf-flow__minimap-mask')
  maskPath.setAttribute('fill', maskColor)
  maskPath.setAttribute('fill-rule', 'evenodd')
  maskPath.setAttribute('stroke', maskStrokeColor)
  maskPath.setAttribute('stroke-width', String(maskStrokeWidth))
  maskPath.setAttribute('pointer-events', 'none')
  svg.appendChild(maskPath)

  // Interactive pan via pointer events.
  const pz = untrack(store.panZoom)

  if (pannable && pz) {
    let isDragging = false
    let lastPointerPos: [number, number] = [0, 0]

    svg.addEventListener('pointerdown', (e) => {
      isDragging = true
      lastPointerPos = [e.clientX, e.clientY]
      svg.setPointerCapture(e.pointerId)
      svg.style.cursor = 'grabbing'
      e.preventDefault()
    })

    svg.addEventListener('pointermove', (e) => {
      if (!isDragging) return
      const transform = store.getTransform()
      const dx = e.clientX - lastPointerPos[0]
      const dy = e.clientY - lastPointerPos[1]
      lastPointerPos = [e.clientX, e.clientY]

      const moveScale =
        currentViewScale *
        Math.max(transform[2], Math.log(transform[2])) *
        (inversePan ? -1 : 1)
      const position = {
        x: transform[0] - dx * moveScale,
        y: transform[1] - dy * moveScale,
      }
      const extent: [[number, number], [number, number]] = [
        [0, 0],
        [untrack(store.width), untrack(store.height)],
      ]
      pz.setViewportConstrained(
        { x: position.x, y: position.y, zoom: transform[2] },
        extent,
        INFINITE_EXTENT,
      )
    })

    svg.addEventListener('pointerup', () => {
      isDragging = false
      svg.style.cursor = 'grab'
    })
  }

  // Interactive zoom via wheel events.
  if (zoomable && pz) {
    svg.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault()
        const transform = store.getTransform()
        const isMac = navigator.platform.includes('Mac')
        const factor = e.ctrlKey && isMac ? 10 : 1
        const pinchDelta =
          -e.deltaY *
          (e.deltaMode === 1 ? 0.05 : e.deltaMode ? 1 : 0.002) *
          zoomStep
        const nextZoom = transform[2] * Math.pow(2, pinchDelta * factor)
        pz.scaleTo(nextZoom)
      },
      { passive: false },
    )
  }

  // Reactively render the minimap: nodes, viewport mask.
  createEffect(() => {
    const nodeLookup = store.nodeLookup()
    const vp = store.viewport()
    const flowW = store.width()
    const flowH = store.height()
    // Track position changes from drag
    store.positionEpoch()

    const nodeBounds = getNodeBoundingRect(nodeLookup)
    if (!nodeBounds) return

    // Compute the visible viewport rect in flow coordinates
    const vpX = -vp.x / vp.zoom
    const vpY = -vp.y / vp.zoom
    const vpW = flowW / vp.zoom
    const vpH = flowH / vp.zoom

    // Union of node bounds and viewport — keeps minimap stable when dragging
    const unionX = Math.min(nodeBounds.x, vpX)
    const unionY = Math.min(nodeBounds.y, vpY)
    const unionR = Math.max(nodeBounds.x + nodeBounds.width, vpX + vpW)
    const unionB = Math.max(nodeBounds.y + nodeBounds.height, vpY + vpH)
    const unionW = unionR - unionX
    const unionH = unionB - unionY

    const scaledWidth = unionW / mapWidth
    const scaledHeight = unionH / mapHeight
    const viewScale = Math.max(scaledWidth, scaledHeight)
    currentViewScale = viewScale

    const viewWidth = viewScale * mapWidth
    const viewHeight = viewScale * mapHeight
    const offset = offsetScale * viewScale

    const vbX = unionX - (viewWidth - unionW) / 2 - offset
    const vbY = unionY - (viewHeight - unionH) / 2 - offset
    const vbW = viewWidth + offset * 2
    const vbH = viewHeight + offset * 2

    svg.setAttribute('viewBox', `${vbX} ${vbY} ${vbW} ${vbH}`)

    // Clear and redraw node rectangles
    nodesGroup.innerHTML = ''
    for (const [, node] of nodeLookup) {
      const pos = node.internals.positionAbsolute
      const nw = node.measured.width ?? 150
      const nh = node.measured.height ?? 40

      const rect = document.createElementNS(SVG_NS, 'rect')
      rect.setAttribute('x', String(pos.x))
      rect.setAttribute('y', String(pos.y))
      rect.setAttribute('width', String(nw))
      rect.setAttribute('height', String(nh))
      const color =
        typeof nodeColor === 'function'
          ? (nodeColor as (n: any) => string)(node)
          : nodeColor
      rect.setAttribute('fill', color)
      rect.setAttribute('rx', '5')
      rect.setAttribute('ry', '5')
      nodesGroup.appendChild(rect)
    }

    // Build mask path: outer rect with inner viewport cutout (evenodd)
    const outerX = vbX - offset
    const outerY = vbY - offset
    const outerW = vbW + offset * 2
    const outerH = vbH + offset * 2
    const d =
      `M${outerX},${outerY}h${outerW}v${outerH}h${-outerW}z` +
      `M${vpX},${vpY}h${vpW}v${vpH}h${-vpW}z`
    maskPath.setAttribute('d', d)
  })

  onCleanup(() => container.remove())
}
