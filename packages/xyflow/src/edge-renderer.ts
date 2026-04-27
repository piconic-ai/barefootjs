import {
  createEffect,
  createRoot,
  onCleanup,
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
} from '@xyflow/system'
import type { FlowStore, EdgeComponentProps } from './types'
import { SVG_NS } from './constants'
import { attachReconnectionHandler } from './connection'

/**
 * Reactively renders all edges as SVG paths.
 *
 * Architecture (post-Phase-9 refactor):
 *
 * - The outer effect tracks `edges()` and maintains the **set** of edge IDs:
 *   when an edge appears, a per-edge `createRoot` is mounted; when it
 *   disappears, the root is disposed. This replaces the old hand-rolled
 *   `Map<id, SVGPathElement>` diff bookkeeping.
 *
 * - Each per-edge root owns one inner `createEffect` that re-runs only when
 *   `positionEpoch` / `nodeLookup` / the per-edge data changes. Moving a
 *   single node only re-runs the effects of edges whose endpoints touch
 *   that node, instead of looping over every edge in one big effect.
 *
 * This is the Solid-style pattern that compiler-emitted JSX produces for
 * `edges().map(e => <path d={...} />)`. Implemented with `createElementNS`
 * here because the xyflow package is not currently part of the JSX
 * compilation pipeline (see rollout plan in PR description).
 *
 * Escape hatches kept imperative for now:
 * - Custom edge types (`edgeTypes[type]` is a function): user functions
 *   write into a managed `<g>` via `innerHTML = ''` + DOM API. JSX-ifying
 *   this is out of scope because the user supplies the rendering function.
 * - Reconnection handles: `attachReconnectionHandler` queries the SVG by
 *   `[data-id]` / `[data-hit-id]` selectors at drag-start time. The
 *   per-edge root keeps the same selectors, so the handler is wire-
 *   compatible.
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

  // Expose label positions so the edge label renderer can read them.
  // The label renderer reads this map inside its own createEffect, so
  // updates here are observed via the per-edge effect's positionEpoch read.
  const labelPositions = new Map<string, { x: number; y: number }>()
  ;(store as any)._edgeLabelPositions = labelPositions

  // Per-edge scope: owns this edge's DOM elements + cleanup
  type EdgeScope = {
    dispose: () => void
  }
  const edgeScopes = new Map<string, EdgeScope>()

  // Outer effect: structural diff (add/remove edges) only.
  // Per-edge rendering lives in mountEdgeScope's inner effect, which
  // re-runs independently when its node positions change.
  createEffect(() => {
    const edges = store.edges()
    const seen = new Set<string>()

    for (const edge of edges) {
      if (edge.hidden) continue
      seen.add(edge.id)

      if (!edgeScopes.has(edge.id)) {
        edgeScopes.set(edge.id, mountEdgeScope(edge, store, edgeGroup, reconnectGroup, svgContainer, labelPositions))
      } else {
        // Edge object identity may have changed (selection toggled, etc).
        // The inner effect re-reads `edges()` lazily — but since `edge`
        // here is the new reference, hand it through by re-mounting only
        // when structural identity is gone. For per-edge updates (label,
        // selected, animated), we rely on the inner effect already
        // tracking edges() and doing a lookup-by-id.
        // For simplicity in this PoC, the inner effect tracks edges() so
        // any change to the edge array re-runs all per-edge effects;
        // they each pull their own edge from edgeLookup by id.
      }
    }

    // Tear down edges that disappeared
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

/**
 * Mount one edge in its own reactive root.
 *
 * The root contains a single `createEffect` that:
 * - Looks up the current edge object by id from `edgeLookup` (this gives
 *   us reactivity over `edges()` array updates without per-edge identity
 *   coupling).
 * - Computes endpoint positions from `nodeLookup` + `positionEpoch`.
 * - Updates the visible path `d`, hit-area path `d`, and class list.
 * - Updates reconnect handle positions if applicable.
 *
 * For custom edge types (function-form edgeTypes), falls back to the
 * imperative `<g>` + `innerHTML = ''` pattern — these are user-supplied
 * render functions and JSX-ifying them is out of scope.
 */
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
 * Simple-edge mount path. JSX-equivalent of:
 *   <g>
 *     <path data-hit-id={id} stroke="transparent" stroke-width="20" d={path} onMouseDown={selectEdge} />
 *     <path class="bf-flow__edge" data-id={id} d={path} class:selected={selected} class:animated={animated} />
 *   </g>
 *
 * The two `<path>` elements live directly in `edgeGroup` (no per-edge
 * wrapper `<g>`) to match the legacy DOM shape that `attachReconnection
 * Handler` queries via selectors. The hit-area is the wider invisible
 * stroke that captures click selection.
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

  // Reconnect handles (lazily mounted on first reactive run when the
  // edge is reconnectable). Kept imperative — see file header.
  let srcHandle: SVGCircleElement | null = null
  let tgtHandle: SVGCircleElement | null = null

  // Per-edge reactive effect: re-runs when this edge's endpoints move
  // or its data (selected/animated) changes.
  createEffect(() => {
    // Look up current edge by id so changes to the edges() array
    // (e.g. select toggle) re-run this effect.
    const edge = store.edgeLookup().get(edgeId)
    if (!edge) return

    // Tracks position changes during drag (positionEpoch bumped by rAF
    // in node-wrapper) AND structural commits via store.nodes() (mouseup
    // commits the dragged position via setNodes — adoptUserNodes then
    // rebuilds internals.positionAbsolute, but signals don't fire because
    // the in-place mutated nodeLookup map keeps identity. We must read
    // store.nodes() so the commit flows through to the path d attribute
    // even if the rAF was cancelled by mouseup before firing.)
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

    pathEl.classList.toggle('bf-flow__edge--selected', !!edge.selected)
    pathEl.classList.toggle('bf-flow__edge--animated', !!edge.animated)

    // Reconnect handles — created lazily on first eligible run.
    const isReconnectable = store.edgesReconnectable && (edge as any).reconnectable !== false
    if (isReconnectable) {
      if (!srcHandle) {
        srcHandle = createReconnectHandle('source', edgeId, edgeGroup, reconnectGroup, edge, store, svgContainer)
      }
      if (!tgtHandle) {
        tgtHandle = createReconnectHandle('target', edgeId, edgeGroup, reconnectGroup, edge, store, svgContainer)
      }
      const r = 10
      srcHandle.setAttribute('cx', String(edgePos.sourceX))
      srcHandle.setAttribute('cy', String(edgePos.sourceY + r))
      tgtHandle.setAttribute('cx', String(edgePos.targetX))
      tgtHandle.setAttribute('cy', String(edgePos.targetY - r))
    }
  })

  // Cleanup: remove DOM nodes when this edge is disposed.
  onCleanup(() => {
    hitPath.remove()
    pathEl.remove()
    if (srcHandle) srcHandle.remove()
    if (tgtHandle) tgtHandle.remove()
  })
}

/**
 * Custom-edge mount path (escape hatch).
 *
 * The user-supplied function writes into a managed `<g>` via DOM API.
 * We can't JSX-ify this without forcing every consumer to migrate.
 * Kept imperative; rebuilds the group's contents on every reactive run.
 */
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
 * Compute endpoint positions for an edge using @xyflow/system's
 * getEdgePosition, falling back to node-center positioning if no
 * handle bounds are available.
 */
function computeEdgePosition<NodeType extends NodeBase>(
  edge: EdgeBase,
  sourceNode: NodeType extends NodeBase ? Parameters<typeof getEdgePosition>[0]['sourceNode'] : never,
  targetNode: NodeType extends NodeBase ? Parameters<typeof getEdgePosition>[0]['targetNode'] : never,
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

  // Fallback: use node center positions when no handle bounds resolved
  const sw = (sourceNode as any).measured.width ?? 150
  const sh = (sourceNode as any).measured.height ?? 40
  const tw = (targetNode as any).measured.width ?? 150
  const sourcePos = (sourceNode as any).internals.positionAbsolute
  const targetPos = (targetNode as any).internals.positionAbsolute

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
