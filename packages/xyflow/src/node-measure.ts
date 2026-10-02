import { untrack } from '@barefootjs/client'
import { getHandleBounds } from '@xyflow/system'
import type { EdgeBase, Handle, NodeBase } from '@xyflow/system'
import type { FlowStore } from './types.ts'

type HandleBounds = { source: Handle[] | null; target: Handle[] | null }

function sameHandles(a: Handle[] | null | undefined, b: Handle[] | null | undefined): boolean {
  if (!a || !b) return !a && !b
  if (a.length !== b.length) return false
  return a.every((h, i) => {
    const o = b[i]
    return (
      h.id === o.id &&
      h.position === o.position &&
      h.x === o.x &&
      h.y === o.y &&
      h.width === o.width &&
      h.height === o.height
    )
  })
}

/**
 * Measure a rendered node: its size and its handles' bounds (#3268).
 *
 * `@xyflow/system`'s `getEdgePosition` places an edge's ends from
 * `internals.handleBounds`; without them every edge falls back to the
 * bottom-centre → top-centre path, and an edge naming a `sourceHandle` /
 * `targetHandle` ignores it. Handles are found the way `@xyflow/system`
 * finds them (`.source` / `.target`, `data-handleid`, `data-handlepos`).
 *
 * Writes onto the store's internal node in place, like a drag does, so
 * the next `setNodes` carries the bounds over (`adoptUserNodes` keeps
 * `handleBounds` for a node whose user node has `measured`, which this
 * also sets). Returns whether anything changed; on a change it bumps
 * `positionEpoch` so edges recompute.
 */
export function measureNode<NodeType extends NodeBase, EdgeType extends EdgeBase>(
  nodeElement: HTMLElement,
  nodeId: string,
  store: FlowStore<NodeType, EdgeType>,
): boolean {
  const width = nodeElement.offsetWidth
  const height = nodeElement.offsetHeight
  if (!width || !height) return false
  const internal = untrack(store.nodeLookup).get(nodeId)
  if (!internal) return false

  const zoom = untrack(store.viewport).zoom || 1
  const nodeBounds = nodeElement.getBoundingClientRect()
  const el = nodeElement as HTMLDivElement
  const handleBounds: HandleBounds = {
    source: getHandleBounds('source', el, nodeBounds, zoom, nodeId),
    target: getHandleBounds('target', el, nodeBounds, zoom, nodeId),
  }

  const prevSize = internal.measured ?? {}
  const prevHandles = internal.internals.handleBounds
  const sizeChanged = prevSize.width !== width || prevSize.height !== height
  const handlesChanged =
    !prevHandles ||
    !sameHandles(prevHandles.source, handleBounds.source) ||
    !sameHandles(prevHandles.target, handleBounds.target)
  if (!sizeChanged && !handlesChanged) return false

  internal.measured = { width, height }
  internal.internals.handleBounds = handleBounds
  const userNode = internal.internals.userNode as NodeBase & {
    measured?: { width: number; height: number }
  }
  if (userNode) userNode.measured = { width, height }
  store.triggerPositionUpdate()
  return true
}
