/**
 * `measureNode` — a node's size and handle bounds (#3268).
 *
 * The registry `<NodeWrapper>` calls it from its ResizeObserver; the
 * end-to-end check that a handle-id edge then starts at its handle is the
 * "fan edges start at the source handle they name" E2E in
 * `site/ui/e2e/xyflow.spec.ts`. These pin what the store sees: bounds in
 * flow coordinates (divided by zoom), an edge position taken from them,
 * no work when nothing changed, and bounds that survive the `setNodes` a
 * drag performs on every frame.
 */

import { beforeAll, describe, expect, test } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { Position } from '@xyflow/system'

beforeAll(() => {
  if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register()
})

function rect(x: number, y: number, width: number, height: number): DOMRect {
  return { x, y, left: x, top: y, width, height, right: x + width, bottom: y + height } as DOMRect
}

/** A 100×40 node at screen (200, 100) with a right-side source handle. */
function nodeElement(zoom: number) {
  const node = document.createElement('div')
  Object.defineProperty(node, 'offsetWidth', { value: 100 })
  Object.defineProperty(node, 'offsetHeight', { value: 40 })
  node.getBoundingClientRect = () => rect(200, 100, 100 * zoom, 40 * zoom)

  const handle = document.createElement('div')
  handle.className = 'bf-flow__handle source'
  handle.setAttribute('data-handleid', 'right')
  handle.setAttribute('data-handlepos', 'right')
  Object.defineProperty(handle, 'offsetWidth', { value: 8 })
  Object.defineProperty(handle, 'offsetHeight', { value: 8 })
  // Handle centred on the node's right edge.
  handle.getBoundingClientRect = () => rect(200 + 96 * zoom, 100 + 16 * zoom, 8 * zoom, 8 * zoom)
  node.appendChild(handle)
  return node
}

async function setup(zoom = 1) {
  const { createRoot } = await import('@barefootjs/client')
  const { createFlowStore } = await import('../store')
  const { measureNode } = await import('../node-measure')
  const { computeEdgePosition } = await import('../edge-path')

  const store = createRoot(() =>
    createFlowStore({
      nodes: [
        { id: 'a', position: { x: 0, y: 0 }, data: {} },
        { id: 'b', position: { x: 300, y: 0 }, data: {} },
      ],
      edges: [{ id: 'e', source: 'a', sourceHandle: 'right', target: 'b' }],
    }),
  )
  store.setViewport({ x: 0, y: 0, zoom })
  const el = nodeElement(zoom)
  const edgePosition = () => {
    const lookup = store.nodeLookup()
    return computeEdgePosition(store.edges()[0], lookup.get('a')!, lookup.get('b')!)
  }
  // `store`'s edge type is inferred as `{ …; sourceHandle: string }`, not
  // `EdgeBase`: `measureNode` must accept it without a cast (Pullfrog on
  // #3295).
  return { store, el, measure: () => measureNode(el, 'a', store), edgePosition }
}

describe('measureNode (#3268)', () => {
  test('records size and handle bounds in flow coordinates', async () => {
    for (const zoom of [1, 2]) {
      const { store, measure } = await setup(zoom)
      expect(measure()).toBe(true)
      const a = store.nodeLookup().get('a')!
      expect(a.measured).toEqual({ width: 100, height: 40 })
      expect(a.internals.handleBounds?.target).toBeNull()
      expect(a.internals.handleBounds?.source).toEqual([
        { id: 'right', type: 'source', nodeId: 'a', position: Position.Right, x: 96, y: 16, width: 8, height: 8 },
      ])
    }
  })

  test('a handle-id edge starts at that handle, not the bottom-centre fallback', async () => {
    const { store, measure, edgePosition } = await setup()
    // `b` stands for an already-measured node with a left target handle.
    const b = store.nodeLookup().get('b')!
    b.measured = { width: 100, height: 40 }
    b.internals.handleBounds = {
      source: null,
      target: [{ id: null, type: 'target', nodeId: 'b', position: Position.Left, x: -4, y: 16, width: 8, height: 8 }],
    }
    expect(edgePosition()?.sourcePosition).toBe(Position.Bottom)

    measure()
    expect(edgePosition()).toMatchObject({ sourceX: 104, sourceY: 20, sourcePosition: Position.Right, targetX: 296, targetY: 20 })
  })

  test('does nothing when the size and handles are unchanged', async () => {
    const { store, measure } = await setup()
    measure()
    const epoch = store.positionEpoch()
    expect(measure()).toBe(false)
    expect(store.positionEpoch()).toBe(epoch)
  })

  test('the bounds survive a later setNodes (what a drag does every frame)', async () => {
    const { store, measure } = await setup()
    measure()
    store.setNodes((prev) =>
      prev.map((n) => (n.id === 'a' ? { ...n, position: { x: 10, y: 10 } } : n)),
    )
    const a = store.nodeLookup().get('a')!
    expect(a.internals.positionAbsolute).toEqual({ x: 10, y: 10 })
    expect(a.internals.handleBounds?.source?.[0]).toMatchObject({ id: 'right', x: 96, y: 16 })
  })
})
