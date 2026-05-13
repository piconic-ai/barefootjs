import { describe, test, expect } from 'bun:test'
import { createEffect, createRoot } from '@barefootjs/client'
import { createFlowStore } from '../store'

describe('createFlowStore', () => {
  test('returns initial empty state', () => {
    createRoot(() => {
      const store = createFlowStore()
      expect(store.nodes()).toEqual([])
      expect(store.edges()).toEqual([])
      expect(store.viewport()).toEqual({ x: 0, y: 0, zoom: 1 })
      expect(store.width()).toBe(0)
      expect(store.height()).toBe(0)
      expect(store.dragging()).toBe(false)
    })
  })

  test('accepts initial nodes and edges', () => {
    createRoot(() => {
      const nodes = [
        { id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } },
        { id: '2', position: { x: 100, y: 50 }, data: { label: 'B' } },
      ]
      const edges = [{ id: 'e1-2', source: '1', target: '2' }]

      const store = createFlowStore({ nodes, edges })
      expect(store.nodes()).toHaveLength(2)
      expect(store.edges()).toHaveLength(1)
    })
  })

  test('accepts custom viewport', () => {
    createRoot(() => {
      const store = createFlowStore({
        defaultViewport: { x: 50, y: 100, zoom: 1.5 },
      })
      expect(store.viewport()).toEqual({ x: 50, y: 100, zoom: 1.5 })
    })
  })

  test('setNodes triggers reactive updates', () => {
    createRoot(() => {
      const store = createFlowStore()
      const updates: number[] = []

      createEffect(() => {
        updates.push(store.nodes().length)
      })

      expect(updates).toEqual([0])

      store.setNodes([
        { id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } },
      ])

      expect(updates).toEqual([0, 1])
    })
  })

  test('setEdges triggers reactive updates', () => {
    createRoot(() => {
      const store = createFlowStore()
      const updates: number[] = []

      createEffect(() => {
        updates.push(store.edges().length)
      })

      expect(updates).toEqual([0])

      store.setEdges([{ id: 'e1', source: '1', target: '2' }])

      expect(updates).toEqual([0, 1])
    })
  })

  test('per-node selected getter tracks setNodes updates', () => {
    // Exercises the pattern NodeComponentProps.selected uses internally:
    // a getter that looks the node up in store.nodes() so custom components
    // can observe selection changes after mount via createEffect.
    createRoot(() => {
      const store = createFlowStore({
        nodes: [
          { id: '1', position: { x: 0, y: 0 }, data: {} },
          { id: '2', position: { x: 10, y: 0 }, data: {} },
        ],
      })

      const isSelected = (id: string) => () => {
        const n = store.nodes().find((n) => n.id === id) as
          | { selected?: boolean }
          | undefined
        return n?.selected ?? false
      }

      const log: boolean[] = []
      const selectedOne = isSelected('1')
      createEffect(() => {
        log.push(selectedOne())
      })

      expect(log).toEqual([false])

      store.setNodes((nds) =>
        nds.map((n) => (n.id === '1' ? { ...n, selected: true } : n)),
      )
      expect(log).toEqual([false, true])

      // Selecting a different node should not re-emit for node 1 since
      // the underlying value didn't change — but store.nodes() did, so
      // the effect re-runs. We just assert the latest value is still true.
      store.setNodes((nds) =>
        nds.map((n) => (n.id === '2' ? { ...n, selected: true } : n)),
      )
      expect(log[log.length - 1]).toBe(true)

      store.setNodes((nds) =>
        nds.map((n) => (n.id === '1' ? { ...n, selected: false } : n)),
      )
      expect(log[log.length - 1]).toBe(false)
    })
  })

  test('setViewport triggers reactive updates', () => {
    createRoot(() => {
      const store = createFlowStore()
      const viewports: Array<{ x: number; y: number; zoom: number }> = []

      createEffect(() => {
        viewports.push(store.viewport())
      })

      expect(viewports).toEqual([{ x: 0, y: 0, zoom: 1 }])

      store.setViewport({ x: 10, y: 20, zoom: 2 })

      expect(viewports).toEqual([
        { x: 0, y: 0, zoom: 1 },
        { x: 10, y: 20, zoom: 2 },
      ])
    })
  })

  test('nodesInitialized processes nodes through adoptUserNodes', () => {
    createRoot(() => {
      const nodes = [
        { id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } },
        { id: '2', position: { x: 100, y: 50 }, data: { label: 'B' } },
      ]
      const store = createFlowStore({ nodes })

      // nodesInitialized triggers node processing
      const initialized = store.nodesInitialized()

      // Nodes without measured dimensions are not "initialized"
      expect(initialized).toBe(false)

      // But nodeLookup should be populated
      const lookup = store.nodeLookup()
      expect(lookup.size).toBe(2)
      expect(lookup.has('1')).toBe(true)
      expect(lookup.has('2')).toBe(true)

      // Internal node should have positionAbsolute
      const node1 = lookup.get('1')!
      expect(node1.internals.positionAbsolute).toEqual({ x: 0, y: 0 })
    })
  })

  test('nodeLookup emits a fresh Map on setNodes-driven update (#1270)', () => {
    // Regression for #1270: `adoptUserNodes` mutates the underlying
    // Map in place, and the old code re-emitted the same reference.
    // barefoot's Object.is dedupe swallowed the notification so per-
    // node consumers stayed stuck on the initial value.
    createRoot(() => {
      const store = createFlowStore({
        nodes: [
          { id: '1', position: { x: 0, y: 0 }, data: { count: 0 } },
          { id: '2', position: { x: 10, y: 0 }, data: {} },
        ],
      })
      // Touch `nodesInitialized` so the memo evaluates and the lookup
      // is populated before the assertions below.
      store.nodesInitialized()

      let fires = 0
      let lastSeen: unknown
      createEffect(() => {
        const lookup = store.nodeLookup()
        const entry = lookup.get('1')
        lastSeen = (entry?.internals.userNode.data as { count?: number } | undefined)?.count
        fires++
      })
      expect(fires).toBe(1)
      expect(lastSeen).toBe(0)

      store.setNodes((nds) =>
        nds.map((n) => (n.id === '1' ? { ...n, data: { count: 1 } } : n)) as typeof nds,
      )

      expect(fires).toBe(2)
      expect(lastSeen).toBe(1)
    })
  })

  test('nodeSignal(id) fires only for the changed id (#1270 acceptance)', () => {
    // Acceptance criterion from #1270: a single-node setNodes update
    // must NOT wake up every per-node consumer. `nodeSignal(id)`
    // delivers the fine-grained subscription that satisfies this.
    createRoot(() => {
      const store = createFlowStore({
        nodes: [
          { id: '1', position: { x: 0, y: 0 }, data: { count: 0 } },
          { id: '2', position: { x: 10, y: 0 }, data: { count: 0 } },
        ],
      })
      store.nodesInitialized()

      let firesForOne = 0
      let firesForTwo = 0
      createEffect(() => {
        store.nodeSignal('1')
        firesForOne++
      })
      createEffect(() => {
        store.nodeSignal('2')
        firesForTwo++
      })
      expect([firesForOne, firesForTwo]).toEqual([1, 1])

      // Mutate only node '1' — node '2's subscriber must NOT wake up.
      store.setNodes((nds) =>
        nds.map((n) => (n.id === '1' ? { ...n, data: { count: 1 } } : n)) as typeof nds,
      )
      expect([firesForOne, firesForTwo]).toEqual([2, 1])

      // Mutate only node '2' via `selected` — node '1's subscriber stays asleep.
      store.setNodes((nds) =>
        nds.map((n) => (n.id === '2' ? { ...n, selected: true } : n)) as typeof nds,
      )
      expect([firesForOne, firesForTwo]).toEqual([2, 2])
    })
  })

  test('nodeSignal(id) survives remove and re-add of the same id (#1270)', () => {
    // Slots are retained across structural changes so a consumer that
    // subscribed before the node was removed (or before it existed)
    // resumes receiving updates when the node reappears.
    createRoot(() => {
      const store = createFlowStore({
        nodes: [
          { id: '1', position: { x: 0, y: 0 }, data: { count: 7 } },
        ],
      })
      store.nodesInitialized()

      const seen: Array<number | undefined> = []
      createEffect(() => {
        const entry = store.nodeSignal('1')
        seen.push((entry?.internals.userNode.data as { count?: number } | undefined)?.count)
      })
      expect(seen).toEqual([7])

      store.setNodes([])
      expect(seen).toEqual([7, undefined])

      store.setNodes([{ id: '1', position: { x: 0, y: 0 }, data: { count: 99 } }])
      expect(seen).toEqual([7, undefined, 99])
    })
  })

  test('edgeLookup is derived from edges', () => {
    createRoot(() => {
      const edges = [
        { id: 'e1', source: '1', target: '2' },
        { id: 'e2', source: '2', target: '3' },
      ]
      const store = createFlowStore({ edges })

      const lookup = store.edgeLookup()
      expect(lookup.size).toBe(2)
      expect(lookup.has('e1')).toBe(true)
      expect(lookup.has('e2')).toBe(true)
    })
  })

  test('getTransform returns [x, y, zoom] tuple', () => {
    createRoot(() => {
      const store = createFlowStore({
        defaultViewport: { x: 10, y: 20, zoom: 1.5 },
      })
      expect(store.getTransform()).toEqual([10, 20, 1.5])
    })
  })

  test('configuration defaults', () => {
    createRoot(() => {
      const store = createFlowStore()
      expect(store.minZoom).toBe(0.5)
      expect(store.maxZoom).toBe(2)
      expect(store.nodeOrigin).toEqual([0, 0])
      expect(store.snapToGrid).toBe(false)
      expect(store.snapGrid).toEqual([15, 15])
    })
  })

  test('configuration overrides', () => {
    createRoot(() => {
      const store = createFlowStore({
        minZoom: 0.1,
        maxZoom: 5,
        snapToGrid: true,
        snapGrid: [10, 10],
        nodeOrigin: [0.5, 0.5],
      })
      expect(store.minZoom).toBe(0.1)
      expect(store.maxZoom).toBe(5)
      expect(store.snapToGrid).toBe(true)
      expect(store.snapGrid).toEqual([10, 10])
      expect(store.nodeOrigin).toEqual([0.5, 0.5])
    })
  })

  test('addEdge adds to edges', () => {
    createRoot(() => {
      const store = createFlowStore()
      expect(store.edges()).toHaveLength(0)

      store.addEdge({ id: 'e1', source: '1', target: '2' })
      expect(store.edges()).toHaveLength(1)
      expect(store.edges()[0].id).toBe('e1')
    })
  })

  test('deleteElements removes nodes and connected edges', () => {
    createRoot(() => {
      const store = createFlowStore({
        nodes: [
          { id: '1', position: { x: 0, y: 0 }, data: {} },
          { id: '2', position: { x: 100, y: 0 }, data: {} },
          { id: '3', position: { x: 200, y: 0 }, data: {} },
        ],
        edges: [
          { id: 'e1-2', source: '1', target: '2' },
          { id: 'e2-3', source: '2', target: '3' },
        ],
      })

      store.deleteElements({ nodes: [{ id: '2', position: { x: 100, y: 0 }, data: {} }] })

      expect(store.nodes()).toHaveLength(2)
      expect(store.nodes().map((n) => n.id)).toEqual(['1', '3'])
      // Both edges connected to node 2 should be removed
      expect(store.edges()).toHaveLength(0)
    })
  })

  test('deleteElements removes only specified edges', () => {
    createRoot(() => {
      const store = createFlowStore({
        edges: [
          { id: 'e1', source: '1', target: '2' },
          { id: 'e2', source: '2', target: '3' },
        ],
      })

      store.deleteElements({ edges: [{ id: 'e1', source: '1', target: '2' }] })

      expect(store.edges()).toHaveLength(1)
      expect(store.edges()[0].id).toBe('e2')
    })
  })

  test('unselectNodesAndEdges deselects all', () => {
    createRoot(() => {
      const store = createFlowStore({
        nodes: [
          { id: '1', position: { x: 0, y: 0 }, data: {}, selected: true },
          { id: '2', position: { x: 100, y: 0 }, data: {}, selected: true },
        ],
        edges: [
          { id: 'e1', source: '1', target: '2', selected: true },
        ],
      })

      store.unselectNodesAndEdges()

      expect(store.nodes().every((n) => !n.selected)).toBe(true)
      expect(store.edges().every((e) => !e.selected)).toBe(true)
    })
  })

  test('multiSelectionActive defaults to false', () => {
    createRoot(() => {
      const store = createFlowStore()
      expect(store.multiSelectionActive()).toBe(false)
    })
  })
})
