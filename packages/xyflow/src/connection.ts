import { untrack } from '@barefootjs/client'
import { getSmoothStepPath, Position, reconnectEdge as reconnectEdgeUtil } from '@xyflow/system'
import type { FlowStore, NodeBase, EdgeBase, Connection } from './types'
import { SVG_NS } from './constants'

/**
 * Build a connection object for the given source handle / target handle pair.
 * Used by both validation and edge creation.
 */
function buildConnection(
  sourceNodeId: string,
  targetNodeId: string,
  handleType: 'source' | 'target',
  sourceHandleId?: string | null,
  targetHandleId?: string | null,
): { source: string; target: string; sourceHandle: string | null; targetHandle: string | null } {
  let source = sourceNodeId
  let target = targetNodeId
  let sourceHandle = sourceHandleId ?? null
  let targetHandle = targetHandleId ?? null
  if (handleType === 'target') {
    source = targetNodeId
    target = sourceNodeId
    // Swap handle IDs when direction is reversed
    const tmp = sourceHandle
    sourceHandle = targetHandle
    targetHandle = tmp
  }
  return { source, target, sourceHandle, targetHandle }
}

/**
 * Check whether a proposed connection is valid according to the store's
 * isValidConnection callback. Returns true when no callback is configured.
 */
function checkConnectionValidity<
  NodeType extends NodeBase = NodeBase,
  EdgeType extends EdgeBase = EdgeBase,
>(
  store: FlowStore<NodeType, EdgeType>,
  connection: { source: string; target: string; sourceHandle: string | null; targetHandle: string | null },
): boolean {
  if (!store.isValidConnection) return true
  return store.isValidConnection(connection)
}

/**
 * Attach a connection drag handler to a handle element.
 * Called when creating each handle in node-wrapper.
 */
export function attachConnectionHandler<
  NodeType extends NodeBase = NodeBase,
  EdgeType extends EdgeBase = EdgeBase,
