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
  XYPosition,
  FitViewOptionsBase,
  OnConnect,
  OnConnectStart,
  OnConnectEnd,
  IsValidConnection,
  NodeDragItem,
  ConnectionMode,
  Connection,
} from '@xyflow/system'
import type { Signal, Memo } from '@barefootjs/client'
import type { ComponentDef } from '@barefootjs/client/runtime'

export type FitViewOptions = FitViewOptionsBase

export type {
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
  XYPosition,
  OnConnect,
  OnConnectStart,
  OnConnectEnd,
  IsValidConnection,
  NodeDragItem,
  ConnectionMode,
  Connection,
}

/**
 * Callback fired when an edge is reconnected to a new handle.
 */
export type OnReconnect<EdgeType extends EdgeBase = EdgeBase> = (
  oldEdge: EdgeType,
  newConnection: Connection,
) => void

/**
 * Options for creating a flow store.
 */
export type FlowStoreOptions<
  NodeType extends NodeBase = NodeBase,
  EdgeType extends EdgeBase = EdgeBase,
> = {
  nodes?: NodeType[]
  edges?: EdgeType[]
  defaultViewport?: Viewport
  minZoom?: number
  maxZoom?: number
  nodeOrigin?: NodeOrigin
  nodeExtent?: CoordinateExtent
  snapToGrid?: boolean
  snapGrid?: SnapGrid
  fitView?: boolean
  fitViewOptions?: FitViewOptions

  // Custom component types
  nodeTypes?: Record<string, ComponentDef | ((props: NodeComponentProps<NodeType>) => void)>
  edgeTypes?: Record<string, ComponentDef | ((props: EdgeComponentProps<EdgeType>) => void)>

  // Edge reconnection
  edgesReconnectable?: boolean
  onReconnect?: OnReconnect<EdgeType>

  // Connection callbacks
  onConnect?: OnConnect
  onConnectStart?: OnConnectStart
  onConnectEnd?: OnConnectEnd
  isValidConnection?: IsValidConnection

  // Lifecycle callbacks
  onInit?: (store: FlowStore<NodeType, EdgeType>) => void
  onNodeDragStart?: (event: MouseEvent, node: NodeType, nodes: NodeType[]) => void
  onNodeDragStop?: (event: MouseEvent, node: NodeType, nodes: NodeType[]) => void
  onMoveEnd?: (event: MouseEvent | TouchEvent | null, viewport: Viewport) => void
  onPaneClick?: (event: MouseEvent) => void
  onPaneMouseMove?: (event: MouseEvent) => void
  onNodesDelete?: (nodes: NodeType[]) => void
  onEdgesDelete?: (edges: EdgeType[]) => void

  // Interactivity config
  panOnDrag?: boolean
  panOnScroll?: boolean
  zoomOnScroll?: boolean
  zoomOnDoubleClick?: boolean
  zoomActivationKeyCode?: string | null
  nodesDraggable?: boolean
  nodesConnectable?: boolean
  elementsSelectable?: boolean
  deleteKeyCode?: string[] | null
  selectionKeyCode?: string | null
  connectionLineStyle?: Record<string, string>
  defaultEdgeOptions?: Partial<EdgeBase>
  elevateNodesOnSelect?: boolean
  reconnectRadius?: number
}

/**
 * The reactive flow store — all state exposed as signal getters.
 */
export type FlowStore<
  NodeType extends NodeBase = NodeBase,
  EdgeType extends EdgeBase = EdgeBase,
