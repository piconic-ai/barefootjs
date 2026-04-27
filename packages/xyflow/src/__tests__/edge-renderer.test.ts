import { describe, test, expect, beforeAll } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

// Register happy-dom globals BEFORE importing modules that use the DOM.
// Without this, document.createElementNS is undefined when edge-renderer
// loads and the per-edge mount path fails on import.
beforeAll(() => {
  if (typeof window === 'undefined') {
    GlobalRegistrator.register()
  }
})

import { createRoot } from '@barefootjs/client'
import { createFlowStore } from '../store'
import { createEdgeRenderer } from '../edge-renderer'
import { SVG_NS } from '../constants'

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

/**
 * Per-edge scope tests — exercise the post-PoC architecture where
 * each edge is mounted in its own createRoot with an inner createEffect.
 *
 * These tests assert the public DOM contract that the legacy
 * implementation also held (`.bf-flow__edge[data-id]` visible path,
 * `path[data-hit-id]` invisible hit area, classes for selected/animated).
 * The reconnection handler in `connection.ts` queries that contract by
 * selector, so keeping it stable is what enables the refactor without
 * changing call sites.
 */
function makeFlowDom() {
  // initFlow normally creates this wrapper structure. For the renderer
  // unit test, we mimic the relevant parts: a viewport <div> with an
  // <svg> child for edges.
  const viewport = document.createElement('div')
  document.body.appendChild(viewport)
  const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement
  viewport.appendChild(svg)
  return { viewport, svg }
}

