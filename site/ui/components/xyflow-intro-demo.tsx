"use client"
/**
 * xyflow Introduction Demos
 *
 * Standalone demos for the xyflow Introduction page. Originally kept in
 * a dedicated file so the Introduction's bundle was isolated from the
 * `renderNode` callback JSX in xyflow-demo.tsx that the compiler used
 * to leave untransformed. The compiler fix in #1211 has eliminated that
 * crash mode, but the file split is retained for clarity.
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
        <Background variant="dots" gap={30} />
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
        <Background variant="dots" gap={30} />
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
        <Background variant="dots" gap={30} />
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
        <Background variant="dots" gap={30} />
      </Flow>
    </div>
  )
}
