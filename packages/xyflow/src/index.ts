// Core
export { initFlow } from './flow'
export { createFlowStore } from './store'
export { FlowContext } from './context'
export { createNodeWrapper, createNodeRenderer } from './node-wrapper'
export { createEdgeRenderer } from './edge-renderer'
export { createHandle, initHandle } from './handle'
export type { HandleType, HandleProps } from './handle'
export { useFlow, useViewport, useNodes, useEdges, useNodesInitialized } from './hooks'
export { setupKeyboardHandlers, setupNodeSelection, setupEdgeSelection } from './selection'

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
} from './types'

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
  Position,
  ConnectionMode as ConnectionModeEnum,
  MarkerType,
} from '@xyflow/system'
