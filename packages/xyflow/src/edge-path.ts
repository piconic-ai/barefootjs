// Pure path-geometry helpers shared between the imperative edge renderer
// (edge-renderer.ts) and the JSX-native simple-edge component (simple-edge.tsx).
// Extracted in #1081 step 2 so the JSX path computes geometry the same way
// the imperative path does, avoiding subtle divergence during the migration.

import {
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  getEdgePosition,
  ConnectionMode,
  Position,
} from '@xyflow/system'
import type { EdgeBase, EdgePosition, InternalNodeBase } from '@xyflow/system'

export type EdgePathTuple = [string, number, number, number, number]

/**
 * Compute endpoint positions for an edge, falling back to a node-center
 * straight line when no handle bounds are available yet (e.g. before the
 * first measure has populated `nodeLookup`).
 */
export function computeEdgePosition(
  edge: EdgeBase,
  sourceNode: InternalNodeBase,
  targetNode: InternalNodeBase,
): EdgePosition | null {
  const hasHandleIds = !!(edge.sourceHandle || edge.targetHandle)
  const edgePos = getEdgePosition({
    id: edge.id,
    sourceNode,
    sourceHandle: edge.sourceHandle ?? null,
    targetNode,
    targetHandle: edge.targetHandle ?? null,
    connectionMode: hasHandleIds ? ConnectionMode.Strict : ConnectionMode.Loose,
  })

  if (edgePos) return edgePos

  const sw = sourceNode.measured.width ?? 150
  const sh = sourceNode.measured.height ?? 40
  const tw = targetNode.measured.width ?? 150
  const sourcePos = sourceNode.internals.positionAbsolute
  const targetPos = targetNode.internals.positionAbsolute

  return {
    sourceX: sourcePos.x + sw / 2,
    sourceY: sourcePos.y + sh,
    targetX: targetPos.x + tw / 2,
    targetY: targetPos.y,
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
  }
}

/**
 * Calculate edge path based on edge type. Returns
 * `[d, labelX, labelY, offsetX, offsetY]` or `null`.
 */
export function getEdgePath(
  edge: EdgeBase,
  pos: EdgePosition,
): EdgePathTuple | null {
  const params = {
    sourceX: pos.sourceX,
    sourceY: pos.sourceY,
    sourcePosition: pos.sourcePosition,
    targetX: pos.targetX,
    targetY: pos.targetY,
    targetPosition: pos.targetPosition,
  }

  const edgeType = edge.type ?? 'default'

  switch (edgeType) {
    case 'straight':
      return getStraightPath(params) as EdgePathTuple
    case 'smoothstep':
    case 'step':
      return getSmoothStepPath({
        ...params,
        borderRadius: edgeType === 'step' ? 0 : undefined,
      }) as EdgePathTuple
    case 'default':
    case 'bezier':
    default:
      return getBezierPath(params)
  }
}
