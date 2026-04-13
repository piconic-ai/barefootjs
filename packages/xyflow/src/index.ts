// Core
export { initFlow } from './flow'
export { createFlowStore } from './store'
export { FlowContext } from './context'
export { createNodeWrapper, createNodeRenderer } from './node-wrapper'
export { createEdgeRenderer, createEdgeLabelRenderer } from './edge-renderer'
export { createHandle, initHandle } from './handle'
export type { HandleType, HandleProps } from './handle'
export { attachConnectionHandler } from './connection'
export { useFlow, useViewport, useNodes, useEdges, useNodesInitialized } from './hooks'
export { setupKeyboardHandlers, setupNodeSelection } from './selection'

// Plugins
export { initBackground } from './background'
export type { BackgroundVariant, BackgroundProps } from './background'
export { initControls } from './controls'
export type { ControlsProps } from './controls'
export { initMiniMap } from './minimap'
export type { MiniMapProps } from './minimap'

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
