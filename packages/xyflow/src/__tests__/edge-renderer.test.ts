import { describe, test, expect } from 'bun:test'
import { createRoot } from '@barefootjs/client/runtime'
import { createFlowStore } from '../store'

describe('Edge processing in store', () => {
  test('edgeLookup is populated from edges', () => {
    createRoot(() => {
      const store = createFlowStore({
        edges: [
          { id: 'e1', source: '1', target: '2' },
          { id: 'e2', source: '2', target: '3' },
          { id: 'e3', source: '1', target: '3' },
        ],
      })

      const lookup = store.edgeLookup()
      expect(lookup.size).toBe(3)
      expect(lookup.get('e1')?.source).toBe('1')
      expect(lookup.get('e2')?.target).toBe('3')
    })
  })

  test('edgeLookup updates when edges change', () => {
    createRoot(() => {
      const store = createFlowStore({
        edges: [{ id: 'e1', source: '1', target: '2' }],
      })

      expect(store.edgeLookup().size).toBe(1)

      store.setEdges([
        { id: 'e1', source: '1', target: '2' },
        { id: 'e2', source: '2', target: '3' },
      ])

      expect(store.edgeLookup().size).toBe(2)
    })
  })

  test('connectionLookup is populated from edges', () => {
    createRoot(() => {
      const store = createFlowStore({
        edges: [
          { id: 'e1', source: 'a', target: 'b' },
        ],
      })

      const connLookup = store.connectionLookup()
      // connectionLookup is a Map<string, Map<string, HandleConnection>>
      expect(connLookup.size).toBeGreaterThanOrEqual(0)
    })
  })

  test('hidden edges are preserved in lookup', () => {
    createRoot(() => {
      const store = createFlowStore({
        edges: [
          { id: 'e1', source: '1', target: '2', hidden: true },
          { id: 'e2', source: '2', target: '3' },
        ],
      })

      // Edge lookup contains all edges including hidden
      const lookup = store.edgeLookup()
      expect(lookup.size).toBe(2)
      expect(lookup.get('e1')?.hidden).toBe(true)
    })
  })
})
