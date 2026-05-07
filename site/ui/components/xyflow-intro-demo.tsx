"use client"
/**
 * xyflow Introduction Demos
 *
 * Standalone demos for the xyflow Introduction page. Kept in a dedicated
 * file so the Introduction's bundle stays isolated from xyflow-demo.tsx
 * (whose XyflowCustomNodeDemo carries `renderNode` callback JSX the
 * compiler does not transform).
 *
 * The demos rely on Flow's default node renderer (DefaultNodeBody),
 * which mounts target=Top / source=Bottom handles so edges flow
 * top-down — the same convention as xyflow/react's quick start.
 *
 * MiniMap is intentionally omitted on the Introduction page; it is
 * documented on the Components reference page.
 */

import { Background, Controls, Flow } from '@/components/ui/xyflow'

const twoNodes = [
  { id: 'a', position: { x: 80, y: 30 },   data: { label: 'Hello' } },
  { id: 'b', position: { x: 320, y: 180 }, data: { label: 'World' } },
]

const oneEdge = [{ id: 'a-b', source: 'a', target: 'b' }]

/**
 * Quick Start — two nodes connected by a single edge, with the
 * Background and Controls overlays. Nodes are draggable.
 */
export function XyflowQuickStartDemo() {
  return (
    <div className="w-full h-[420px] rounded-lg border bg-background overflow-hidden">
      <Flow nodes={twoNodes} edges={oneEdge}>
        <Background variant="dots" gap={20} />
        <Controls />
      </Flow>
    </div>
  )
}

/**
 * Empty Flow — bare canvas with the Background pattern only.
 */
export function XyflowEmptyDemo() {
  return (
    <div className="w-full h-[240px] rounded-lg border bg-background overflow-hidden">
      <Flow nodes={[]} edges={[]}>
        <Background variant="dots" gap={20} />
      </Flow>
    </div>
  )
}

/**
 * Two nodes, no edges yet.
 */
export function XyflowNodesDemo() {
  return (
    <div className="w-full h-[240px] rounded-lg border bg-background overflow-hidden">
      <Flow nodes={twoNodes} edges={[]}>
        <Background variant="dots" gap={20} />
      </Flow>
    </div>
  )
}

/**
 * Two nodes connected by a single edge.
 */
export function XyflowEdgesDemo() {
  return (
    <div className="w-full h-[240px] rounded-lg border bg-background overflow-hidden">
      <Flow nodes={twoNodes} edges={oneEdge}>
        <Background variant="dots" gap={20} />
      </Flow>
    </div>
  )
}
