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
} from '@xyflow/system'
import type { Signal, Memo } from '@barefootjs/dom'

// Re-export commonly used types from @xyflow/system
export type FitViewOptions = FitViewOptionsBase

// Re-export commonly used types from @xyflow/system
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
}

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

  // Callbacks
  onConnect?: OnConnect
  onConnectStart?: OnConnectStart
  onConnectEnd?: OnConnectEnd
  isValidConnection?: IsValidConnection
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

  // Internal refs
  panZoom: Signal<PanZoomInstance | null>[0]
  domNode: Signal<HTMLElement | null>[0]

  // Setters
  setNodes: Signal<NodeType[]>[1]
  setEdges: Signal<EdgeType[]>[1]
  setViewport: Signal<Viewport>[1]
  setWidth: Signal<number>[1]
  setHeight: Signal<number>[1]

  // Actions
  fitView: (options?: FitViewOptions) => void

  // Configuration
  minZoom: number
  maxZoom: number
  nodeOrigin: NodeOrigin
  nodeExtent: CoordinateExtent
  snapToGrid: boolean
  snapGrid: SnapGrid

  // Viewport transform as [tx, ty, scale]
  getTransform: () => Transform

  // Callbacks
  onConnect?: OnConnect
}

/**
 * Props for the Flow init function.
 */
export type FlowProps<
  NodeType extends NodeBase = NodeBase,
  EdgeType extends EdgeBase = EdgeBase,
> = FlowStoreOptions<NodeType, EdgeType> & {
  class?: string
}
