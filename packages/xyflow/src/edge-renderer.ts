import {
  createEffect,
  onCleanup,
} from '@barefootjs/client/runtime'
import {
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  getEdgePosition,
  ConnectionMode,
  Position,
} from '@xyflow/system'
import type {
  NodeBase,
  EdgeBase,
  EdgePosition,
} from '@xyflow/system'
import type { FlowStore, EdgeComponentProps } from './types'
import { SVG_NS } from './constants'
import { attachReconnectionHandler } from './connection'

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

  // Overlay SVG for reconnection handles — above nodes layer.
  // The main edges SVG is behind nodes; this overlay lets reconnect
  // handles receive mouse events on top of node elements.
  const viewportEl = svgContainer.parentElement!
  const reconnectOverlay = document.createElementNS(SVG_NS, 'svg')
  reconnectOverlay.setAttribute('class', 'bf-flow__reconnect-overlay')
  reconnectOverlay.style.position = 'absolute'
  reconnectOverlay.style.top = '0'
  reconnectOverlay.style.left = '0'
  reconnectOverlay.style.width = '100%'
  reconnectOverlay.style.height = '100%'
  reconnectOverlay.style.overflow = 'visible'
  reconnectOverlay.style.pointerEvents = 'none'
  reconnectOverlay.style.zIndex = '5'
  viewportEl.appendChild(reconnectOverlay)

  const reconnectGroup = document.createElementNS(SVG_NS, 'g')
  reconnectOverlay.appendChild(reconnectGroup)

  // Track edge path elements, hit areas, custom groups, and reconnection handles by edge id
  const edgeElements = new Map<string, SVGPathElement>()
  const hitElements = new Map<string, SVGPathElement>()
  const customEdgeGroups = new Map<string, SVGGElement>()
  const reconnectSourceHandles = new Map<string, SVGCircleElement>()
  const reconnectTargetHandles = new Map<string, SVGCircleElement>()

  // Expose label positions so the edge label renderer can read them
  const labelPositions = new Map<string, { x: number; y: number }>()
  ;(store as any)._edgeLabelPositions = labelPositions

  createEffect(() => {
    const edges = store.edges()
    // Re-run when node positions change during drag (lightweight epoch bump)
    // or when nodes are structurally changed (add/remove triggers nodes()).
    store.positionEpoch()
    store.nodes()
    const nodeLookup = store.nodeLookup()

    // Sync reconnect overlay transform with viewport
    const vp = store.viewport()
    reconnectGroup.setAttribute('transform', `translate(${vp.x}, ${vp.y}) scale(${vp.zoom})`)
    const existingIds = new Set(edgeElements.keys())

    for (const edge of edges) {
      if (edge.hidden) continue

      existingIds.delete(edge.id)

      const sourceNode = nodeLookup.get(edge.source)
      const targetNode = nodeLookup.get(edge.target)

      if (!sourceNode || !targetNode) continue

      // Get source/target positions from @xyflow/system.
      // Use Strict mode when handle IDs are present so the exact handle is
      // resolved by ID rather than by closest-position heuristic (Loose).
      const hasHandleIds = !!(edge.sourceHandle || edge.targetHandle)
      let edgePos = getEdgePosition({
        id: edge.id,
        sourceNode,
        sourceHandle: edge.sourceHandle ?? null,
        targetNode,
        targetHandle: edge.targetHandle ?? null,
        connectionMode: hasHandleIds ? ConnectionMode.Strict : ConnectionMode.Loose,
      })

      // Fallback: if no handle bounds, use node center positions
      if (!edgePos) {
        const sw = sourceNode.measured.width ?? 150
        const sh = sourceNode.measured.height ?? 40
        const tw = targetNode.measured.width ?? 150

        const sourcePos = sourceNode.internals.positionAbsolute
        const targetPos = targetNode.internals.positionAbsolute

        edgePos = {
          sourceX: sourcePos.x + sw / 2,
          sourceY: sourcePos.y + sh,
          targetX: targetPos.x + tw / 2,
          targetY: targetPos.y,
          sourcePosition: Position.Bottom,
          targetPosition: Position.Top,
        }
      }

      // Check for custom edge type
      const edgeType = edge.type
      const customEdgeType = edgeType && store.edgeTypes?.[edgeType]

      if (customEdgeType && typeof customEdgeType === 'function') {
        // Custom edge rendering via plain function
        const midX = (edgePos.sourceX + edgePos.targetX) / 2
        const midY = (edgePos.sourceY + edgePos.targetY) / 2
        labelPositions.set(edge.id, { x: midX, y: midY })

        let group = customEdgeGroups.get(edge.id)
        if (!group) {
          group = document.createElementNS(SVG_NS, 'g')
          group.setAttribute('class', 'bf-flow__edge-custom')
          group.dataset.id = edge.id
          group.style.cursor = 'pointer'
          group.style.pointerEvents = 'all'
          group.addEventListener('mousedown', (e) => {
            e.stopPropagation()
            const container = store.domNode()
            if (container) container.focus()
            const edgeId = edge.id
            store.unselectNodesAndEdges()
            store.setEdges((prev) =>
              prev.map((ed) =>
                ed.id === edgeId ? { ...ed, selected: true } : ed,
              ),
            )
          })
          edgeGroup.appendChild(group)
          customEdgeGroups.set(edge.id, group)

          // Also track in edgeElements for cleanup
          edgeElements.set(edge.id, group as unknown as SVGPathElement)
        }

        // Clear and re-render custom content
        group.innerHTML = ''

        const edgeProps: EdgeComponentProps<EdgeType> = {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceX: edgePos.sourceX,
          sourceY: edgePos.sourceY,
          targetX: edgePos.targetX,
          targetY: edgePos.targetY,
          sourcePosition: edgePos.sourcePosition,
          targetPosition: edgePos.targetPosition,
          data: edge.data,
          selected: !!edge.selected,
          animated: !!edge.animated,
          label: (edge as EdgeType & { label?: string }).label,
          svgGroup: group,
        }

        customEdgeType(edgeProps)
        continue
      }

      const pathData = getEdgePath(edge, edgePos)
      if (!pathData) continue

      const [path, labelX, labelY] = pathData

      // Store label position for the edge label renderer
      labelPositions.set(edge.id, { x: labelX, y: labelY })

      let pathEl = edgeElements.get(edge.id)
      if (!pathEl) {
        // Invisible hit area for click selection (wider than visible path)
        const hitPath = document.createElementNS(SVG_NS, 'path')
        hitPath.setAttribute('fill', 'none')
        hitPath.setAttribute('stroke', 'transparent')
        hitPath.setAttribute('stroke-width', '20')
        hitPath.dataset.hitId = edge.id
        hitPath.style.cursor = 'pointer'
        hitPath.style.pointerEvents = 'stroke'
        hitPath.addEventListener('mousedown', (e) => {
          e.stopPropagation()
          // Focus container for keyboard events (Delete)
          const container = store.domNode()
          if (container) container.focus()
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
        edgeGroup.appendChild(pathEl)
        edgeElements.set(edge.id, pathEl)
      }

      pathEl.setAttribute('d', path)

      // Update hit area path
      const hitEl = hitElements.get(edge.id)
      if (hitEl) hitEl.setAttribute('d', path)

      pathEl.classList.toggle('bf-flow__edge--selected', !!edge.selected)
      pathEl.classList.toggle('bf-flow__edge--animated', !!edge.animated)

      // Edge reconnection handles
      const isReconnectable = store.edgesReconnectable && (edge as any).reconnectable !== false
      if (isReconnectable) {
        // Source reconnection handle
        let srcHandle = reconnectSourceHandles.get(edge.id)
        if (!srcHandle) {
          srcHandle = document.createElementNS(SVG_NS, 'circle') as SVGCircleElement
          srcHandle.setAttribute('class', 'bf-flow__edge-reconnect bf-flow__edge-reconnect--source')
          srcHandle.setAttribute('r', '10')
          srcHandle.style.pointerEvents = 'all'
          reconnectGroup.appendChild(srcHandle)
          reconnectSourceHandles.set(edge.id, srcHandle)
          // Darken edge on reconnect handle hover
          const srcEdgeId = edge.id
          srcHandle.addEventListener('mouseenter', () => {
            edgeElements.get(srcEdgeId)?.classList.add('bf-flow__edge--reconnect-hover')
          })
          srcHandle.addEventListener('mouseleave', () => {
            edgeElements.get(srcEdgeId)?.classList.remove('bf-flow__edge--reconnect-hover')
          })
          // Attach reconnection handler
          const container = store.domNode()
          if (container) {
            attachReconnectionHandler(srcHandle, edge, 'source', container, svgContainer, store)
          }
        }
        // Shift outward from node by radius (matching React Flow's shiftX/shiftY)
        const srcR = 10
        srcHandle.setAttribute('cx', String(edgePos.sourceX))
        srcHandle.setAttribute('cy', String(edgePos.sourceY + srcR))

        // Target reconnection handle
        let tgtHandle = reconnectTargetHandles.get(edge.id)
        if (!tgtHandle) {
          tgtHandle = document.createElementNS(SVG_NS, 'circle') as SVGCircleElement
          tgtHandle.setAttribute('class', 'bf-flow__edge-reconnect bf-flow__edge-reconnect--target')
          tgtHandle.setAttribute('r', '10')
          tgtHandle.style.pointerEvents = 'all'
          reconnectGroup.appendChild(tgtHandle)
          reconnectTargetHandles.set(edge.id, tgtHandle)
          const tgtEdgeId = edge.id
          tgtHandle.addEventListener('mouseenter', () => {
            edgeElements.get(tgtEdgeId)?.classList.add('bf-flow__edge--reconnect-hover')
          })
          tgtHandle.addEventListener('mouseleave', () => {
            edgeElements.get(tgtEdgeId)?.classList.remove('bf-flow__edge--reconnect-hover')
          })
          const container = store.domNode()
          if (container) {
            attachReconnectionHandler(tgtHandle, edge, 'target', container, svgContainer, store)
          }
        }
        // Shift outward from node by radius (matching React Flow's shiftX/shiftY)
        const tgtR = 10
        tgtHandle.setAttribute('cx', String(edgePos.targetX))
        tgtHandle.setAttribute('cy', String(edgePos.targetY - tgtR))
      }
    }

    // Remove edges that no longer exist
    for (const removedId of existingIds) {
      const el = edgeElements.get(removedId)
      if (el) { el.remove(); edgeElements.delete(removedId) }
      const hit = hitElements.get(removedId)
      if (hit) { hit.remove(); hitElements.delete(removedId) }
      const customGroup = customEdgeGroups.get(removedId)
      if (customGroup) { customGroup.remove(); customEdgeGroups.delete(removedId) }
      labelPositions.delete(removedId)
      const srcH = reconnectSourceHandles.get(removedId)
      if (srcH) { srcH.remove(); reconnectSourceHandles.delete(removedId) }
      const tgtH = reconnectTargetHandles.get(removedId)
      if (tgtH) { tgtH.remove(); reconnectTargetHandles.delete(removedId) }
    }
  })

  onCleanup(() => {
    edgeGroup.remove()
    reconnectOverlay.remove()
    edgeElements.clear()
    hitElements.clear()
    customEdgeGroups.clear()
    labelPositions.clear()
    reconnectSourceHandles.clear()
    reconnectTargetHandles.clear()
  })
}

/**
 * Reactively renders edge labels and edge toolbar as HTML elements
 * in a layer above the SVG edges.
 *
 * Edge labels are positioned at the midpoint of each edge using CSS transforms.
 * When an edge is selected, a toolbar with a delete button appears near the midpoint.
 */
export function createEdgeLabelRenderer<
  NodeType extends NodeBase = NodeBase,
  EdgeType extends EdgeBase = EdgeBase,
>(
  store: FlowStore<NodeType, EdgeType>,
  viewportEl: HTMLElement,
): void {
  // Container for edge labels — positioned absolutely inside the viewport
  const labelContainer = document.createElement('div')
  labelContainer.className = 'bf-flow__edge-labels'
  labelContainer.style.position = 'absolute'
  labelContainer.style.top = '0'
  labelContainer.style.left = '0'
  labelContainer.style.width = '0'
  labelContainer.style.height = '0'
  labelContainer.style.pointerEvents = 'none'
  viewportEl.appendChild(labelContainer)

  // Track label elements by edge id
  const labelElements = new Map<string, HTMLDivElement>()

  createEffect(() => {
    const edges = store.edges()
    store.positionEpoch()
    store.nodes()
    store.nodeLookup()

    const labelPositions = (store as any)._edgeLabelPositions as
      | Map<string, { x: number; y: number }>
      | undefined

    const existingIds = new Set(labelElements.keys())

    for (const edge of edges) {
      if (edge.hidden) continue

      const pos = labelPositions?.get(edge.id)
      if (!pos) continue

      // Only render label if the edge has one
      const labelText = (edge as EdgeType & { label?: string }).label
      if (!labelText) {
        // No label — remove if previously existed
        const existing = labelElements.get(edge.id)
        if (existing) {
          existing.remove()
          labelElements.delete(edge.id)
        }
        existingIds.delete(edge.id)
        continue
      }

      existingIds.delete(edge.id)

      let labelEl = labelElements.get(edge.id)
      if (!labelEl) {
        labelEl = document.createElement('div')
        labelEl.className = 'bf-flow__edge-label'
        labelEl.dataset.edgeId = edge.id
        labelEl.style.pointerEvents = 'all'
        labelContainer.appendChild(labelEl)
        labelElements.set(edge.id, labelEl)
      }

      // Update content
      if (labelEl.textContent !== String(labelText)) {
        labelEl.textContent = String(labelText)
      }

      // Position at edge midpoint using transform
      labelEl.style.transform =
        `translate(-50%, -50%) translate(${pos.x}px, ${pos.y}px)`

      labelEl.classList.toggle('bf-flow__edge-label--selected', !!edge.selected)
    }

    // Remove labels for edges that no longer exist
    for (const removedId of existingIds) {
      const el = labelElements.get(removedId)
      if (el) { el.remove(); labelElements.delete(removedId) }
    }

  })

  onCleanup(() => {
    labelContainer.remove()
    labelElements.clear()
  })
}

/**
 * Calculate edge path based on edge type.
 * Returns [path, labelX, labelY, offsetX, offsetY] or null.
 */
function getEdgePath(
  edge: EdgeBase,
  pos: EdgePosition,
): [string, number, number, number, number] | null {
  const params = {
    sourceX: pos.sourceX,
    sourceY: pos.sourceY,
    sourcePosition: pos.sourcePosition,
    targetX: pos.targetX,
    targetY: pos.targetY,
    targetPosition: pos.targetPosition,
  }

  const edgeType = edge.type ?? 'default'

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
