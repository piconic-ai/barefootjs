import { describe, expect, test } from 'bun:test'
import type { InternalNodeBase, NodeLookup } from '@xyflow/system'
import { clampDragPositionToParent } from '../flow-subsystems'
import type { NodeBase } from '../types'

// Build a minimal NodeLookup that satisfies the bits clampDragPositionToParent
// reads (`internal.measured.width/height`, `internal.internals.userNode`).
// adoptUserNodes-produced internals carry many more fields, but the clamp
// helper is intentionally narrow: anything outside its read set goes
// untouched at runtime.
function makeLookup(
  nodes: Array<Partial<NodeBase> & { id: string; measured?: { width: number; height: number } }>,
): NodeLookup<InternalNodeBase<NodeBase>> {
  const m = new Map<string, InternalNodeBase<NodeBase>>()
  for (const n of nodes) {
    const userNode = { position: { x: 0, y: 0 }, data: {}, ...n } as NodeBase
    const internal = {
      ...userNode,
      measured: n.measured,
      internals: {
        positionAbsolute: { x: 0, y: 0 },
        z: 0,
        userNode,
      },
    } as unknown as InternalNodeBase<NodeBase>
    m.set(n.id, internal)
  }
  return m as NodeLookup<InternalNodeBase<NodeBase>>
}

describe("clampDragPositionToParent — extent: 'parent'", () => {
  const parent = {
    id: 'p',
    position: { x: 0, y: 0 },
    measured: { width: 200, height: 100 },
  }

  test('clamps a child whose proposed relative position would overflow on +x', () => {
    const lookup = makeLookup([
      parent,
      { id: 'c', parentId: 'p', extent: 'parent', measured: { width: 40, height: 30 } },
    ])
    // parent 200×100, child 40×30 → max relative x = 160, max y = 70
    const clamped = clampDragPositionToParent({ x: 500, y: 500 }, 'c', lookup)
    expect(clamped).toEqual({ x: 160, y: 70 })
  })

  test('clamps to 0 on the negative side', () => {
    const lookup = makeLookup([
      parent,
      { id: 'c', parentId: 'p', extent: 'parent', measured: { width: 40, height: 30 } },
    ])
    const clamped = clampDragPositionToParent({ x: -50, y: -10 }, 'c', lookup)
    expect(clamped).toEqual({ x: 0, y: 0 })
  })

  test('passes through when child fits and is inside the rect', () => {
    const lookup = makeLookup([
      parent,
      { id: 'c', parentId: 'p', extent: 'parent', measured: { width: 40, height: 30 } },
    ])
    const clamped = clampDragPositionToParent({ x: 80, y: 40 }, 'c', lookup)
    expect(clamped).toEqual({ x: 80, y: 40 })
  })

  test('returns the input unchanged for nodes without parentId', () => {
    const lookup = makeLookup([{ id: 'c', measured: { width: 40, height: 30 } }])
    const proposed = { x: 1234, y: -5 }
    expect(clampDragPositionToParent(proposed, 'c', lookup)).toEqual(proposed)
  })

  test('returns the input unchanged when the node has parentId but extent is not "parent"', () => {
    const lookup = makeLookup([
      parent,
      // No extent set → drag should NOT be clamped (xyflow contract).
      { id: 'c', parentId: 'p', measured: { width: 40, height: 30 } },
    ])
    const proposed = { x: 999, y: 999 }
    expect(clampDragPositionToParent(proposed, 'c', lookup)).toEqual(proposed)
  })

  test('returns the input unchanged when the parent is missing from the lookup', () => {
    const lookup = makeLookup([
      // Parent intentionally absent — drag handler must not throw.
      { id: 'c', parentId: 'missing', extent: 'parent', measured: { width: 40, height: 30 } },
    ])
    const proposed = { x: 999, y: 999 }
    expect(clampDragPositionToParent(proposed, 'c', lookup)).toEqual(proposed)
  })

  test('returns the input unchanged when measurements are still pending', () => {
    const lookup = makeLookup([
      // No `measured` on the parent. Drag begins before ResizeObserver
      // has fired — clamp would otherwise pin to 0/0 and prevent any
      // drag motion.
      { id: 'p', position: { x: 0, y: 0 } },
      { id: 'c', parentId: 'p', extent: 'parent', measured: { width: 40, height: 30 } },
    ])
    const proposed = { x: 999, y: 999 }
    expect(clampDragPositionToParent(proposed, 'c', lookup)).toEqual(proposed)
  })

  test('clamps to 0 on each axis when the child is bigger than the parent', () => {
    const lookup = makeLookup([
      parent,
      { id: 'c', parentId: 'p', extent: 'parent', measured: { width: 999, height: 999 } },
    ])
    // pw - myW < 0 → max{0, …} = 0; same for y.
    expect(clampDragPositionToParent({ x: 50, y: 50 }, 'c', lookup)).toEqual({ x: 0, y: 0 })
  })
})
