// Public API for `@barefootjs/xyflow`.
//
// JSX-native renderer components (`<Flow>` / `<Background>` /
// `<Controls>` / `<MiniMap>` / `<Handle>` / `<NodeWrapper>` /
// `<SimpleEdge>`) are distributed via the shadcn registry at
// `ui/components/ui/xyflow/` — install with `barefoot add xyflow`.
// This package ships the utility helpers, types, signal hooks, store,
// and the imperative pointer-paced subsystems those components attach
// via `ref` callbacks.

// Store / context / signal hooks
export { createFlowStore } from './store'
export { FlowContext } from './context'
export {
  useFlow,
  useViewport,
  useNodes,
  useEdges,
  useNodesInitialized,
  useStore,
  screenToFlowPosition,
} from './hooks'

// Geometry helpers consumed by the JSX `<SimpleEdge>` component
export { computeEdgePosition, getEdgePath } from './edge-path'
export type { EdgePathTuple } from './edge-path'

// Pointer-paced subsystems attached via `<Flow>` / `<Handle>` `ref`
// callbacks. JSX gives these no leverage — pan/zoom is owned by
// `XYPanZoom` (D3-zoom-derived), the selection rectangle owns global
// pointer capture, connection drag uses `elementFromPoint`, and the
// node resizer needs raw dimension math.
export { attachFlowSubsystems } from './flow-subsystems'
export { attachConnectionHandler, attachReconnectionHandler } from './connection'
export { initNodeResizer, ResizeControlVariant } from './node-resizer'
export type {
  NodeResizerOptions,
  ControlPosition,
  ControlLinePosition,
  OnResize,
  OnResizeStart,
  OnResizeEnd,
  ShouldResize,
  ResizeControlDirection,
} from './node-resizer'
export { setupKeyboardHandlers, setupNodeSelection, setupSelectionRectangle } from './selection'
export type { SelectionRectOptions } from './selection'

// Stable CSS class names for the registry-side JSX components.
// Imported (rather than declared as inline literals) so site/ui's
// cssLayerPrefixer leaves the `bf-flow*` names un-prefixed, matching
// the chart pattern (`CHART_CLASS_*` from `@barefootjs/chart`).
export {
  BF_FLOW,
  BF_FLOW_VIEWPORT,
  BF_FLOW_EDGES,
  BF_FLOW_NODES,
  BF_FLOW_NODE,
  BF_FLOW_NODE_GROUP,
  BF_FLOW_NODE_CHILD,
  BF_FLOW_NODE_SELECTED,
  BF_FLOW_EDGE,
  BF_FLOW_EDGE_SELECTED,
  BF_FLOW_EDGE_ANIMATED,
  BF_FLOW_HANDLE,
  BF_FLOW_HANDLE_TARGET,
  BF_FLOW_HANDLE_SOURCE,
  BF_FLOW_CONTROLS,
  BF_FLOW_CONTROLS_BUTTON,
  BF_FLOW_MINIMAP,
  BF_FLOW_MINIMAP_MASK,
  XYFLOW_VIEWPORT,
} from './classes'


// Pointer-paced subsystem attach helper used by the JSX `<Flow>` `ref`
// callback. Replaces the imperative `initFlow` once cutover step C5
// removes the renderer files.
export { attachFlowSubsystems } from './flow-subsystems'

// Types
export type {
  FlowProps,
  FlowStore,
  InternalFlowStore,
  FlowStoreOptions,
  FitViewOptions,
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
  NodeComponentProps,
  EdgeComponentProps,
  SelectionMode,
  OnReconnect,
  Connection,
} from './types'
// HandleType is consumed by the JSX `<Handle>` component (registry-side)
// for its `type` prop typing. Re-exported here from `@xyflow/system` so
// consumers don't need a separate import.
export type { HandleType } from '@xyflow/system'

// Compat layer (React Flow API shims for desk migration)
export { useNodesState, useEdgesState, useReactFlow, addEdge, reconnectEdge } from './compat'

// Re-export useful utilities from @xyflow/system
export {
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  getConnectedEdges,
  getOutgoers,
  getIncomers,
  getNodesBounds,
  getNodesInside,
  getEdgeToolbarTransform,
  Position,
  ConnectionMode as ConnectionModeEnum,
  MarkerType,
} from '@xyflow/system'