>(
  handleEl: HTMLElement,
  nodeId: string,
  handleType: 'source' | 'target',
  container: HTMLElement,
  _edgesSvg: SVGSVGElement,
  store: FlowStore<NodeType, EdgeType>,
): void {
  handleEl.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return
    if (!untrack(store.nodesDraggable)) return

    // Stop propagation to prevent node drag
    e.stopPropagation()
    e.preventDefault()

    // Compute source position in flow coordinates at mousedown time
    const handleRect = handleEl.getBoundingClientRect()
    const containerRect0 = container.getBoundingClientRect()
    const [, , scale0] = store.getTransform()
    const vp0 = untrack(store.viewport)

    const sourceX = (handleRect.left + handleRect.width / 2 - containerRect0.left - vp0.x) / scale0
    const sourceY = (handleRect.top + handleRect.height / 2 - containerRect0.top - vp0.y) / scale0

    // Create a temporary overlay SVG for the connection line, above nodes.
    // This makes the line visible on top of nodes during drag.
    // We hide it briefly before elementFromPoint calls so handles are detected.
    const overlaySvg = document.createElementNS(SVG_NS, 'svg')
    overlaySvg.style.position = 'absolute'
    overlaySvg.style.top = '0'
    overlaySvg.style.left = '0'
    overlaySvg.style.width = '100%'
    overlaySvg.style.height = '100%'
    overlaySvg.style.overflow = 'visible'
    overlaySvg.style.pointerEvents = 'none'
    overlaySvg.style.zIndex = '10'
    container.appendChild(overlaySvg)

    // The line is drawn in viewport-transformed coordinates
    const lineGroup = document.createElementNS(SVG_NS, 'g')
    overlaySvg.appendChild(lineGroup)

    const connectionLine = document.createElementNS(SVG_NS, 'path')
    connectionLine.setAttribute('fill', 'none')
    // Apply connectionLineStyle from store if available
    const lineStyle = store.connectionLineStyle
    connectionLine.setAttribute('stroke', lineStyle?.stroke ?? '#b1b1b7')
    connectionLine.setAttribute('stroke-width', lineStyle?.strokeWidth ?? '1')
    lineGroup.appendChild(connectionLine)

    // Track the currently highlighted handle for validation/snap feedback
    let lastHighlightedHandle: HTMLElement | null = null
    // Track the snapped handle so onMouseUp can use it without re-querying
    let snappedHandle: HTMLElement | null = null

    const SNAP_THRESHOLD = 30

    /**
     * Find the nearest valid target handle within SNAP_THRESHOLD pixels of
     * the cursor. Returns null when none is close enough.
     */
    function findNearestHandle(cursorX: number, cursorY: number): HTMLElement | null {
      const candidates = container.querySelectorAll<HTMLElement>('.bf-flow__handle')
      let nearest: HTMLElement | null = null
      let nearestDist = SNAP_THRESHOLD

      for (const candidate of candidates) {
        if (candidate === handleEl) continue
        if (!candidate.dataset.nodeId || candidate.dataset.nodeId === nodeId) continue
        // Skip same-type handles — source can only connect to target and vice versa.
        // When source+target handles overlap at the same position, without this
        // check the source handle (first in DOM) would always win and fail validation.
        const candidateType = candidate.classList.contains('bf-flow__handle--target') ? 'target' : 'source'
        if (candidateType === handleType) continue

        const rect = candidate.getBoundingClientRect()
        const cx = rect.left + rect.width / 2
        const cy = rect.top + rect.height / 2
        const dist = Math.hypot(cursorX - cx, cursorY - cy)
        if (dist < nearestDist) {
          nearestDist = dist
          nearest = candidate
        }
      }
      return nearest
    }

    const onMouseMove = (e: MouseEvent) => {
      // Read fresh viewport and container rect each move — the user
      // may pan/zoom while drawing a connection.
      const containerRect = container.getBoundingClientRect()
      const [, , scale] = store.getTransform()
      const vp = untrack(store.viewport)

      // Determine if we should snap to a nearby handle
      const nearHandle = findNearestHandle(e.clientX, e.clientY)

      let targetX: number
      let targetY: number

      if (nearHandle) {
        const rect = nearHandle.getBoundingClientRect()
        targetX = (rect.left + rect.width / 2 - containerRect.left - vp.x) / scale
        targetY = (rect.top + rect.height / 2 - containerRect.top - vp.y) / scale
      } else {
        targetX = (e.clientX - containerRect.left - vp.x) / scale
        targetY = (e.clientY - containerRect.top - vp.y) / scale
      }

      const [path] = getSmoothStepPath({
        sourceX,
        sourceY,
        sourcePosition: handleType === 'source' ? Position.Bottom : Position.Top,
        targetX,
        targetY,
        targetPosition: handleType === 'source' ? Position.Top : Position.Bottom,
      })

      connectionLine.setAttribute('d', path)

      // Sync overlay SVG transform with viewport
      const vpCurrent = untrack(store.viewport)
      lineGroup.setAttribute('transform', `translate(${vpCurrent.x}, ${vpCurrent.y}) scale(${vpCurrent.zoom})`)

      // Clear classes from the previously highlighted handle
      if (lastHighlightedHandle && lastHighlightedHandle !== nearHandle) {
        lastHighlightedHandle.classList.remove('valid', 'invalid')
      }

      snappedHandle = null

      if (nearHandle) {
        const nearHandleType = nearHandle.classList.contains('bf-flow__handle--target') ? 'target' : 'source'
        const isCompatibleType = handleType !== nearHandleType
        const srcHandleId = handleEl.getAttribute("data-handleid") ?? null
        const tgtHandleId = nearHandle.getAttribute("data-handleid") ?? null
        const conn = buildConnection(nodeId, nearHandle.dataset.nodeId!, handleType, srcHandleId, tgtHandleId)
        const isValid = isCompatibleType && checkConnectionValidity(store, conn)

        nearHandle.classList.remove('valid', 'invalid')
        nearHandle.classList.add(isValid ? 'valid' : 'invalid')
        lastHighlightedHandle = nearHandle

        if (isValid) snappedHandle = nearHandle
      } else {
        // Fall back to elementFromPoint for hover-only feedback (cursor directly on handle)
        overlaySvg.style.display = 'none'
        const hoverEl = document.elementFromPoint(e.clientX, e.clientY)
        overlaySvg.style.display = ''
        const hoveredHandle = hoverEl?.closest?.('.bf-flow__handle') as HTMLElement | null

        if (
          hoveredHandle &&
          hoveredHandle !== handleEl &&
          hoveredHandle.dataset.nodeId &&
          hoveredHandle.dataset.nodeId !== nodeId
        ) {
          const hoveredHandleType = hoveredHandle.classList.contains('bf-flow__handle--target') ? 'target' : 'source'
          const isCompatibleType = handleType !== hoveredHandleType
          const srcHandleId = handleEl.getAttribute("data-handleid") ?? null
          const tgtHandleId = hoveredHandle.getAttribute("data-handleid") ?? null
          const conn = buildConnection(nodeId, hoveredHandle.dataset.nodeId, handleType, srcHandleId, tgtHandleId)
          const isValid = isCompatibleType && checkConnectionValidity(store, conn)

          hoveredHandle.classList.remove('valid', 'invalid')
          if (!isValid) hoveredHandle.classList.add('invalid')
          lastHighlightedHandle = hoveredHandle
        } else {
          lastHighlightedHandle = null
        }
      }
    }

    const onMouseUp = (e: MouseEvent) => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)

      // Clean up validation/snap classes from any highlighted handle
      if (lastHighlightedHandle) {
        lastHighlightedHandle.classList.remove('valid', 'invalid')
      }

      // Prefer the snapped handle; fall back to direct hit-test
      let targetHandle = snappedHandle

      if (!targetHandle) {
        overlaySvg.style.display = 'none'
        const targetEl = document.elementFromPoint(e.clientX, e.clientY)
        overlaySvg.style.display = ''
        targetHandle = targetEl?.closest?.('.bf-flow__handle') as HTMLElement | null
      }

      if (
        targetHandle &&
        targetHandle.dataset.nodeId &&
        targetHandle.dataset.nodeId !== nodeId
      ) {
        const targetNodeId = targetHandle.dataset.nodeId
        const targetHandleType = targetHandle.classList.contains('bf-flow__handle--target') ? 'target' : 'source'
        const isCompatibleType = handleType !== targetHandleType
        const srcHandleId = handleEl.getAttribute("data-handleid") ?? null
        const tgtHandleId = targetHandle.getAttribute("data-handleid") ?? null
        const conn = buildConnection(nodeId, targetNodeId, handleType, srcHandleId, tgtHandleId)

        // Validate: handle type must be compatible + custom validation
        const isValid = isCompatibleType && checkConnectionValidity(store, conn)

        if (isValid) {
          if (store.onConnect) {
            // When onConnect is provided, the consumer is responsible for
            // creating the edge (matching React Flow behaviour).
            store.onConnect(conn)
          } else {
            // Default: auto-create a plain edge when no onConnect handler
            const edgeId = `e-${conn.source}-${conn.target}-${Date.now()}`
            const newEdge = {
              id: edgeId,
              source: conn.source,
              target: conn.target,
              sourceHandle: conn.sourceHandle ?? undefined,
              targetHandle: conn.targetHandle ?? undefined,
            } as EdgeType
            store.addEdge(newEdge)
          }
        }
      }

      // Remove connection line overlay
      overlaySvg.remove()
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  })
}