> = {
  // Reactive state (signal getters)
  nodes: Signal<NodeType[]>[0]
  edges: Signal<EdgeType[]>[0]
  viewport: Signal<Viewport>[0]
  width: Signal<number>[0]
  height: Signal<number>[0]
  dragging: Signal<boolean>[0]
  nodesInitialized: Memo<boolean>

  // Lookups (signal getters)
  nodeLookup: Signal<NodeLookup<InternalNodeBase<NodeType>>>[0]
  parentLookup: Signal<ParentLookup<InternalNodeBase<NodeType>>>[0]
  edgeLookup: Signal<EdgeLookup<EdgeType>>[0]
  connectionLookup: Signal<ConnectionLookup>[0]

  // Lightweight position change counter — subscribers re-run without
  // triggering the full adoptUserNodes pipeline.
  positionEpoch: Signal<number>[0]
  triggerPositionUpdate: () => void

  // Internal refs
  panZoom: Signal<PanZoomInstance | null>[0]
  domNode: Signal<HTMLElement | null>[0]

  // Setters
  setNodes: Signal<NodeType[]>[1]
  setEdges: Signal<EdgeType[]>[1]
  setViewport: Signal<Viewport>[1]
  setWidth: Signal<number>[1]
  setHeight: Signal<number>[1]

  // Selection state
  multiSelectionActive: Signal<boolean>[0]

  // Interactivity — when false, nodes cannot be dragged/connected/deleted
  nodesDraggable: Signal<boolean>[0]
  setNodesDraggable: Signal<boolean>[1]

  // Actions
  fitView: (options?: FitViewOptions) => void
  updateNodePositions: (
    dragItems: Map<string, NodeDragItem | InternalNodeBase<NodeType>>,
    dragging?: boolean,
  ) => void
  unselectNodesAndEdges: (params?: {
    nodes?: NodeType[]
    edges?: EdgeType[]
  }) => void
  panByDelta: (delta: XYPosition) => Promise<boolean>
  addEdge: (edge: EdgeType) => void
  deleteElements: (params: {
    nodes?: NodeType[]
    edges?: EdgeType[]
  }) => void

  // Configuration
  minZoom: number
  maxZoom: number
  nodeOrigin: NodeOrigin
  nodeExtent: CoordinateExtent
  snapToGrid: boolean
  snapGrid: SnapGrid

  // Viewport transform as [tx, ty, scale]
  getTransform: () => Transform

  // Custom component types
  nodeTypes?: Record<string, ComponentDef | ((props: NodeComponentProps<NodeType>) => void)>
  edgeTypes?: Record<string, ComponentDef | ((props: EdgeComponentProps<EdgeType>) => void)>

  // Edge reconnection
  edgesReconnectable: boolean
  onReconnect?: OnReconnect<EdgeType>

  // Connection callbacks
  onConnect?: OnConnect
  onConnectStart?: OnConnectStart
  onConnectEnd?: OnConnectEnd
  isValidConnection?: IsValidConnection

  // Lifecycle callbacks
  onInit?: (store: FlowStore<NodeType, EdgeType>) => void
  onNodeDragStart?: (event: MouseEvent, node: NodeType, nodes: NodeType[]) => void
  onNodeDragStop?: (event: MouseEvent, node: NodeType, nodes: NodeType[]) => void
  onMoveEnd?: (event: MouseEvent | TouchEvent | null, viewport: Viewport) => void
  onPaneClick?: (event: MouseEvent) => void
  onPaneMouseMove?: (event: MouseEvent) => void
  onNodesDelete?: (nodes: NodeType[]) => void
  onEdgesDelete?: (edges: EdgeType[]) => void

  // Interactivity (reactive signals)
  nodesConnectable: Signal<boolean>[0]
  setNodesConnectable: Signal<boolean>[1]
  elementsSelectable: Signal<boolean>[0]
  setElementsSelectable: Signal<boolean>[1]
  panOnDrag: Signal<boolean>[0]
  setPanOnDrag: Signal<boolean>[1]
  panOnScroll: Signal<boolean>[0]
  setPanOnScroll: Signal<boolean>[1]
  zoomOnScroll: Signal<boolean>[0]
  setZoomOnScroll: Signal<boolean>[1]

  // Static config
  deleteKeyCode: string[] | null
  selectionKeyCode: string | null
  connectionLineStyle?: Record<string, string>
  defaultEdgeOptions?: Partial<EdgeBase>
  elevateNodesOnSelect: boolean
  reconnectRadius: number
}

/**
 * Internal setters exposed by createFlowStore but not part of the public API.
 * Used only by initFlow during initialization.
 */
export type InternalFlowStore<
  NodeType extends NodeBase = NodeBase,
  EdgeType extends EdgeBase = EdgeBase,
> = FlowStore<NodeType, EdgeType> & {
  setDragging: Signal<boolean>[1]
  setPanZoom: Signal<PanZoomInstance | null>[1]
  setDomNode: Signal<HTMLElement | null>[1]
  setMultiSelectionActive: Signal<boolean>[1]
  updatePanZoomConfig: () => void
}

/**
 * Props passed to custom node components.
 */
export type NodeComponentProps<NodeType extends NodeBase = NodeBase> = {
  id: string
  data: NodeType['data']
  type: string
  /**
   * Reactive getter for this node's selected state. Call inside a
   * createEffect to observe selection changes at runtime — reading it once
   * at mount time only yields the initial value.
   */
  selected: () => boolean
  dragging: boolean
  positionAbsoluteX: number
  positionAbsoluteY: number
  width?: number
  height?: number
  isConnectable: boolean
}

/**
 * Props passed to custom edge components.
 */
export type EdgeComponentProps<EdgeType extends EdgeBase = EdgeBase> = {
  id: string
  source: string
  target: string
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  sourcePosition: string
  targetPosition: string
  data: EdgeType['data']
  selected: boolean
  animated: boolean
  label?: string
  /** SVG group element to render custom edge content into */
  svgGroup: SVGGElement
}

/**
 * Selection mode for rectangle selection.
 * - 'partial': selects nodes that partially overlap the rectangle (default)
 * - 'full': only selects nodes fully contained in the rectangle
 */
export type SelectionMode = 'partial' | 'full'

/**
 * Props for the Flow init function.
 */
export type FlowProps<
  NodeType extends NodeBase = NodeBase,
  EdgeType extends EdgeBase = EdgeBase,
> = FlowStoreOptions<NodeType, EdgeType> & {
  class?: string
  /** When true, dragging on empty pane starts selection without Shift key */
  selectionOnDrag?: boolean
  /** Selection mode: 'partial' (default) or 'full' */
  selectionMode?: SelectionMode
  /**
   * When true, the per-node default chrome (white background, dark
   * border, padding, "grab" cursor, centered text) is omitted from the
   * injected stylesheet. Use this when every node renders its own
   * visuals — e.g. a `renderNode` JSX bridge that mounts an imperative
   * canvas-axis / box / svg renderer. The layout-critical rules (edge,
   * handle, resize, selection rectangle, group/child) remain.
   *
   * Without this flag, consumers used to reach for the `--custom`
   * class on `.bf-flow__node`, but a reactive className binding on
   * `<NodeWrapper>` rebuilds the class string on every store update
   * and wipes consumer-added classes; this flag avoids that fight by
   * not needing the class in the first place.
   */
  disableDefaultNodeStyles?: boolean
}
