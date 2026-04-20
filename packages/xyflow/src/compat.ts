/**
 * React Flow compatibility shims for desk migration.
 *
 * These functions mirror the React Flow hooks API so that
 * desk components can be ported with minimal changes.
 */

import { untrack } from '@barefootjs/client/runtime'
import { addEdge as addEdgeUtil, reconnectEdge as reconnectEdgeUtil, pointToRendererPoint } from '@xyflow/system'
import { useFlow } from './hooks'
import type { NodeBase, EdgeBase, Viewport, XYPosition } from './types'
import type { Connection, NodeChange, EdgeChange } from '@xyflow/system'

/**
 * useNodesState — mirrors React Flow's useNodesState.
 * Returns [nodes getter, setNodes, onNodesChange handler].
 */
export function useNodesState<NodeType extends NodeBase = NodeBase>(
  initialNodes: NodeType[],
): [() => NodeType[], (updater: NodeType[] | ((prev: NodeType[]) => NodeType[])) => void, (changes: NodeChange[]) => void] {
  const store = useFlow<NodeType>()
  store.setNodes(initialNodes)

  function onNodesChange(changes: NodeChange[]) {
    store.setNodes((prev) => applyNodeChanges(prev, changes))
  }

  return [store.nodes, store.setNodes, onNodesChange]
}

/**
 * useEdgesState — mirrors React Flow's useEdgesState.
 * Returns [edges getter, setEdges, onEdgesChange handler].
 */
export function useEdgesState<EdgeType extends EdgeBase = EdgeBase>(
  initialEdges: EdgeType[],
): [() => EdgeType[], (updater: EdgeType[] | ((prev: EdgeType[]) => EdgeType[])) => void, (changes: EdgeChange[]) => void] {
  const store = useFlow<NodeBase, EdgeType>()
  store.setEdges(initialEdges)

  function onEdgesChange(changes: EdgeChange[]) {
    store.setEdges((prev) => applyEdgeChanges(prev, changes))
  }

  return [store.edges, store.setEdges, onEdgesChange]
}

/**
 * useReactFlow — mirrors React Flow's useReactFlow hook.
 * Returns an object with common flow manipulation methods.
 */
export function useReactFlow<
  NodeType extends NodeBase = NodeBase,
  EdgeType extends EdgeBase = EdgeBase,
>() {
  const store = useFlow<NodeType, EdgeType>()

  return {
    // Getters
    getNodes: (): NodeType[] => untrack(store.nodes),
    getEdges: (): EdgeType[] => untrack(store.edges),
    getNode: (id: string): NodeType | undefined =>
      untrack(store.nodes).find((n) => n.id === id),
    getZoom: (): number => untrack(store.viewport).zoom,
    getViewport: (): Viewport => untrack(store.viewport),

    // Setters
    setNodes: store.setNodes,
    setEdges: store.setEdges,
    setViewport: (vp: Viewport) => {
      const pz = untrack(store.panZoom)
      if (pz) pz.setViewport(vp)
    },
    setCenter: (x: number, y: number, options?: { zoom?: number; duration?: number }) => {
      const pz = untrack(store.panZoom)
      if (!pz) return
      const w = untrack(store.width)
      const h = untrack(store.height)
      const zoom = options?.zoom ?? untrack(store.viewport).zoom
      pz.setViewport(
        { x: w / 2 - x * zoom, y: h / 2 - y * zoom, zoom },
        { duration: options?.duration },
      )
    },

    // Actions
    fitView: store.fitView,
    zoomIn: (options?: { duration?: number }) => {
      const pz = untrack(store.panZoom)
      pz?.scaleBy(1.2, options)
    },
    zoomOut: (options?: { duration?: number }) => {
      const pz = untrack(store.panZoom)
      pz?.scaleBy(1 / 1.2, options)
    },
    zoomTo: (zoom: number, options?: { duration?: number }) => {
      const pz = untrack(store.panZoom)
      pz?.scaleTo(zoom, options)
    },

    // Node mutations
    updateNode: (id: string, update: Partial<NodeType> | ((node: NodeType) => Partial<NodeType>)) => {
      store.setNodes((prev) =>
        prev.map((n) => {
          if (n.id !== id) return n
          const patch = typeof update === 'function' ? update(n) : update
          return { ...n, ...patch }
        }),
      )
    },
    updateNodeData: (id: string, data: Partial<NodeType['data']> | ((prev: NodeType['data']) => Partial<NodeType['data']>)) => {
      store.setNodes((prev) =>
        prev.map((n) => {
          if (n.id !== id) return n
          const newData = typeof data === 'function' ? data(n.data) : data
          return { ...n, data: { ...n.data, ...newData } }
        }),
      )
    },

    // Edge mutations
    addEdges: (newEdges: EdgeType[]) => {
      store.setEdges((prev) => [...prev, ...newEdges])
    },

    // Deletion
    deleteElements: store.deleteElements,

    // Coordinate conversion
    screenToFlowPosition: (position: XYPosition): XYPosition => {
      const domNode = untrack(store.domNode)
      if (!domNode) return position
      const rect = domNode.getBoundingClientRect()
      const transform = store.getTransform()
      return pointToRendererPoint(
        { x: position.x - rect.left, y: position.y - rect.top },
        transform,
      )
    },
  }
}

/**
 * useViewport — reactive viewport getter.
 */
export { useViewport } from './hooks'

/**
 * addEdge utility — wraps @xyflow/system's addEdge.
 */
export function addEdge<EdgeType extends EdgeBase = EdgeBase>(
  connection: Connection,
  edges: EdgeType[],
): EdgeType[] {
  return addEdgeUtil(connection, edges) as EdgeType[]
}

/**
 * reconnectEdge utility — wraps @xyflow/system's reconnectEdge.
 */
export function reconnectEdge<EdgeType extends EdgeBase = EdgeBase>(
  oldEdge: EdgeType,
  newConnection: Connection,
  edges: EdgeType[],
): EdgeType[] {
  return reconnectEdgeUtil(oldEdge, newConnection, edges) as EdgeType[]
}

// --- Internal helpers ---

function applyNodeChanges<NodeType extends NodeBase>(
  nodes: NodeType[],
  changes: NodeChange[],
): NodeType[] {
  let result = [...nodes]

  for (const change of changes) {
    switch (change.type) {
      case 'position':
        result = result.map((n) =>
          n.id === change.id
            ? {
                ...n,
                ...(change.position ? { position: change.position } : {}),
                dragging: change.dragging ?? n.dragging,
              }
            : n,
        )
        break
      case 'dimensions':
        result = result.map((n) =>
          n.id === change.id && change.dimensions
            ? { ...n, width: change.dimensions.width, height: change.dimensions.height }
            : n,
        )
        break
      case 'select':
        result = result.map((n) =>
          n.id === change.id ? { ...n, selected: change.selected } : n,
        )
        break
      case 'remove':
        result = result.filter((n) => n.id !== change.id)
        break
      case 'add':
        result.push(change.item as NodeType)
        break
    }
  }

  return result
}

function applyEdgeChanges<EdgeType extends EdgeBase>(
  edges: EdgeType[],
  changes: EdgeChange[],
): EdgeType[] {
  let result = [...edges]

  for (const change of changes) {
    switch (change.type) {
      case 'select':
        result = result.map((e) =>
          e.id === change.id ? { ...e, selected: change.selected } : e,
        )
        break
      case 'remove':
        result = result.filter((e) => e.id !== change.id)
        break
      case 'add':
        result.push(change.item as EdgeType)
        break
    }
  }

  return result
}
