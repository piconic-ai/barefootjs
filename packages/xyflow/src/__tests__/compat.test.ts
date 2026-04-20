import { describe, test, expect } from 'bun:test'
import { createRoot } from '@barefootjs/client/runtime'
import { createFlowStore } from '../store'

/**
 * Tests for applyNodeChanges / applyEdgeChanges logic
 * used inside compat.ts (useNodesState, useEdgesState).
 *
 * We test the store actions directly since compat hooks require
 * context which needs DOM.
 */
describe('Store actions (compat foundation)', () => {
  test('addEdge creates a new edge', () => {
    createRoot(() => {
      const store = createFlowStore({
        nodes: [
          { id: '1', position: { x: 0, y: 0 }, data: {} },
          { id: '2', position: { x: 100, y: 0 }, data: {} },
        ],
      })

      store.addEdge({ id: 'e1-2', source: '1', target: '2' })
      expect(store.edges()).toHaveLength(1)
      expect(store.edges()[0]).toEqual({ id: 'e1-2', source: '1', target: '2' })
    })
  })

  test('addEdge appends to existing edges', () => {
    createRoot(() => {
      const store = createFlowStore({
        edges: [{ id: 'e1', source: '1', target: '2' }],
      })

      store.addEdge({ id: 'e2', source: '2', target: '3' })
      expect(store.edges()).toHaveLength(2)
      expect(store.edges().map(e => e.id)).toEqual(['e1', 'e2'])
    })
  })

  test('deleteElements removes specific edges only', () => {
    createRoot(() => {
      const store = createFlowStore({
        edges: [
          { id: 'e1', source: '1', target: '2' },
          { id: 'e2', source: '2', target: '3' },
          { id: 'e3', source: '3', target: '4' },
        ],
      })

      store.deleteElements({ edges: [{ id: 'e2', source: '2', target: '3' }] })
      expect(store.edges()).toHaveLength(2)
      expect(store.edges().map(e => e.id)).toEqual(['e1', 'e3'])
    })
  })

  test('deleteElements removes nodes and their connected edges', () => {
    createRoot(() => {
      const store = createFlowStore({
        nodes: [
          { id: 'a', position: { x: 0, y: 0 }, data: {} },
          { id: 'b', position: { x: 100, y: 0 }, data: {} },
          { id: 'c', position: { x: 200, y: 0 }, data: {} },
        ],
        edges: [
          { id: 'ab', source: 'a', target: 'b' },
          { id: 'bc', source: 'b', target: 'c' },
          { id: 'ac', source: 'a', target: 'c' },
        ],
      })

      // Remove node b
      store.deleteElements({ nodes: [{ id: 'b', position: { x: 100, y: 0 }, data: {} }] })

      expect(store.nodes().map(n => n.id)).toEqual(['a', 'c'])
      // ab and bc are connected to b, should be removed. ac survives.
      expect(store.edges().map(e => e.id)).toEqual(['ac'])
    })
  })

  test('unselectNodesAndEdges clears all selection', () => {
    createRoot(() => {
      const store = createFlowStore({
        nodes: [
          { id: '1', position: { x: 0, y: 0 }, data: {}, selected: true },
          { id: '2', position: { x: 100, y: 0 }, data: {}, selected: false },
          { id: '3', position: { x: 200, y: 0 }, data: {}, selected: true },
        ],
        edges: [
          { id: 'e1', source: '1', target: '2', selected: true },
        ],
      })

      store.unselectNodesAndEdges()

      expect(store.nodes().filter(n => n.selected)).toHaveLength(0)
      expect(store.edges().filter(e => e.selected)).toHaveLength(0)
    })
  })

  test('unselectNodesAndEdges with specific nodes', () => {
    createRoot(() => {
      const store = createFlowStore({
        nodes: [
          { id: '1', position: { x: 0, y: 0 }, data: {}, selected: true },
          { id: '2', position: { x: 100, y: 0 }, data: {}, selected: true },
        ],
      })

      // Only deselect node 1
      store.unselectNodesAndEdges({
        nodes: [{ id: '1', position: { x: 0, y: 0 }, data: {}, selected: true }],
      })

      expect(store.nodes().find(n => n.id === '1')?.selected).toBeFalsy()
      expect(store.nodes().find(n => n.id === '2')?.selected).toBeTruthy()
    })
  })

  test('setNodes with updater function', () => {
    createRoot(() => {
      const store = createFlowStore({
        nodes: [
          { id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } },
        ],
      })

      store.setNodes(prev => [
        ...prev,
        { id: '2', position: { x: 100, y: 0 }, data: { label: 'B' } },
      ])

      expect(store.nodes()).toHaveLength(2)
      expect(store.nodes()[1].id).toBe('2')
    })
  })

  test('setEdges with updater function', () => {
    createRoot(() => {
      const store = createFlowStore({
        edges: [{ id: 'e1', source: '1', target: '2' }],
      })

      store.setEdges(prev => prev.filter(e => e.id !== 'e1'))
      expect(store.edges()).toHaveLength(0)
    })
  })

  test('viewport can be updated', () => {
    createRoot(() => {
      const store = createFlowStore()

      store.setViewport({ x: 100, y: 200, zoom: 2.5 })
      expect(store.viewport()).toEqual({ x: 100, y: 200, zoom: 2.5 })
      expect(store.getTransform()).toEqual([100, 200, 2.5])
    })
  })
})
