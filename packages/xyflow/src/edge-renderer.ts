import {
  createEffect,
  onCleanup,
} from '@barefootjs/client'
import {
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  getEdgePosition,
  ConnectionMode,
} from '@xyflow/system'
import type {
  NodeBase,
  EdgeBase,
} from '@xyflow/system'
import type { FlowStore } from './types'

const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * Reactively renders all edges as SVG paths.
 * A single effect re-draws all edges when edges or node positions change.
 */
export function createEdgeRenderer<
  NodeType extends NodeBase = NodeBase,
  EdgeType extends EdgeBase = EdgeBase,
>(
  store: FlowStore<NodeType, EdgeType>,
  svgContainer: SVGSVGElement,
): void {
  // Reusable SVG group for edge paths
  const edgeGroup = document.createElementNS(SVG_NS, 'g')
  edgeGroup.setAttribute('class', 'bf-flow__edge-group')
  svgContainer.appendChild(edgeGroup)

  // Track edge path elements and hit areas by edge id
  const edgeElements = new Map<string, SVGPathElement>()
  const hitElements = new Map<string, SVGPathElement>()

  createEffect(() => {
    const edges = store.edges()
    // Read nodes() to re-run when node positions change (setNodes during drag)
    store.nodes()
    const nodeLookup = store.nodeLookup()
    const existingIds = new Set(edgeElements.keys())

    for (const edge of edges) {
      if (edge.hidden) continue

      existingIds.delete(edge.id)

      const sourceNode = nodeLookup.get(edge.source)
      const targetNode = nodeLookup.get(edge.target)

      if (!sourceNode || !targetNode) continue

      // Get source/target positions from @xyflow/system
      let edgePos = getEdgePosition({
        id: edge.id,
        sourceNode,
        sourceHandle: edge.sourceHandle ?? null,
        targetNode,
        targetHandle: edge.targetHandle ?? null,
        connectionMode: ConnectionMode.Loose,
      })

      // Fallback: if no handle bounds, use node center positions
      if (!edgePos) {
        const sw = sourceNode.measured.width ?? 150
        const sh = sourceNode.measured.height ?? 40
        const tw = targetNode.measured.width ?? 150
        const th = targetNode.measured.height ?? 40

        const sourcePos = sourceNode.internals.positionAbsolute
        const targetPos = targetNode.internals.positionAbsolute

        edgePos = {
          sourceX: sourcePos.x + sw / 2,
          sourceY: sourcePos.y + sh,
          targetX: targetPos.x + tw / 2,
          targetY: targetPos.y,
          sourcePosition: 'bottom' as any,
          targetPosition: 'top' as any,
        }
      }

      // Calculate path based on edge type (default: bezier)
      const pathData = getEdgePath(edge, edgePos)
      if (!pathData) continue

      const [path] = pathData

      // Create or update path element
      let pathEl = edgeElements.get(edge.id)
      if (!pathEl) {
        // Invisible hit area for click selection (wider than visible path)
        const hitPath = document.createElementNS(SVG_NS, 'path')
        hitPath.setAttribute('fill', 'none')
        hitPath.setAttribute('stroke', 'transparent')
        hitPath.setAttribute('stroke-width', '20')
        hitPath.style.cursor = 'pointer'
        hitPath.style.pointerEvents = 'stroke'
        hitPath.addEventListener('mousedown', (e) => {
          e.stopPropagation()
          const edgeId = edge.id
          store.unselectNodesAndEdges()
          store.setEdges((prev) =>
            prev.map((ed) =>
              ed.id === edgeId ? { ...ed, selected: true } : ed,
            ),
          )
        })
        edgeGroup.appendChild(hitPath)
        hitElements.set(edge.id, hitPath)

        // Visible path
        pathEl = document.createElementNS(SVG_NS, 'path')
        pathEl.setAttribute('class', 'bf-flow__edge')
        pathEl.dataset.id = edge.id
        pathEl.setAttribute('fill', 'none')
        pathEl.setAttribute('stroke', '#b1b1b7')
        pathEl.setAttribute('stroke-width', '1')
        pathEl.style.pointerEvents = 'none'
        edgeGroup.appendChild(pathEl)
        edgeElements.set(edge.id, pathEl)
      }

      pathEl.setAttribute('d', path)

      // Update hit area path
      const hitEl = hitElements.get(edge.id)
      if (hitEl) hitEl.setAttribute('d', path)

      // Update selection styling
      if (edge.selected) {
        pathEl.setAttribute('stroke', '#555')
        pathEl.setAttribute('stroke-width', '2')
      } else {
        pathEl.setAttribute('stroke', '#b1b1b7')
        pathEl.setAttribute('stroke-width', '1')
      }

      // Animated edges
      if (edge.animated) {
        pathEl.setAttribute('stroke-dasharray', '5')
        pathEl.classList.add('bf-flow__edge--animated')
      }
    }

    // Remove edges that no longer exist
    for (const removedId of existingIds) {
      const el = edgeElements.get(removedId)
      if (el) { el.remove(); edgeElements.delete(removedId) }
      const hit = hitElements.get(removedId)
      if (hit) { hit.remove(); hitElements.delete(removedId) }
    }
  })

  onCleanup(() => {
    edgeGroup.remove()
    edgeElements.clear()
  })
}

/**
 * Calculate edge path based on edge type.
 * Returns [path, labelX, labelY, offsetX, offsetY] or null.
 */
function getEdgePath(
  edge: EdgeBase,
  pos: { sourceX: number; sourceY: number; targetX: number; targetY: number; sourcePosition: any; targetPosition: any },
): [string, number, number, number, number] | null {
  const params = {
    sourceX: pos.sourceX,
    sourceY: pos.sourceY,
    sourcePosition: pos.sourcePosition,
    targetX: pos.targetX,
    targetY: pos.targetY,
    targetPosition: pos.targetPosition,
  }

  // Determine edge type from data or default to bezier
  const edgeType = (edge as any).type ?? 'default'

  switch (edgeType) {
    case 'straight':
      return getStraightPath(params) as [string, number, number, number, number]
    case 'smoothstep':
    case 'step':
      return getSmoothStepPath({
        ...params,
        borderRadius: edgeType === 'step' ? 0 : undefined,
      }) as [string, number, number, number, number]
    case 'default':
    case 'bezier':
    default:
      return getBezierPath(params)
  }
}
