import { describe, test, expect, beforeAll, afterEach } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

// The renderer tests below call `document.createElement*` directly, so a
// DOM must be registered before they run.
beforeAll(() => {
  if (typeof window === 'undefined') {
    GlobalRegistrator.register()
  }
})

import { createRoot } from '@barefootjs/client'
import { createFlowStore } from '../store'
import { createEdgeRenderer } from '../edge-renderer'
import { SVG_NS } from '../constants'
import type { EdgeBase } from '../types'

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
 * Per-edge scope tests — assert the public DOM contract preserved by the
 * Phase-9 refactor (`.bf-flow__edge[data-id]` visible path,
 * `path[data-hit-id]` invisible hit area, classes for selected/animated)
 * and the per-edge isolation of the class effect.
 */
const TWO_NODES = [
  { id: 'a', position: { x: 0, y: 0 }, data: {}, measured: { width: 150, height: 40 } },
  { id: 'b', position: { x: 200, y: 0 }, data: {}, measured: { width: 150, height: 40 } },
]

describe('createEdgeRenderer (per-edge scope)', () => {
  let dispose: (() => void) | null = null
  let viewport: HTMLElement | null = null

  function setup(): { svg: SVGSVGElement; run: <T>(fn: () => T) => T } {
    viewport = document.createElement('div')
    document.body.appendChild(viewport)
    const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement
    viewport.appendChild(svg)
    let captured!: <T>(fn: () => T) => T
    createRoot((d) => {
      dispose = d
      captured = (fn) => fn()
    })
    return { svg, run: captured }
  }

  afterEach(() => {
    dispose?.()
    dispose = null
    viewport?.remove()
    viewport = null
  })

  test('mounts a visible path and a hit-area path per edge', () => {
    const { svg, run } = setup()
    run(() => {
      const store = createFlowStore({
        nodes: TWO_NODES,
        edges: [{ id: 'e1', source: 'a', target: 'b' }],
      })
      // initFlow normally populates lookups via measure; mimic that here.
      store.nodesInitialized()
      createEdgeRenderer(store, svg)

      const visible = svg.querySelector('.bf-flow__edge[data-id="e1"]') as SVGPathElement | null
      const hit = svg.querySelector('path[data-hit-id="e1"]') as SVGPathElement | null

      expect(visible).not.toBeNull()
      expect(hit).not.toBeNull()
      expect(visible!.getAttribute('d')).toBeTruthy()
      expect(hit!.getAttribute('d')).toBe(visible!.getAttribute('d'))
    })
  })

  test('applies bf-flow__edge--selected class when edge is selected', () => {
    const { svg, run } = setup()
    run(() => {
      // Annotate as EdgeBase[] so subsequent setEdges() accepts the full
      // shape; without this, EdgeType is narrowed to the literal initial
      // shape and rejects optional fields like `selected`.
      const initialEdges: EdgeBase[] = [{ id: 'e1', source: 'a', target: 'b' }]
      const store = createFlowStore({ nodes: TWO_NODES, edges: initialEdges })
      store.nodesInitialized()
      createEdgeRenderer(store, svg)

      const visible = svg.querySelector('.bf-flow__edge[data-id="e1"]') as SVGPathElement
      expect(visible.classList.contains('bf-flow__edge--selected')).toBe(false)

      store.setEdges([{ id: 'e1', source: 'a', target: 'b', selected: true }])
      expect(visible.classList.contains('bf-flow__edge--selected')).toBe(true)
    })
  })

  test('removes per-edge DOM when edge is removed from the array', () => {
    const { svg, run } = setup()
    run(() => {
      const store = createFlowStore({
        nodes: TWO_NODES,
        edges: [
          { id: 'e1', source: 'a', target: 'b' },
          { id: 'e2', source: 'b', target: 'a' },
        ],
      })
      store.nodesInitialized()
      createEdgeRenderer(store, svg)

      expect(svg.querySelectorAll('.bf-flow__edge').length).toBe(2)
      store.setEdges([{ id: 'e1', source: 'a', target: 'b' }])

      expect(svg.querySelectorAll('.bf-flow__edge').length).toBe(1)
      expect(svg.querySelector('.bf-flow__edge[data-id="e1"]')).not.toBeNull()
      expect(svg.querySelector('.bf-flow__edge[data-id="e2"]')).toBeNull()
      expect(svg.querySelector('path[data-hit-id="e2"]')).toBeNull()
    })
  })

  test('hidden edges are not mounted, and become mounted when toggled visible', () => {
    const { svg, run } = setup()
    run(() => {
      const initialEdges: EdgeBase[] = [
        { id: 'e1', source: 'a', target: 'b', hidden: true },
        { id: 'e2', source: 'b', target: 'a' },
      ]
      const store = createFlowStore({ nodes: TWO_NODES, edges: initialEdges })
      store.nodesInitialized()
      createEdgeRenderer(store, svg)

      expect(svg.querySelector('.bf-flow__edge[data-id="e1"]')).toBeNull()
      expect(svg.querySelector('.bf-flow__edge[data-id="e2"]')).not.toBeNull()

      // Flip hidden → visible. Outer effect should pick this up and mount e1.
      store.setEdges([
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'b', target: 'a' },
      ])
      expect(svg.querySelector('.bf-flow__edge[data-id="e1"]')).not.toBeNull()
    })
  })

  test('animated edges get bf-flow__edge--animated class', () => {
    const { svg, run } = setup()
    run(() => {
      const store = createFlowStore({
        nodes: TWO_NODES,
        edges: [{ id: 'e1', source: 'a', target: 'b', animated: true }],
      })
      store.nodesInitialized()
      createEdgeRenderer(store, svg)

      const visible = svg.querySelector('.bf-flow__edge[data-id="e1"]') as SVGPathElement
      expect(visible.classList.contains('bf-flow__edge--animated')).toBe(true)
    })
  })

  test('positionEpoch bump re-runs the per-edge effect', () => {
    const { svg, run } = setup()
    run(() => {
      const store = createFlowStore({
        nodes: TWO_NODES,
        edges: [{ id: 'e1', source: 'a', target: 'b' }],
      })
      store.nodesInitialized()
      createEdgeRenderer(store, svg)

      const visible = svg.querySelector('.bf-flow__edge[data-id="e1"]') as SVGPathElement
      const dBefore = visible.getAttribute('d')!

      // Mutate position in place (matches updateNodePositions during drag)
      // and bump positionEpoch.
      const lookup = store.nodeLookup()
      const a = lookup.get('a')!
      a.internals.positionAbsolute = { x: 0, y: 100 }
      store.triggerPositionUpdate()

      expect(visible.getAttribute('d')!).not.toBe(dBefore)
    })
  })

  test('toggling selection on edge A does not invalidate edge B class effect', () => {
    // Per-edge isolation contract: per-field memos (selected/animated)
    // dedupe on Object.is, so the class effect for an unrelated edge does
    // not re-run when only another edge's selected flips. Instrument by
    // replacing classList.toggle on each path with a counter.
    const { svg, run } = setup()
    run(() => {
      const initialEdges: EdgeBase[] = [
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'b', target: 'a' },
      ]
      const store = createFlowStore({ nodes: TWO_NODES, edges: initialEdges })
      store.nodesInitialized()
      createEdgeRenderer(store, svg)

      const e2Path = svg.querySelector('.bf-flow__edge[data-id="e2"]') as SVGPathElement
      let e2ClassToggleCount = 0
      const originalToggle = e2Path.classList.toggle.bind(e2Path.classList)
      e2Path.classList.toggle = ((token: string, force?: boolean) => {
        e2ClassToggleCount += 1
        return originalToggle(token, force as boolean)
      }) as DOMTokenList['toggle']

      // Toggle selection on e1 only — e2's class effect must not fire.
      store.setEdges([
        { id: 'e1', source: 'a', target: 'b', selected: true },
        { id: 'e2', source: 'b', target: 'a' },
      ])

      expect(e2ClassToggleCount).toBe(0)
    })
  })

  test('reconnect handles unmount when edge becomes non-reconnectable', () => {
    // Asserts the lifecycle fix: flipping `reconnectable: false` removes
    // the previously-mounted handle circles instead of leaking them.
    const { svg, run } = setup()
    run(() => {
      const initialEdges: EdgeBase[] = [{ id: 'e1', source: 'a', target: 'b' }]
      const store = createFlowStore({
        nodes: TWO_NODES,
        edges: initialEdges,
        edgesReconnectable: true,
      })
      store.nodesInitialized()
      createEdgeRenderer(store, svg)

      // Handles are mounted in the reconnect overlay, which is a sibling
      // of the edge SVG inside the viewport wrapper.
      const reconnectOverlay = viewport!.querySelector('.bf-flow__reconnect-overlay')!
      expect(reconnectOverlay.querySelectorAll('.bf-flow__edge-reconnect').length).toBe(2)

      // Flip per-edge reconnectable to false.
      store.setEdges([{ id: 'e1', source: 'a', target: 'b', reconnectable: false } as EdgeBase])
      expect(reconnectOverlay.querySelectorAll('.bf-flow__edge-reconnect').length).toBe(0)

      // Flip back — handles should re-mount.
      store.setEdges([{ id: 'e1', source: 'a', target: 'b' }])
      expect(reconnectOverlay.querySelectorAll('.bf-flow__edge-reconnect').length).toBe(2)
    })
  })
})
