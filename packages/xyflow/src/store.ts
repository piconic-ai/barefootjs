import {
  createSignal,
  createEffect,
  createMemo,
  untrack,
} from '@barefootjs/client'
import {
  adoptUserNodes,
  updateAbsolutePositions,
  updateConnectionLookup,
  fitViewport,
  panBy as panByUtil,
} from '@xyflow/system'
import type {
  NodeBase,
  EdgeBase,
  InternalNodeBase,
  Viewport,
  NodeLookup,
  ParentLookup,
  EdgeLookup,
  ConnectionLookup,
  SnapGrid,
  NodeOrigin,
  Transform,
  PanZoomInstance,
  NodeDragItem,
  XYPosition,
} from '@xyflow/system'
import type { FlowStoreOptions, InternalFlowStore, FitViewOptions } from './types'
import { INFINITE_EXTENT } from './constants'

const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 }

/**
 * Create a signal-based reactive store that bridges @xyflow/system
 * with BarefootJS reactivity.
 */
export function createFlowStore<
  NodeType extends NodeBase = NodeBase,
  EdgeType extends EdgeBase = EdgeBase,
>(options: FlowStoreOptions<NodeType, EdgeType> = {}): InternalFlowStore<NodeType, EdgeType> {
  // --- Configuration ---
  const minZoom = options.minZoom ?? 0.5
  const maxZoom = options.maxZoom ?? 2
  const nodeOrigin: NodeOrigin = options.nodeOrigin ?? [0, 0]
  const nodeExtent = options.nodeExtent ?? INFINITE_EXTENT
  const snapToGrid = options.snapToGrid ?? false
  const snapGrid: SnapGrid = options.snapGrid ?? [15, 15]
  const edgesReconnectable = options.edgesReconnectable ?? false

  // --- Core state signals ---
  const [nodes, setNodes] = createSignal<NodeType[]>(options.nodes ?? [])
  const [edges, setEdges] = createSignal<EdgeType[]>(options.edges ?? [])
  const [viewport, setViewport] = createSignal<Viewport>(
    options.defaultViewport ?? DEFAULT_VIEWPORT
  )
  const [width, setWidth] = createSignal(0)
  const [height, setHeight] = createSignal(0)
  const [dragging, setDragging] = createSignal(false)

  // --- Internal refs ---
  const [panZoom, setPanZoom] = createSignal<PanZoomInstance | null>(null)
  const [domNode, setDomNode] = createSignal<HTMLElement | null>(null)

  // --- Lookups ---
  //
  // The outer signals hold the lookup `Map` for iteration-style
  // consumers (edge-path effect, adapters that walk every node). They
  // emit a fresh `Map` reference on each change so barefoot's
  // identity-based dedupe does not suppress notification.
  //
  // The internal map of per-node signals (`nodeSignals`) is what
  // delivers the fine-grained channel: per-node consumers subscribe
  // through `nodeSignal(id)` and only wake up when *that* node's entry
  // changes. This removes the recurring "read `nodes()` first to wake
  // up the lookup" workaround at its source (#1270).
  const [nodeLookup, setNodeLookup] = createSignal<NodeLookup<InternalNodeBase<NodeType>>>(
    new Map()
  )
  const [parentLookup, setParentLookup] = createSignal<ParentLookup<InternalNodeBase<NodeType>>>(
    new Map()
  )
  const [edgeLookup, setEdgeLookup] = createSignal<EdgeLookup<EdgeType>>(new Map())
  const [connectionLookup, setConnectionLookup] = createSignal<ConnectionLookup>(new Map())

  type NodeSignalSlot = {
    get: () => InternalNodeBase<NodeType> | undefined
    set: (
      value:
        | InternalNodeBase<NodeType>
        | undefined
        | ((prev: InternalNodeBase<NodeType> | undefined) => InternalNodeBase<NodeType> | undefined),
    ) => void
  }
  const nodeSignals = new Map<string, NodeSignalSlot>()

  // Slots are retained across remove → re-add so a consumer that
  // called `nodeSignal(id)` before the node was added (or after it was
  // removed) keeps subscribing to the same slot and is notified when
  // the node appears.
  function getOrCreateNodeSlot(id: string): NodeSignalSlot {
    let slot = nodeSignals.get(id)
    if (!slot) {
      const [get, set] = createSignal<InternalNodeBase<NodeType> | undefined>(undefined)
      slot = { get, set: set as NodeSignalSlot['set'] }
      nodeSignals.set(id, slot)
    }
    return slot
  }

  function nodeSignal(id: string): InternalNodeBase<NodeType> | undefined {
    return getOrCreateNodeSlot(id).get()
  }

  // Lightweight counter for notifying position-dependent subscribers (edges,
  // per-node position effects) without triggering the full adoptUserNodes
  // pipeline. Bumped by the drag handler after mutating nodeLookup in-place.
  const [positionEpoch, setPositionEpoch] = createSignal(0)

  // --- Derived state ---

  /**
   * Process user nodes through @xyflow/system's adoptUserNodes.
   * This populates nodeLookup/parentLookup and calculates internals.
   * Returns whether all nodes have measured dimensions.
   */
  const nodesInitialized = createMemo(() => {
    const currentNodes = nodes()
    const lookup = untrack(nodeLookup)
    const parents = untrack(parentLookup)

    // Preserve measured dimensions from existing internal nodes.
    // adoptUserNodes reads userNode.measured but setNodes callers
    // may not include it. Inject from existing lookup before rebuild.
    for (const userNode of currentNodes) {
      if (userNode.measured?.width) continue
      const existing = lookup.get(userNode.id)
      if (existing?.measured.width) {
        ;(userNode as NodeBase).measured = {
          width: existing.measured.width,
          height: existing.measured.height,
        }
      }
    }

    const result = adoptUserNodes(currentNodes, lookup, parents, {
      nodeOrigin,
      nodeExtent,
      checkEquality: false,
    })

    updateAbsolutePositions(lookup, parents, {
      nodeOrigin,
      nodeExtent,
    })

    // Reconcile the per-node signal cache with the freshly-rebuilt
    // lookup. `adoptUserNodes(..., checkEquality: false)` constructs
    // a new InternalNode wrapper for every entry on every call, so
    // entry identity is **not** a reliable change signal. The
    // underlying `internals.userNode` reference, however, only flips
    // when `setNodes` actually produced a new node identity (callers
    // use `prev.map(n => n.id === target ? { ...n, ... } : n)`), so
    // we gate on that — sibling ids whose user node is unchanged stay
    // silent. Removed ids see `undefined`.
    for (const [id, entry] of lookup) {
      const slot = getOrCreateNodeSlot(id)
      const current = untrack(slot.get)
      if (current?.internals.userNode !== entry.internals.userNode) {
        slot.set(entry)
      }
    }
    for (const [id, slot] of nodeSignals) {
      if (!lookup.has(id) && untrack(slot.get) !== undefined) {
        slot.set(undefined)
      }
    }

    // Emit fresh outer Map references so coarse consumers (iterators
    // that walk every node) re-run. `adoptUserNodes` mutates the
    // existing `Map` in place, so re-emitting the same reference
    // would be a no-op under barefoot's Object.is dedupe (#1270).
    setNodeLookup(() => new Map(lookup))
    setParentLookup(() => new Map(parents))

    return result.nodesInitialized
  })

  // Process edges into lookup when edges change
  createEffect(() => {
    const currentEdges = edges()
    const eLookup = new Map<string, EdgeType>()
    for (const edge of currentEdges) {
      eLookup.set(edge.id, edge)
    }
    setEdgeLookup(() => eLookup)

    const connLookup = untrack(connectionLookup)
    updateConnectionLookup(connLookup, eLookup, currentEdges)
    // `updateConnectionLookup` mutates `connLookup` in place; emit a
    // fresh `Map` reference so subscribers actually see the change.
    setConnectionLookup(() => new Map(connLookup))
  })

  // --- Selection state ---
  const [multiSelectionActive, setMultiSelectionActive] = createSignal(false)

  // --- Interactivity ---
  const [nodesDraggable, setNodesDraggable] = createSignal(options.nodesDraggable ?? true)
  const [nodesConnectable, setNodesConnectable] = createSignal(options.nodesConnectable ?? true)
  const [elementsSelectable, setElementsSelectable] = createSignal(options.elementsSelectable ?? true)

  // --- Pan/zoom config (reactive signals for dynamic changes) ---
  const [panOnDrag, setPanOnDrag] = createSignal(options.panOnDrag ?? true)
  const [panOnScroll, setPanOnScroll] = createSignal(options.panOnScroll ?? false)
  const [zoomOnScroll, setZoomOnScroll] = createSignal(options.zoomOnScroll ?? true)

  // --- Static config ---
  const deleteKeyCode = options.deleteKeyCode !== undefined ? options.deleteKeyCode : ['Delete', 'Backspace']
  const selectionKeyCode = options.selectionKeyCode !== undefined ? options.selectionKeyCode : 'Shift'
  const connectionLineStyle = options.connectionLineStyle
  const defaultEdgeOptions = options.defaultEdgeOptions
  const elevateNodesOnSelect = options.elevateNodesOnSelect ?? false
  const reconnectRadius = options.reconnectRadius ?? 20
  const zoomOnDoubleClick = options.zoomOnDoubleClick ?? true

  /**
   * Update pan/zoom instance configuration.
   * Called by initFlow on setup and reactively when settings change.
   */
  function updatePanZoomConfig() {
    const pz = untrack(panZoom)
    if (!pz) return
    pz.update({
      noWheelClassName: 'nowheel',
      noPanClassName: 'nopan',
      preventScrolling: true,
      panOnScroll: panOnScroll(),
      panOnDrag: panOnDrag(),
      panOnScrollMode: 'free' as any,
      panOnScrollSpeed: 0.5,
      userSelectionActive: false,
      zoomOnPinch: true,
      zoomOnScroll: zoomOnScroll(),
      zoomOnDoubleClick,
      zoomActivationKeyPressed: false,
      lib: 'bf',
      onTransformChange: (transform: Transform) => {
        setViewport({ x: transform[0], y: transform[1], zoom: transform[2] })
      },
      connectionInProgress: false,
      paneClickDistance: 0,
    })
  }

  // --- Actions ---

  function getTransform(): Transform {
    const vp = untrack(viewport)
    return [vp.x, vp.y, vp.zoom]
  }

  /**
   * Bump the position epoch counter to notify position-dependent effects
   * (edges, per-node position) without triggering adoptUserNodes.
   */
  function triggerPositionUpdate(): void {
    setPositionEpoch((n) => n + 1)
  }

  /**
   * Update node positions during drag operations.
   * Called by XYDrag with the current drag items.
   */
  function updateNodePositions(
    dragItems: Map<string, NodeDragItem | InternalNodeBase>,
    isDragging = true,
  ) {
    const lookup = untrack(nodeLookup)
    let mutated = false

    for (const [id, item] of dragItems) {
      const internalNode = lookup.get(id)
      if (!internalNode) continue

      internalNode.internals.positionAbsolute = item.internals
        ? (item as InternalNodeBase).internals.positionAbsolute
        : { x: (item as NodeDragItem).position.x, y: (item as NodeDragItem).position.y }

      internalNode.internals.userNode.position = item.position
      internalNode.internals.userNode.dragging = isDragging

      // Per-node fine-grained emit: shallow-clone so the entry identity
      // flips (barefoot's Object.is dedupe would otherwise swallow the
      // notification — the mutations above don't change the entry
      // reference). The inner `internals` object stays shared, so
      // consumers reading `.internals.positionAbsolute` still see the
      // updated position.
      const fresh = { ...internalNode } as InternalNodeBase<NodeType>
      lookup.set(id, fresh)
      getOrCreateNodeSlot(id).set(fresh)
      mutated = true
    }

    if (mutated) {
      // Coarse emit so iteration-style consumers re-run too. Per-node
      // bridges that switched to `nodeSignal(id)` only wake up for
      // their own id and skip this channel.
      setNodeLookup(() => new Map(lookup))
    }
    // Keep positionEpoch as the dedicated drag-rate channel for
    // existing subscribers (edge-path effect).
    triggerPositionUpdate()
  }

  /**
   * Deselect all nodes and edges, or specific ones.
   */
  function unselectNodesAndEdges(params?: {
    nodes?: NodeBase[]
    edges?: EdgeBase[]
  }) {
    const currentNodes = untrack(nodes)
    const currentEdges = untrack(edges)

    if (params?.nodes) {
      const idsToDeselect = new Set(params.nodes.map((n) => n.id))
      setNodes(
        currentNodes.map((n) =>
          idsToDeselect.has(n.id) ? { ...n, selected: false } : n,
        ) as NodeType[],
      )
    } else {
      setNodes(
        currentNodes.map((n) =>
          n.selected ? { ...n, selected: false } : n,
        ) as NodeType[],
      )
    }

    if (params?.edges) {
      const idsToDeselect = new Set(params.edges.map((e) => e.id))
      setEdges(
        currentEdges.map((e) =>
          idsToDeselect.has(e.id) ? { ...e, selected: false } : e,
        ) as EdgeType[],
      )
    } else {
      setEdges(
        currentEdges.map((e) =>
          e.selected ? { ...e, selected: false } : e,
        ) as EdgeType[],
      )
    }
  }

  /**
   * Pan the viewport by a delta amount.
   */
  async function panByDelta(delta: XYPosition): Promise<boolean> {
    return panByUtil({
      delta,
      panZoom: untrack(panZoom),
      transform: getTransform(),
      translateExtent: INFINITE_EXTENT,
      width: untrack(width),
      height: untrack(height),
    })
  }

  /**
   * Add a new edge to the store.
   */
  function addEdge(edge: EdgeType) {
    setEdges((prev) => [...prev, edge])
  }

  /**
   * Delete nodes and edges from the store.
   */
  function deleteElements(params: {
    nodes?: NodeType[]
    edges?: EdgeType[]
  }) {
    if (params.nodes?.length) {
      const idsToRemove = new Set(params.nodes.map((n) => n.id))
      setNodes((prev) => prev.filter((n) => !idsToRemove.has(n.id)))
      // Also remove connected edges
      setEdges((prev) =>
        prev.filter(
          (e) => !idsToRemove.has(e.source) && !idsToRemove.has(e.target),
        ),
      )
    }
    if (params.edges?.length) {
      const idsToRemove = new Set(params.edges.map((e) => e.id))
      setEdges((prev) => prev.filter((e) => !idsToRemove.has(e.id)))
    }
  }

  function fitView(fitViewOptions?: FitViewOptions) {
    const pz = untrack(panZoom)
    if (!pz) return

    const lookup = untrack(nodeLookup)
    const w = untrack(width)
    const h = untrack(height)

    fitViewport(
      {
        nodes: lookup,
        width: w,
        height: h,
        panZoom: pz,
        minZoom,
        maxZoom,
      },
      { padding: 0.1, ...fitViewOptions }
    )
  }

  return {
    // Signal getters
    nodes,
    edges,
    viewport,
    width,
    height,
    dragging,
    nodesInitialized,

    // Lookups
    nodeLookup,
    parentLookup,
    edgeLookup,
    connectionLookup,
    nodeSignal,

    // Internal refs
    panZoom,
    domNode,

    // Setters
    setNodes,
    setEdges,
    setViewport,
    setWidth,
    setHeight,

    // Selection state
    multiSelectionActive,

    // Interactivity
    nodesDraggable,
    setNodesDraggable,
    nodesConnectable,
    setNodesConnectable,
    elementsSelectable,
    setElementsSelectable,
    panOnDrag,
    setPanOnDrag,
    panOnScroll,
    setPanOnScroll,
    zoomOnScroll,
    setZoomOnScroll,

    // Static config
    deleteKeyCode,
    selectionKeyCode,
    connectionLineStyle,
    defaultEdgeOptions,
    elevateNodesOnSelect,
    reconnectRadius,

    // Lightweight position change notification (avoids full adoptUserNodes)
    positionEpoch,
    triggerPositionUpdate,

    setDragging,
    setPanZoom,
    setDomNode,
    setMultiSelectionActive,
    updatePanZoomConfig,

    // Actions
    fitView,
    updateNodePositions,
    unselectNodesAndEdges,
    panByDelta,
    addEdge,
    deleteElements,

    // Configuration
    minZoom,
    maxZoom,
    nodeOrigin,
    nodeExtent,
    snapToGrid,
    snapGrid,
    edgesReconnectable,

    getTransform,

    // Custom types
    nodeTypes: options.nodeTypes,
    edgeTypes: options.edgeTypes,

    // Connection callbacks
    onConnect: options.onConnect,
    onConnectStart: options.onConnectStart,
    onConnectEnd: options.onConnectEnd,
    isValidConnection: options.isValidConnection,
    onReconnect: options.onReconnect,

    // Lifecycle callbacks
    onInit: options.onInit,
    onNodeDragStart: options.onNodeDragStart,
    onNodeDragStop: options.onNodeDragStop,
    onMoveEnd: options.onMoveEnd,
    onPaneClick: options.onPaneClick,
    onPaneMouseMove: options.onPaneMouseMove,
    onNodesDelete: options.onNodesDelete,
    onEdgesDelete: options.onEdgesDelete,
  }
}