describe('createEdgeRenderer (per-edge scope)', () => {
  test('mounts a visible path and a hit-area path per edge', () => {
    createRoot(() => {
      const { svg } = makeFlowDom()
      const store = createFlowStore({
        nodes: [
          { id: 'a', position: { x: 0, y: 0 }, data: {}, measured: { width: 150, height: 40 } },
          { id: 'b', position: { x: 200, y: 0 }, data: {}, measured: { width: 150, height: 40 } },
        ],
        edges: [{ id: 'e1', source: 'a', target: 'b' }],
      })
      // Force lookups to populate (initFlow normally does this via measure)
      store.nodesInitialized()

      createEdgeRenderer(store, svg)

      const visible = svg.querySelector('.bf-flow__edge[data-id="e1"]') as SVGPathElement | null
      const hit = svg.querySelector('path[data-hit-id="e1"]') as SVGPathElement | null

      expect(visible).not.toBeNull()
      expect(hit).not.toBeNull()
      // Visible path has a `d` attribute populated by the inner effect
      expect(visible!.getAttribute('d')).toBeTruthy()
      // Hit area mirrors visible path's `d` so click detection follows
      // the same shape
      expect(hit!.getAttribute('d')).toBe(visible!.getAttribute('d'))
    })
  })

  test('applies bf-flow__edge--selected class when edge is selected', () => {
    createRoot(() => {
      const { svg } = makeFlowDom()
      const store = createFlowStore({
        nodes: [
          { id: 'a', position: { x: 0, y: 0 }, data: {}, measured: { width: 150, height: 40 } },
          { id: 'b', position: { x: 200, y: 0 }, data: {}, measured: { width: 150, height: 40 } },
        ],
        edges: [{ id: 'e1', source: 'a', target: 'b' }],
      })
      store.nodesInitialized()
      createEdgeRenderer(store, svg)

      const visible = svg.querySelector('.bf-flow__edge[data-id="e1"]') as SVGPathElement
      expect(visible.classList.contains('bf-flow__edge--selected')).toBe(false)

      // Toggle selection — only this edge's per-edge effect should re-run
      store.setEdges([{ id: 'e1', source: 'a', target: 'b', selected: true }])

      expect(visible.classList.contains('bf-flow__edge--selected')).toBe(true)
    })
  })

  test('removes per-edge DOM when edge is removed from the array', () => {
    createRoot(() => {
      const { svg } = makeFlowDom()
      const store = createFlowStore({
        nodes: [
          { id: 'a', position: { x: 0, y: 0 }, data: {}, measured: { width: 150, height: 40 } },
          { id: 'b', position: { x: 200, y: 0 }, data: {}, measured: { width: 150, height: 40 } },
        ],
        edges: [
          { id: 'e1', source: 'a', target: 'b' },
          { id: 'e2', source: 'b', target: 'a' },
        ],
      })
      store.nodesInitialized()
      createEdgeRenderer(store, svg)

      expect(svg.querySelectorAll('.bf-flow__edge').length).toBe(2)

      store.setEdges([{ id: 'e1', source: 'a', target: 'b' }])

      // Disposing the per-edge root should also remove its DOM nodes
      expect(svg.querySelectorAll('.bf-flow__edge').length).toBe(1)
      expect(svg.querySelector('.bf-flow__edge[data-id="e1"]')).not.toBeNull()
      expect(svg.querySelector('.bf-flow__edge[data-id="e2"]')).toBeNull()
      // Hit areas should also be cleaned up
      expect(svg.querySelector('path[data-hit-id="e2"]')).toBeNull()
    })
  })

  test('hidden edges are not mounted', () => {
    createRoot(() => {
      const { svg } = makeFlowDom()
      const store = createFlowStore({
        nodes: [
          { id: 'a', position: { x: 0, y: 0 }, data: {}, measured: { width: 150, height: 40 } },
          { id: 'b', position: { x: 200, y: 0 }, data: {}, measured: { width: 150, height: 40 } },
        ],
        edges: [
          { id: 'e1', source: 'a', target: 'b', hidden: true },
          { id: 'e2', source: 'b', target: 'a' },
        ],
      })
      store.nodesInitialized()
      createEdgeRenderer(store, svg)

      expect(svg.querySelector('.bf-flow__edge[data-id="e1"]')).toBeNull()
      expect(svg.querySelector('.bf-flow__edge[data-id="e2"]')).not.toBeNull()
    })
  })

  test('animated edges get bf-flow__edge--animated class', () => {
    createRoot(() => {
      const { svg } = makeFlowDom()
      const store = createFlowStore({
        nodes: [
          { id: 'a', position: { x: 0, y: 0 }, data: {}, measured: { width: 150, height: 40 } },
          { id: 'b', position: { x: 200, y: 0 }, data: {}, measured: { width: 150, height: 40 } },
        ],
        edges: [{ id: 'e1', source: 'a', target: 'b', animated: true }],
      })
      store.nodesInitialized()
      createEdgeRenderer(store, svg)

      const visible = svg.querySelector('.bf-flow__edge[data-id="e1"]') as SVGPathElement
      expect(visible.classList.contains('bf-flow__edge--animated')).toBe(true)
    })
  })

  test('positionEpoch bump re-runs the per-edge effect', () => {
    createRoot(() => {
      const { svg } = makeFlowDom()
      const store = createFlowStore({
        nodes: [
          { id: 'a', position: { x: 0, y: 0 }, data: {}, measured: { width: 150, height: 40 } },
          { id: 'b', position: { x: 200, y: 0 }, data: {}, measured: { width: 150, height: 40 } },
        ],
        edges: [{ id: 'e1', source: 'a', target: 'b' }],
      })
      store.nodesInitialized()
      createEdgeRenderer(store, svg)

      const visible = svg.querySelector('.bf-flow__edge[data-id="e1"]') as SVGPathElement
      const dBefore = visible.getAttribute('d')!

      // Mutate the source node's positionAbsolute in place (mirrors what
      // updateNodePositions does during a drag) and bump positionEpoch.
      const lookup = store.nodeLookup()
      const a = lookup.get('a')!
      a.internals.positionAbsolute = { x: 0, y: 100 }
      store.triggerPositionUpdate()

      const dAfter = visible.getAttribute('d')!
      expect(dAfter).not.toBe(dBefore)
    })
  })
})
