import {
  createEffect,
  createMemo,
  createRoot,
  onCleanup,
  untrack,
} from '@barefootjs/client'
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
  InternalNodeBase,
} from '@xyflow/system'
import type { FlowStore, EdgeComponentProps } from './types'
import { SVG_NS } from './constants'
import { attachReconnectionHandler } from './connection'

/**
 * Renders all edges as SVG paths via per-edge `createRoot` scopes — the
 * Solid-style pattern that compiler-emitted JSX produces for
 * `edges().map(e => <path d={...} />)`. The outer effect maintains the
 * mounted set; each per-edge root owns the rendering effect for that
 * edge alone.
 *
 * Custom edge types stay imperative because the user supplies the
 * render function. Reconnect handle hover/grab logic in
 * `attachReconnectionHandler` is pointer-paced and gets no leverage
 * from signal binding — kept imperative for the same reason.
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

  // Sync reconnect overlay transform with viewport
  createEffect(() => {
    const vp = store.viewport()
    reconnectGroup.setAttribute('transform', `translate(${vp.x}, ${vp.y}) scale(${vp.zoom})`)
  })

  // The label renderer reads this map from its own effect, observed via
  // each per-edge effect's positionEpoch read.
  const labelPositions = new Map<string, { x: number; y: number }>()
  ;(store as any)._edgeLabelPositions = labelPositions

  // Per-edge scope: owns this edge's DOM elements + cleanup
  type EdgeScope = {
    dispose: () => void
  }
  const edgeScopes = new Map<string, EdgeScope>()

  // Outer effect: structural diff. Per-edge updates (selected/animated/
  // endpoint position) flow through each scope's own effect, which looks
  // the edge up by id from `edgeLookup`.
  createEffect(() => {
    const edges = store.edges()
    const seen = new Set<string>()

    for (const edge of edges) {
      if (edge.hidden) continue
      seen.add(edge.id)
      if (!edgeScopes.has(edge.id)) {
        edgeScopes.set(edge.id, mountEdgeScope(edge, store, edgeGroup, reconnectGroup, svgContainer, labelPositions))
      }
    }

    for (const [id, scope] of edgeScopes) {
      if (!seen.has(id)) {
        scope.dispose()
        edgeScopes.delete(id)
        labelPositions.delete(id)
      }
    }
  })

  onCleanup(() => {
    for (const scope of edgeScopes.values()) scope.dispose()
    edgeScopes.clear()
    labelPositions.clear()
    edgeGroup.remove()
    reconnectOverlay.remove()
  })
}

/** Mount one edge in its own reactive root, dispatching to simple- or custom-edge mount. */
function mountEdgeScope<
  NodeType extends NodeBase,
  EdgeType extends EdgeBase,
>(
  initialEdge: EdgeType,
  store: FlowStore<NodeType, EdgeType>,
  edgeGroup: SVGGElement,
  reconnectGroup: SVGGElement,
  svgContainer: SVGSVGElement,
  labelPositions: Map<string, { x: number; y: number }>,
): { dispose: () => void } {
  let dispose!: () => void
  const edgeId = initialEdge.id

  createRoot((d) => {
    dispose = d

    const edgeType = initialEdge.type
    const customEdgeType = edgeType && store.edgeTypes?.[edgeType]
    const isCustom = customEdgeType && typeof customEdgeType === 'function'

    if (isCustom) {
      mountCustomEdge(edgeId, store, edgeGroup, labelPositions)
    } else {
      mountSimpleEdge(edgeId, store, edgeGroup, reconnectGroup, svgContainer, labelPositions)
    }
  })

  return { dispose }
}

/**
 * Simple-edge mount. JSX-equivalent of:
 *   <path data-hit-id={id} stroke="transparent" stroke-width="20" d={path} onMouseDown={selectEdge} />
 *   <path class="bf-flow__edge" data-id={id} d={path} class:selected={selected} class:animated={animated} />
 *
 * Both paths sit directly in `edgeGroup` (no per-edge wrapper `<g>`) to
 * keep the selectors `attachReconnectionHandler` queries against intact.
 */
function mountSimpleEdge<
  NodeType extends NodeBase,
  EdgeType extends EdgeBase,
