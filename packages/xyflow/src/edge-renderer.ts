import {
  createEffect,
  onCleanup,
} from '@barefootjs/client'
import {
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  getEdgePosition,
  getEdgeToolbarTransform,
  ConnectionMode,
  Position,
} from '@xyflow/system'
import type {
  NodeBase,
  EdgeBase,
  EdgePosition,
} from '@xyflow/system'
import type { FlowStore } from './types'
import { SVG_NS } from './constants'

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
    }

    // Remove edges that no longer exist
    for (const removedId of existingIds) {
      const el = edgeElements.get(removedId)
      if (el) { el.remove(); edgeElements.delete(removedId) }
      const hit = hitElements.get(removedId)
      if (hit) { hit.remove(); hitElements.delete(removedId) }
      labelPositions.delete(removedId)
    }
  })

  onCleanup(() => {
    edgeGroup.remove()
    edgeElements.clear()
    hitElements.clear()
    labelPositions.clear()
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
  // Track toolbar element (only one at a time — for the selected edge)
  let toolbarEl: HTMLDivElement | null = null
  let toolbarEdgeId: string | null = null

  createEffect(() => {
    const edges = store.edges()
    store.positionEpoch()
    store.nodes()
    store.nodeLookup()

    const labelPositions = (store as any)._edgeLabelPositions as
      | Map<string, { x: number; y: number }>
      | undefined

    const existingIds = new Set(labelElements.keys())
    let selectedEdgeId: string | null = null
    let selectedLabelX = 0
    let selectedLabelY = 0

    for (const edge of edges) {
      if (edge.hidden) continue

      const pos = labelPositions?.get(edge.id)
      if (!pos) continue

      // Track selected edge for toolbar
      if (edge.selected) {
        selectedEdgeId = edge.id
        selectedLabelX = pos.x
        selectedLabelY = pos.y
      }

      // Only render label if the edge has one
      const labelText = (edge as any).label
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

    // Edge toolbar — show on selected edge, hide otherwise
    if (selectedEdgeId) {
      if (!toolbarEl) {
        toolbarEl = document.createElement('div')
        toolbarEl.className = 'bf-flow__edge-toolbar'
        toolbarEl.style.pointerEvents = 'all'
        labelContainer.appendChild(toolbarEl)
      }

      // Render delete button
      if (toolbarEdgeId !== selectedEdgeId) {
        toolbarEl.innerHTML = ''
        const deleteBtn = document.createElement('button')
        deleteBtn.className = 'bf-flow__edge-toolbar-button'
        deleteBtn.title = 'Delete edge'
        deleteBtn.textContent = '\u00d7' // multiplication sign
        const edgeId = selectedEdgeId
        deleteBtn.addEventListener('mousedown', (e) => {
          e.stopPropagation()
          store.setEdges((prev) => prev.filter((ed) => ed.id !== edgeId))
        })
        toolbarEl.appendChild(deleteBtn)
        toolbarEdgeId = selectedEdgeId
      }

      // Position toolbar below the edge midpoint
      const zoom = store.viewport().zoom
      const toolbarTransform = getEdgeToolbarTransform(
        selectedLabelX,
        selectedLabelY,
        zoom,
        'center',
        'top',
      )
      toolbarEl.style.transform = toolbarTransform
      toolbarEl.style.display = ''
    } else {
      // Hide toolbar when no edge is selected
      if (toolbarEl) {
        toolbarEl.style.display = 'none'
        toolbarEdgeId = null
      }
    }
  })

  onCleanup(() => {
    labelContainer.remove()
    labelElements.clear()
    if (toolbarEl) { toolbarEl.remove(); toolbarEl = null }
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
