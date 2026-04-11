"use client"
/**
 * FlowDemo Components
 *
 * Interactive demos for @barefootjs/xyflow.
 * Uses ref callback to initialize the flow imperatively.
 *
 * Compiler stress targets:
 * - Imperative init via ref callback
 * - Integration with @xyflow/system (D3-based pan/zoom)
 * - Multiple init functions (initFlow, initBackground, initControls)
 */

import { createRoot } from '@barefootjs/dom'
import { initFlow, initBackground, initControls } from '@barefootjs/xyflow'

/**
 * Basic flow — 4 nodes, 3 edges, pan/zoom
 */
export function FlowBasicDemo() {
  const handleMount = (el: HTMLElement) => {
    createRoot(() => {
      initFlow(el, {
        nodes: [
          { id: '1', position: { x: 0, y: 0 }, data: { label: 'Start' } },
          { id: '2', position: { x: 200, y: 80 }, data: { label: 'Process A' } },
          { id: '3', position: { x: 200, y: 200 }, data: { label: 'Process B' } },
          { id: '4', position: { x: 400, y: 130 }, data: { label: 'End' } },
        ],
        edges: [
          { id: 'e1-2', source: '1', target: '2' },
          { id: 'e1-3', source: '1', target: '3' },
          { id: 'e2-4', source: '2', target: '4' },
        ],
      })
    })
  }

  return (
    <div
      ref={handleMount}
      style="width:100%;height:400px;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden"
      data-testid="flow-basic"
    />
  )
}

/**
 * Flow with background and controls
 */
export function FlowWithPluginsDemo() {
  const handleMount = (el: HTMLElement) => {
    createRoot(() => {
      initFlow(el, {
        nodes: [
          { id: 'a', position: { x: 50, y: 50 }, data: { label: 'Input' } },
          { id: 'b', position: { x: 250, y: 50 }, data: { label: 'Transform' } },
          { id: 'c', position: { x: 250, y: 200 }, data: { label: 'Validate' } },
          { id: 'd', position: { x: 450, y: 120 }, data: { label: 'Output' } },
        ],
        edges: [
          { id: 'ab', source: 'a', target: 'b' },
          { id: 'ac', source: 'a', target: 'c' },
          { id: 'bd', source: 'b', target: 'd' },
          { id: 'cd', source: 'c', target: 'd' },
        ],
      })

      initBackground(el, { variant: 'dots', gap: 20, color: '#e0e0e0' })
      initControls(el, { position: 'bottom-left' })
    })
  }

  return (
    <div
      ref={handleMount}
      style="width:100%;height:400px;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden"
      data-testid="flow-plugins"
    />
  )
}

/**
 * Flow with many nodes — stress test for rendering
 */
export function FlowStressDemo() {
  const handleMount = (el: HTMLElement) => {
    createRoot(() => {
      // Generate a grid of nodes
      const nodes = []
      const edges = []
      const cols = 5
      const rows = 4

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const id = `n${r}-${c}`
          nodes.push({
            id,
            position: { x: c * 180, y: r * 100 },
            data: { label: `Node ${r * cols + c + 1}` },
          })

          // Connect to right neighbor
          if (c < cols - 1) {
            edges.push({
              id: `e${id}-n${r}-${c + 1}`,
              source: id,
              target: `n${r}-${c + 1}`,
            })
          }
          // Connect to bottom neighbor
          if (r < rows - 1) {
            edges.push({
              id: `e${id}-n${r + 1}-${c}`,
              source: id,
              target: `n${r + 1}-${c}`,
            })
          }
        }
      }

      initFlow(el, { nodes, edges, fitView: true })
      initBackground(el, { variant: 'lines', gap: 30, color: '#f0f0f0' })
      initControls(el, { position: 'top-right' })
    })
  }

  return (
    <div
      ref={handleMount}
      style="width:100%;height:500px;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden"
      data-testid="flow-stress"
    />
  )
}
