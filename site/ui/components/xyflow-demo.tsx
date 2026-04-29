/**
 * xyflow JSX-native Demos
 *
 * Renders the JSX-native `<Flow>` graph editor with the four overlays
 * (`<Background>` / `<Controls>` / `<MiniMap>` / per-node `<Handle>`).
 *
 * NOTE: pan / zoom / drag / connection-drag wiring lands in cutover step
 * C4 (`packages/xyflow` extracts the imperative subsystems as utility
 * functions and exposes a `ref` hook the JSX `<Flow>` uses to attach
 * them). Until then the demo is visually correct (nodes positioned,
 * edges drawn, controls / minimap rendered) but interactive behavior
 * is delegated to the cutover step.
 */

"use client"

import {
  Background,
  Controls,
  Flow,
  Handle,
  MiniMap,
  NodeWrapper,
} from '@/components/ui/xyflow'
// `Position` is re-exported from `@barefootjs/xyflow` so consumers
// don't need a separate `@xyflow/system` dependency.
import { Position } from '@barefootjs/xyflow'

const initialNodes = [
  { id: '1', position: { x: 100, y: 100 }, data: { label: 'Input' } },
  { id: '2', position: { x: 350, y: 50 }, data: { label: 'Transform' } },
  { id: '3', position: { x: 350, y: 200 }, data: { label: 'Validate' } },
  { id: '4', position: { x: 600, y: 125 }, data: { label: 'Output' } },
]

const initialEdges = [
  { id: 'e1-2', source: '1', target: '2' },
  { id: 'e1-3', source: '1', target: '3' },
  { id: 'e2-4', source: '2', target: '4' },
  { id: 'e3-4', source: '3', target: '4' },
]

export function XyflowPreviewDemo() {
  return (
    <div className="w-full h-[420px] rounded-lg border bg-background overflow-hidden">
      <Flow nodes={initialNodes} edges={initialEdges}>
        <Background variant="dots" gap={20} color="#e5e7eb" />
        <Controls />
        <MiniMap pannable zoomable />
      </Flow>
    </div>
  )
}

export function XyflowBackgroundVariantsDemo() {
  return (
    <div className="grid grid-cols-3 gap-4 w-full">
      <div className="h-48 rounded-lg border bg-background overflow-hidden">
        <Flow nodes={[]} edges={[]}>
          <Background variant="dots" gap={20} />
        </Flow>
      </div>
      <div className="h-48 rounded-lg border bg-background overflow-hidden">
        <Flow nodes={[]} edges={[]}>
          <Background variant="lines" gap={30} />
        </Flow>
      </div>
      <div className="h-48 rounded-lg border bg-background overflow-hidden">
        <Flow nodes={[]} edges={[]}>
          <Background variant="cross" gap={32} />
        </Flow>
      </div>
    </div>
  )
}

// Custom-node demo: build the node body manually with `<NodeWrapper>` +
// `<Handle>`, mirroring the React-Flow custom-node pattern.
export function XyflowCustomNodeDemo() {
  const nodes = [
    { id: 'src', position: { x: 80, y: 100 }, data: { label: 'Source', kind: 'source' } },
    { id: 'mid', position: { x: 320, y: 80 }, data: { label: 'Pipeline', kind: 'mid' } },
    { id: 'dst', position: { x: 560, y: 120 }, data: { label: 'Sink', kind: 'sink' } },
  ]
  const edges = [
    { id: 'src-mid', source: 'src', target: 'mid' },
    { id: 'mid-dst', source: 'mid', target: 'dst' },
  ]

  return (
    <div className="w-full h-[360px] rounded-lg border bg-background overflow-hidden">
      <Flow nodes={nodes} edges={edges}>
        <Background variant="cross" gap={28} />
        <Controls showInteractive={false} />
        {nodes.map((n) => (
          <NodeWrapper key={n.id} nodeId={n.id}>
            <div className="rounded-md border bg-card px-3 py-2 text-sm shadow-sm">
              {n.data.label}
              <Handle type="target" position={Position.Left} nodeId={n.id} />
              <Handle type="source" position={Position.Right} nodeId={n.id} />
            </div>
          </NodeWrapper>
        ))}
      </Flow>
    </div>
  )
}
