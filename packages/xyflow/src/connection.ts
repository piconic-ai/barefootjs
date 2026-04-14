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
  edgesSvg: SVGSVGElement,
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
    connectionLine.setAttribute('stroke', 'var(--edge-user, #d29922)')
    connectionLine.setAttribute('stroke-width', '2')
    lineGroup.appendChild(connectionLine)

    // Track the currently hovered handle for validation feedback
    let lastHoveredHandle: HTMLElement | null = null

    const onMouseMove = (e: MouseEvent) => {
      // Read fresh viewport and container rect each move — the user
      // may pan/zoom while drawing a connection.
      const containerRect = container.getBoundingClientRect()
      const [, , scale] = store.getTransform()
      const vp = untrack(store.viewport)

      const targetX = (e.clientX - containerRect.left - vp.x) / scale
      const targetY = (e.clientY - containerRect.top - vp.y) / scale

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

      // Hide overlay briefly so elementFromPoint sees handles, not the SVG
      overlaySvg.style.display = 'none'
      const hoverEl = document.elementFromPoint(e.clientX, e.clientY)
      overlaySvg.style.display = ''
      const hoveredHandle = hoverEl?.closest?.('.bf-flow__handle') as HTMLElement | null

      // Clear previous handle's validation classes
      if (lastHoveredHandle && lastHoveredHandle !== hoveredHandle) {
        lastHoveredHandle.classList.remove('invalid')
      }

      if (
        hoveredHandle &&
        hoveredHandle !== handleEl &&
        hoveredHandle.dataset.nodeId &&
        hoveredHandle.dataset.nodeId !== nodeId
      ) {
        // Check handle type compatibility: source→target or target→source
        const hoveredHandleType = hoveredHandle.classList.contains('bf-flow__handle--target') ? 'target' : 'source'
        const isCompatibleType = handleType !== hoveredHandleType

        const srcHandleId = handleEl.dataset.handleId ?? null
        const tgtHandleId = hoveredHandle.dataset.handleId ?? null
        const conn = buildConnection(nodeId, hoveredHandle.dataset.nodeId, handleType, srcHandleId, tgtHandleId)
        const isValid = isCompatibleType && checkConnectionValidity(store, conn)

        hoveredHandle.classList.remove('invalid')
        if (!isValid) hoveredHandle.classList.add('invalid')
        lastHoveredHandle = hoveredHandle
      } else {
        lastHoveredHandle = null
      }
    }

    const onMouseUp = (e: MouseEvent) => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)

      // Clean up validation classes from any hovered handle
      if (lastHoveredHandle) {
        lastHoveredHandle.classList.remove('invalid')
      }

      // Hide overlay so elementFromPoint sees handles, not the SVG
      overlaySvg.style.display = 'none'
      const targetEl = document.elementFromPoint(e.clientX, e.clientY)
      overlaySvg.style.display = ''
      const targetHandle = targetEl?.closest?.('.bf-flow__handle') as HTMLElement | null

      if (
        targetHandle &&
        targetHandle.dataset.nodeId &&
        targetHandle.dataset.nodeId !== nodeId
      ) {
        const targetNodeId = targetHandle.dataset.nodeId
        const targetHandleType = targetHandle.classList.contains('bf-flow__handle--target') ? 'target' : 'source'
        const isCompatibleType = handleType !== targetHandleType
        const srcHandleId = handleEl.dataset.handleId ?? null
        const tgtHandleId = targetHandle.dataset.handleId ?? null
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
    connectionLine.setAttribute('stroke', 'var(--edge-user, #d29922)')
    connectionLine.setAttribute('stroke-width', '2')
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
