import { untrack } from '@barefootjs/client'
import { getBezierPath, Position } from '@xyflow/system'
import type { FlowStore, NodeBase, EdgeBase } from './types'
import { SVG_NS } from './constants'

/**
 * Build a connection object for the given source handle / target handle pair.
 * Used by both validation and edge creation.
 */
function buildConnection(
  sourceNodeId: string,
  targetNodeId: string,
  handleType: 'source' | 'target',
): { source: string; target: string; sourceHandle: string | null; targetHandle: string | null } {
  let source = sourceNodeId
  let target = targetNodeId
  if (handleType === 'target') {
    source = targetNodeId
    target = sourceNodeId
  }
  return { source, target, sourceHandle: null, targetHandle: null }
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

    // Create temporary connection line
    const connectionLine = document.createElementNS(SVG_NS, 'path')
    connectionLine.setAttribute('fill', 'none')
    connectionLine.setAttribute('stroke', '#b1b1b7')
    connectionLine.setAttribute('stroke-width', '1')
    edgesSvg.appendChild(connectionLine)

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

      const [path] = getBezierPath({
        sourceX,
        sourceY,
        sourcePosition: handleType === 'source' ? Position.Bottom : Position.Top,
        targetX,
        targetY,
        targetPosition: handleType === 'source' ? Position.Top : Position.Bottom,
      })

      connectionLine.setAttribute('d', path)

      // Validate connection on hover over target handles
      const hoverEl = document.elementFromPoint(e.clientX, e.clientY)
      const hoveredHandle = hoverEl?.closest?.('.bf-flow__handle') as HTMLElement | null

      // Clear previous handle's validation classes
      if (lastHoveredHandle && lastHoveredHandle !== hoveredHandle) {
        lastHoveredHandle.classList.remove('valid', 'invalid')
      }

      if (
        hoveredHandle &&
        hoveredHandle !== handleEl &&
        hoveredHandle.dataset.nodeId &&
        hoveredHandle.dataset.nodeId !== nodeId
      ) {
        const conn = buildConnection(nodeId, hoveredHandle.dataset.nodeId, handleType)
        const isValid = checkConnectionValidity(store, conn)

        hoveredHandle.classList.remove('valid', 'invalid')
        hoveredHandle.classList.add(isValid ? 'valid' : 'invalid')
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
        lastHoveredHandle.classList.remove('valid', 'invalid')
      }

      // Check if released on a target handle
      const targetEl = document.elementFromPoint(e.clientX, e.clientY)
      const targetHandle = targetEl?.closest?.('.bf-flow__handle') as HTMLElement | null

      if (
        targetHandle &&
        targetHandle.dataset.nodeId &&
        targetHandle.dataset.nodeId !== nodeId
      ) {
        const targetNodeId = targetHandle.dataset.nodeId
        const conn = buildConnection(nodeId, targetNodeId, handleType)

        // Validate before creating edge
        const isValid = checkConnectionValidity(store, conn)

        if (isValid) {
          const edgeId = `e-${conn.source}-${conn.target}-${Date.now()}`
          const newEdge = { id: edgeId, source: conn.source, target: conn.target } as EdgeType

          if (store.onConnect) {
            store.onConnect(conn)
          }

          store.addEdge(newEdge)
        }
      }

      // Remove connection line
      connectionLine.remove()
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  })
}
