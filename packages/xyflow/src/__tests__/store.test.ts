import { describe, test, expect } from 'bun:test'
import { createEffect, createRoot } from '@barefootjs/dom'
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
})