>(
  edgeId: string,
  store: FlowStore<NodeType, EdgeType>,
  edgeGroup: SVGGElement,
  reconnectGroup: SVGGElement,
  svgContainer: SVGSVGElement,
  labelPositions: Map<string, { x: number; y: number }>,
): void {
  // Invisible hit area (wider stroke for click detection)
  const hitPath = document.createElementNS(SVG_NS, 'path')
  hitPath.setAttribute('fill', 'none')
  hitPath.setAttribute('stroke', 'transparent')
  hitPath.setAttribute('stroke-width', '20')
  hitPath.dataset.hitId = edgeId
  hitPath.style.cursor = 'pointer'
  hitPath.style.pointerEvents = 'stroke'
  hitPath.addEventListener('mousedown', (e) => {
    e.stopPropagation()
    const container = store.domNode()
    if (container) container.focus()
    store.unselectNodesAndEdges()
    store.setEdges((prev) =>
      prev.map((ed) =>
        ed.id === edgeId ? { ...ed, selected: true } : ed,
      ),
    )
  })
  edgeGroup.appendChild(hitPath)

  // Visible path
  const pathEl = document.createElementNS(SVG_NS, 'path')
  pathEl.setAttribute('class', 'bf-flow__edge')
  pathEl.dataset.id = edgeId
  edgeGroup.appendChild(pathEl)

  let srcHandle: SVGCircleElement | null = null
  let tgtHandle: SVGCircleElement | null = null

  // Per-edge field memos. createSignal/createMemo dedupe on Object.is, so
  // a memo over a primitive (boolean) only fires when its value actually
  // changes. This isolates per-edge property updates: toggling another
  // edge's `selected` no longer re-runs this edge's class effect.
  const selected = createMemo(() => !!store.edgeLookup().get(edgeId)?.selected)
  const animated = createMemo(() => !!store.edgeLookup().get(edgeId)?.animated)
  const reconnectable = createMemo(
    () =>
      store.edgesReconnectable &&
      (store.edgeLookup().get(edgeId) as { reconnectable?: boolean } | undefined)
        ?.reconnectable !== false &&
      !!store.edgeLookup().get(edgeId),
  )

  // Class effect: tracks only selected/animated (per-edge isolated).
  createEffect(() => {
    pathEl.classList.toggle('bf-flow__edge--selected', selected())
    pathEl.classList.toggle('bf-flow__edge--animated', animated())
  })

  // Position effect: tracks position signals + edgeLookup (for source/
  // target/handle ids). Re-runs on any edges array change, but the
  // setAttribute calls are DOM-level no-ops when the resulting `d` string
  // is identical, so unrelated edge updates don't dirty the path.
  createEffect(() => {
    const edge = store.edgeLookup().get(edgeId)
    if (!edge) return

    // BOTH reads are required. positionEpoch fires for in-flight drag
    // updates (rAF-batched in node-wrapper); nodes() fires for the
    // post-drag commit, where setNodes mutates nodeLookup in place
    // (identity preserved → no positionEpoch bump). Reading nodes()
    // catches that commit even when rAF was cancelled by mouseup.
    store.positionEpoch()
    store.nodes()
    const nodeLookup = store.nodeLookup()

    const sourceNode = nodeLookup.get(edge.source)
    const targetNode = nodeLookup.get(edge.target)
    if (!sourceNode || !targetNode) return

    const edgePos = computeEdgePosition(edge, sourceNode, targetNode)
    if (!edgePos) return

    const pathData = getEdgePath(edge, edgePos)
    if (!pathData) return

    const [path, labelX, labelY] = pathData
    labelPositions.set(edgeId, { x: labelX, y: labelY })

    pathEl.setAttribute('d', path)
    hitPath.setAttribute('d', path)

    if (srcHandle && tgtHandle) {
      const r = 10
      srcHandle.setAttribute('cx', String(edgePos.sourceX))
      srcHandle.setAttribute('cy', String(edgePos.sourceY + r))
      tgtHandle.setAttribute('cx', String(edgePos.targetX))
      tgtHandle.setAttribute('cy', String(edgePos.targetY - r))
    }
  })

  // Reconnect lifecycle: tracks the reconnectable memo only. `untrack`
  // the edge fetch so this effect doesn't re-run for unrelated edges-array
  // changes.
  createEffect(() => {
    if (!reconnectable()) {
      srcHandle?.remove()
      srcHandle = null
      tgtHandle?.remove()
      tgtHandle = null
      return
    }
    const edge = untrack(() => store.edgeLookup().get(edgeId))
    if (!edge) return
    if (!srcHandle) {
      srcHandle = createReconnectHandle('source', edgeId, edgeGroup, reconnectGroup, edge, store, svgContainer)
    }
    if (!tgtHandle) {
      tgtHandle = createReconnectHandle('target', edgeId, edgeGroup, reconnectGroup, edge, store, svgContainer)
    }
  })

  onCleanup(() => {
    hitPath.remove()
    pathEl.remove()
    srcHandle?.remove()
    tgtHandle?.remove()
  })
}

/** Custom-edge mount: rebuilds a managed `<g>`'s contents via the user-supplied render fn. */
function mountCustomEdge<
  NodeType extends NodeBase,
  EdgeType extends EdgeBase,
