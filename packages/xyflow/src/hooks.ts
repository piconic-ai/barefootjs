import { useContext } from '@barefootjs/dom'
import { FlowContext } from './context'
import type { FlowStore, Viewport, NodeBase, EdgeBase } from './types'
import type { Signal, Memo } from '@barefootjs/dom'

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
