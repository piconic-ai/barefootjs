// Core
export { initFlow } from './flow'
export { createFlowStore } from './store'
export { FlowContext } from './context'
export { createNodeWrapper, createNodeRenderer } from './node-wrapper'
export { createEdgeRenderer, createEdgeLabelRenderer } from './edge-renderer'
export { createHandle, initHandle } from './handle'
export type { HandleType, HandleProps } from './handle'
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
export { useFlow, useViewport, useNodes, useEdges, useNodesInitialized, useStore, screenToFlowPosition } from './hooks'
export { setupKeyboardHandlers, setupNodeSelection, setupSelectionRectangle } from './selection'
export type { SelectionRectOptions } from './selection'

// Plugins
export { initBackground } from './background'
export type { BackgroundVariant, BackgroundProps } from './background'
export { initControls } from './controls'
export type { ControlsProps } from './controls'
export { initMiniMap } from './minimap'
export type { MiniMapProps } from './minimap'

// Geometry helpers consumed by the JSX-native renderer in
// `ui/components/ui/xyflow/`. Kept inside the package so the imperative
// edge-renderer and the JSX `<SimpleEdge>` compute geometry the same way.
export { computeEdgePosition, getEdgePath } from './edge-path'
export type { EdgePathTuple } from './edge-path'

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