>(
  edgeId: string,
  store: FlowStore<NodeType, EdgeType>,
  edgeGroup: SVGGElement,
  labelPositions: Map<string, { x: number; y: number }>,
): void {
  const group = document.createElementNS(SVG_NS, 'g')
  group.setAttribute('class', 'bf-flow__edge-custom')
  group.dataset.id = edgeId
  group.style.cursor = 'pointer'
  group.style.pointerEvents = 'all'
  group.addEventListener('mousedown', (e) => {
    e.stopPropagation()
    const container = store.domNode()
    if (container) container.focus()
    store.unselectNodesAndEdges()
    store.setEdges((prev) =>
      prev.map((ed) =>
        ed.id === edgeId ? { ...ed, selected: true } : ed,
      ),
    )
  })
  edgeGroup.appendChild(group)

  createEffect(() => {
    const edge = store.edgeLookup().get(edgeId)
    if (!edge) return

    // See mountSimpleEdge for why both positionEpoch and nodes() are read.
    store.positionEpoch()
    store.nodes()
    const nodeLookup = store.nodeLookup()

    const sourceNode = nodeLookup.get(edge.source)
    const targetNode = nodeLookup.get(edge.target)
    if (!sourceNode || !targetNode) return

    const edgePos = computeEdgePosition(edge, sourceNode, targetNode)
    if (!edgePos) return

    const midX = (edgePos.sourceX + edgePos.targetX) / 2
    const midY = (edgePos.sourceY + edgePos.targetY) / 2
    labelPositions.set(edgeId, { x: midX, y: midY })

    // Clear and re-render custom content
    group.innerHTML = ''

    const edgeType = edge.type
    const customEdgeType = edgeType && store.edgeTypes?.[edgeType]
    if (typeof customEdgeType !== 'function') return

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
  })

  onCleanup(() => {
    group.remove()
  })
}

/**
 * Compute endpoint positions for an edge, falling back to node-center
 * positioning when no handle bounds are available.
 */
function computeEdgePosition(
  edge: EdgeBase,
  sourceNode: InternalNodeBase,
  targetNode: InternalNodeBase,
): EdgePosition | null {
  const hasHandleIds = !!(edge.sourceHandle || edge.targetHandle)
  const edgePos = getEdgePosition({
    id: edge.id,
    sourceNode,
    sourceHandle: edge.sourceHandle ?? null,
    targetNode,
    targetHandle: edge.targetHandle ?? null,
    connectionMode: hasHandleIds ? ConnectionMode.Strict : ConnectionMode.Loose,
  })

  if (edgePos) return edgePos

  const sw = sourceNode.measured.width ?? 150
  const sh = sourceNode.measured.height ?? 40
  const tw = targetNode.measured.width ?? 150
  const sourcePos = sourceNode.internals.positionAbsolute
  const targetPos = targetNode.internals.positionAbsolute

  return {
    sourceX: sourcePos.x + sw / 2,
    sourceY: sourcePos.y + sh,
    targetX: targetPos.x + tw / 2,
    targetY: targetPos.y,
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
  }
}

/**
 * Create a reconnection handle circle and wire it up.
 * The element is appended to `reconnectGroup` (the overlay above nodes),
 * but the hover effect targets the visible path inside `edgeGroup`.
 */
function createReconnectHandle<
  NodeType extends NodeBase,
  EdgeType extends EdgeBase,
>(
  endpointType: 'source' | 'target',
  edgeId: string,
  edgeGroup: SVGGElement,
  reconnectGroup: SVGGElement,
  edge: EdgeType,
  store: FlowStore<NodeType, EdgeType>,
  svgContainer: SVGSVGElement,
): SVGCircleElement {
  const handle = document.createElementNS(SVG_NS, 'circle') as SVGCircleElement
  handle.setAttribute(
    'class',
    `bf-flow__edge-reconnect bf-flow__edge-reconnect--${endpointType}`,
  )
  handle.setAttribute('r', '10')
  handle.style.pointerEvents = 'all'
  reconnectGroup.appendChild(handle)

  // Hover: darken the visible edge path while pointing at the handle.
  // Resolve the edge element via querySelector each time so we don't
  // hold a stale reference if the path was re-mounted.
  handle.addEventListener('mouseenter', () => {
    edgeGroup
      .querySelector(`.bf-flow__edge[data-id="${edgeId}"]`)
      ?.classList.add('bf-flow__edge--reconnect-hover')
  })
  handle.addEventListener('mouseleave', () => {
    edgeGroup
      .querySelector(`.bf-flow__edge[data-id="${edgeId}"]`)
      ?.classList.remove('bf-flow__edge--reconnect-hover')
  })

  const container = store.domNode()
  if (container) {
    attachReconnectionHandler(handle, edge, endpointType, container, svgContainer, store)
  }

  return handle
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