/**
 * Attach a reconnection drag handler to an edge endpoint handle.
 * Dragging this handle detaches the edge from its source/target and allows
 * reconnecting to a different handle.
 *
 * @param handleEl - The SVG circle element acting as the reconnection grip
 * @param edge - The edge being reconnected
 * @param endpointType - Which endpoint of the edge is being dragged ('source' | 'target')
 * @param container - The flow container element
 * @param edgesSvg - The SVG element containing edge paths
 * @param store - The flow store
 */
export function attachReconnectionHandler<
  NodeType extends NodeBase = NodeBase,
  EdgeType extends EdgeBase = EdgeBase,
>(
  handleEl: SVGCircleElement,
  edge: EdgeType,
  endpointType: 'source' | 'target',
  container: HTMLElement,
  edgesSvg: SVGSVGElement,
  store: FlowStore<NodeType, EdgeType>,
): void {
  handleEl.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()

    // The fixed anchor is the opposite endpoint of the edge
    const anchorNodeId = endpointType === 'source' ? edge.target : edge.source

    // Determine anchor position from the node
    const nodeLookup = untrack(store.nodeLookup)
    const anchorNode = nodeLookup.get(anchorNodeId)
    if (!anchorNode) return

    const anchorW = anchorNode.measured.width ?? 150
    const anchorH = anchorNode.measured.height ?? 40
    const anchorPos = anchorNode.internals.positionAbsolute

    // For the anchor, use the handle position appropriate for the fixed end:
    // If we're dragging the "source" end, the fixed anchor is the "target" end
    // (which has a handle at the top). If dragging "target", anchor is "source" (bottom).
    const anchorX = anchorPos.x + anchorW / 2
    const anchorY = endpointType === 'source'
      ? anchorPos.y          // target handle is at top
      : anchorPos.y + anchorH // source handle is at bottom

    // Hide the original edge path while reconnecting
    const edgePathEl = edgesSvg.querySelector(`.bf-flow__edge[data-id="${edge.id}"]`) as SVGPathElement | null
    const hitPathEl = edgesSvg.querySelector(`path[data-hit-id="${edge.id}"]`) as SVGPathElement | null
    if (edgePathEl) edgePathEl.style.opacity = '0.2'
    if (hitPathEl) hitPathEl.style.display = 'none'

    // Create temporary connection line from anchor to cursor
    const connectionLine = document.createElementNS(SVG_NS, 'path')
    connectionLine.setAttribute('fill', 'none')
    const reconnectLineStyle = store.connectionLineStyle
    connectionLine.setAttribute('stroke', reconnectLineStyle?.stroke ?? '#b1b1b7')
    connectionLine.setAttribute('stroke-width', reconnectLineStyle?.strokeWidth ?? '1')
    connectionLine.setAttribute('pointer-events', 'none')
    edgesSvg.appendChild(connectionLine)

    let lastHoveredHandle: HTMLElement | null = null

    const onMouseMove = (ev: MouseEvent) => {
      const containerRect = container.getBoundingClientRect()
      const [, , scale] = store.getTransform()
      const vp = untrack(store.viewport)

      const cursorX = (ev.clientX - containerRect.left - vp.x) / scale
      const cursorY = (ev.clientY - containerRect.top - vp.y) / scale

      // Draw smoothstep path from anchor to cursor
      // sourcePosition/targetPosition depends on which endpoint is the anchor
      const sourcePosition = endpointType === 'source' ? Position.Top : Position.Bottom
      const targetPosition = endpointType === 'source' ? Position.Bottom : Position.Top

      const [path] = getSmoothStepPath({
        sourceX: anchorX,
        sourceY: anchorY,
        sourcePosition,
        targetX: cursorX,
        targetY: cursorY,
        targetPosition,
      })

      connectionLine.setAttribute('d', path)

      // Validate on hover over handles
      const hoverEl = document.elementFromPoint(ev.clientX, ev.clientY)
      const hoveredHandle = hoverEl?.closest?.('.bf-flow__handle') as HTMLElement | null

      if (lastHoveredHandle && lastHoveredHandle !== hoveredHandle) {
        lastHoveredHandle.classList.remove('invalid')
      }

      if (
        hoveredHandle &&
        hoveredHandle.dataset.nodeId &&
        hoveredHandle.dataset.nodeId !== anchorNodeId
      ) {
        // Build connection based on the hovered handle's type
        const hoveredNodeId = hoveredHandle.dataset.nodeId
        const hoveredHandleType = hoveredHandle.classList.contains('bf-flow__handle--target') ? 'target' : 'source'
        const conn: Connection = hoveredHandleType === 'target'
          ? { source: anchorNodeId, target: hoveredNodeId, sourceHandle: null, targetHandle: null }
          : { source: hoveredNodeId, target: anchorNodeId, sourceHandle: null, targetHandle: null }

        const isValid = checkConnectionValidity(store, conn)
        hoveredHandle.classList.remove('invalid')
        if (!isValid) hoveredHandle.classList.add('invalid')
        lastHoveredHandle = hoveredHandle
      } else {
        lastHoveredHandle = null
      }
    }

    const onMouseUp = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)

      if (lastHoveredHandle) {
        lastHoveredHandle.classList.remove('invalid')
      }

      // Restore the original edge appearance
      if (edgePathEl) edgePathEl.style.opacity = ''
      if (hitPathEl) hitPathEl.style.display = ''

      // Check if released on a valid handle
      const targetEl = document.elementFromPoint(ev.clientX, ev.clientY)
      const droppedHandle = targetEl?.closest?.('.bf-flow__handle') as HTMLElement | null

      if (
        droppedHandle &&
        droppedHandle.dataset.nodeId &&
        droppedHandle.dataset.nodeId !== anchorNodeId
      ) {
        const droppedNodeId = droppedHandle.dataset.nodeId
        // Determine connection direction from the dropped handle's type
        const droppedHandleType = droppedHandle.classList.contains('bf-flow__handle--target') ? 'target' : 'source'
        const newConnection: Connection = droppedHandleType === 'target'
          ? { source: anchorNodeId, target: droppedNodeId, sourceHandle: null, targetHandle: null }
          : { source: droppedNodeId, target: anchorNodeId, sourceHandle: null, targetHandle: null }

        const isValid = checkConnectionValidity(store, newConnection)

        if (isValid) {
          // Fire onReconnect callback
          if (store.onReconnect) {
            store.onReconnect(edge, newConnection)
          }

          // Update edges using reconnectEdge utility
          const currentEdges = untrack(store.edges)
          const updatedEdges = reconnectEdgeUtil(edge, newConnection, currentEdges)
          store.setEdges(updatedEdges as EdgeType[])
        }
      }
      // If not dropped on a valid handle, the edge reverts (appearance already restored)

      connectionLine.remove()
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  })
}
