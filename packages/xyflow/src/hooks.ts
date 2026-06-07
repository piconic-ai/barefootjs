import { useContext } from '@barefootjs/client/runtime'
import { createMemo, untrack } from '@barefootjs/client/runtime'
import { pointToRendererPoint } from '@xyflow/system'
import { FlowContext } from './context.ts'
import type { FlowStore, Viewport, NodeBase, EdgeBase, XYPosition } from './types.ts'
import type { Signal, Memo } from '@barefootjs/client/runtime'

/**
 * Access the flow store from any child component.
 * Must be called within a component rendered inside a Flow.
 */
export function useFlow<
  NodeType extends NodeBase = NodeBase,
  EdgeType extends EdgeBase = EdgeBase,
>(): FlowStore<NodeType, EdgeType> {
  return useContext(FlowContext) as unknown as FlowStore<NodeType, EdgeType>
}

/**
 * Access the current viewport (reactive getter).
 */
export function useViewport(): Signal<Viewport>[0] {
  return useFlow().viewport
}

/**
 * Access the nodes array (reactive getter).
 */
export function useNodes<NodeType extends NodeBase = NodeBase>(): Signal<NodeType[]>[0] {
  return useFlow<NodeType>().nodes
}

/**
 * Access the edges array (reactive getter).
 */
export function useEdges<EdgeType extends EdgeBase = EdgeBase>(): Signal<EdgeType[]>[0] {
  return useFlow<NodeBase, EdgeType>().edges
}

/**
 * Access whether nodes have been initialized (all measured).
 */
export function useNodesInitialized(): Memo<boolean> {
  return useFlow().nodesInitialized
}

/**
 * Select derived state from the flow store.
 * Similar to React Flow's useStore(selector).
 */
export function useStore<T>(selector: (store: FlowStore) => T): Memo<T> {
  const store = useFlow()
  return createMemo(() => selector(store))
}

/**
 * Convert a screen position to flow coordinates.
 * Accounts for viewport transform (pan/zoom) and container offset.
 */
export function screenToFlowPosition(position: XYPosition): XYPosition {
  const store = useFlow()
  const domNode = untrack(store.domNode)
  if (!domNode) return position

  const rect = domNode.getBoundingClientRect()
  const transform = store.getTransform()

  return pointToRendererPoint(
    { x: position.x - rect.left, y: position.y - rect.top },
    transform,
  )
}
