import {
  createSignal,
  createEffect,
  createMemo,
  untrack,
} from '@barefootjs/dom'
import {
  adoptUserNodes,
  updateAbsolutePositions,
  updateConnectionLookup,
  fitViewport,
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
  CoordinateExtent,
  SnapGrid,
  NodeOrigin,
  Transform,
  PanZoomInstance,
} from '@xyflow/system'
import type { FlowStoreOptions, FlowStore, FitViewOptions } from './types'

const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 }
const infiniteExtent: CoordinateExtent = [
  [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
  [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
]

/**
 * Create a signal-based reactive store that bridges @xyflow/system
 * with BarefootJS reactivity.
 */
export function createFlowStore<
  NodeType extends NodeBase = NodeBase,
  EdgeType extends EdgeBase = EdgeBase,
>(options: FlowStoreOptions<NodeType, EdgeType> = {}): FlowStore<NodeType, EdgeType> {
  // --- Configuration ---
  const minZoom = options.minZoom ?? 0.5
  const maxZoom = options.maxZoom ?? 2
  const nodeOrigin: NodeOrigin = options.nodeOrigin ?? [0, 0]
  const nodeExtent: CoordinateExtent = options.nodeExtent ?? infiniteExtent
  const snapToGrid = options.snapToGrid ?? false
  const snapGrid: SnapGrid = options.snapGrid ?? [15, 15]

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

  // --- Lookups (mutable maps, tracked via signals for change notification) ---
  const [nodeLookup, setNodeLookup] = createSignal<NodeLookup<InternalNodeBase<NodeType>>>(
    new Map()
  )
  const [parentLookup, setParentLookup] = createSignal<ParentLookup<InternalNodeBase<NodeType>>>(
    new Map()
  )
  const [edgeLookup, setEdgeLookup] = createSignal<EdgeLookup<EdgeType>>(new Map())
  const [connectionLookup, setConnectionLookup] = createSignal<ConnectionLookup>(new Map())

  // --- Derived state ---

  /**
   * Process user nodes through @xyflow/system's adoptUserNodes.
   * This populates nodeLookup/parentLookup and calculates internals.
   * Returns whether all nodes have measured dimensions.
   */
  const nodesInitialized = createMemo(() => {
    const currentNodes = nodes()
    const lookup = nodeLookup()
    const parents = parentLookup()

    const result = adoptUserNodes(currentNodes, lookup, parents, {
      nodeOrigin,
      nodeExtent,
      checkEquality: false,
    })

    updateAbsolutePositions(lookup, parents, {
      nodeOrigin,
      nodeExtent,
    })

    // Trigger signal update so dependents know lookups changed
    setNodeLookup(() => lookup)
    setParentLookup(() => parents)

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
    setConnectionLookup(() => connLookup)
  })

  // --- Actions ---

  function getTransform(): Transform {
    const vp = untrack(viewport)
    return [vp.x, vp.y, vp.zoom]
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
      fitViewOptions
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

    // Internal refs
    panZoom,
    domNode,

    // Setters
    setNodes,
    setEdges,
    setViewport,
    setWidth,
    setHeight,

    // Internal setters (not on public FlowStore type, but needed by initFlow)
    setDragging,
    setPanZoom,
    setDomNode,

    // Actions
    fitView,

    // Configuration
    minZoom,
    maxZoom,
    nodeOrigin,
    nodeExtent,
    snapToGrid,
    snapGrid,

    getTransform,

    // Callbacks
    onConnect: options.onConnect,
  } as FlowStore<NodeType, EdgeType> & {
    setDragging: typeof setDragging
    setPanZoom: typeof setPanZoom
    setDomNode: typeof setDomNode
  }
}
