/**
 * xyflow JSX-native Demos
 *
 * Renders the JSX-native `<Flow>` graph editor with the four overlays
 * (`<Background>` / `<Controls>` / `<MiniMap>`).
 *
 * The custom-body / custom-handle demos below still return HTML strings
 * from `renderNode` rather than inline JSX. This file predates the
 * compiler fix in #1211 (which now hoists inline `(n) => <div/>`
 * arrows into synthesized client components); the string-returning
 * helpers are kept as-is to preserve the existing visual snapshots
 * until a follow-up rewrites them in inline JSX with end-to-end
 * verification.
 */

"use client"

import {
  Background,
  Controls,
  Flow,
  MiniMap,
} from '@/components/ui/xyflow'
import { Position } from '@barefootjs/xyflow'

// Static-handle markup helper: produces the same DOM signature as the
// JSX `<Handle>` (class names + data-* attributes) so static node
// previews still register handle bounds for the connection layer.
function handleHTML(opts: {
  type: 'source' | 'target'
  position: Position
  nodeId: string
  id?: string
}): string {
  const modifier = opts.type === 'source' ? 'bf-flow__handle--source' : 'bf-flow__handle--target'
  const idAttr = opts.id ? ` data-handleid="${opts.id}"` : ''
  return (
    `<div class="bf-flow__handle ${modifier} ${opts.type}"` +
    ` data-handle-type="${opts.type}"` +
    ` data-handlepos="${opts.position}"` +
    ` data-handle-position="${opts.position}"` +
    ` data-node-id="${opts.nodeId}"${idAttr}></div>`
  )
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Custom-body / custom-handle previews.
//
// These demos return an HTML *string* from `renderNode` (the
// `pillBodyHTML` / `fanBodyHTML` helpers below). The compiler fix in
// #1211 makes the conventional `renderNode={(n) => <div/>}` shape
// compile cleanly, but the string-return shape is kept here to preserve
// the existing visual snapshots; a follow-up will migrate these demos
// to inline JSX once the new path has bake-in time.
const customBodyNodes = [
  { id: 'src', position: { x:  80, y: 100 }, data: { label: 'Source' } },
  { id: 'mid', position: { x: 320, y:  80 }, data: { label: 'Pipeline' } },
  { id: 'dst', position: { x: 560, y: 120 }, data: { label: 'Sink' } },
]
const customBodyEdges = [
  { id: 'src-mid', source: 'src', target: 'mid' },
  { id: 'mid-dst', source: 'mid', target: 'dst' },
]

// Per-id colour palette so each Source / Pipeline / Sink is visually
// distinct from the others *and* from Flow's default node body.
const customBodyTone: Record<string, string> = {
  src: 'bg-emerald-500 text-white border-emerald-600',
  mid: 'bg-amber-500  text-white border-amber-600',
  dst: 'bg-sky-500    text-white border-sky-600',
}

function pillBodyHTML(n: { id: string; data: { label?: string } }): string {
  const tone = customBodyTone[n.id] ?? 'bg-card text-foreground border'
  return (
    `<div class="rounded-full border-2 px-5 py-2 text-sm font-semibold shadow-md ${tone}">` +
    handleHTML({ type: 'target', position: Position.Left, nodeId: n.id }) +
    escapeHtml(n.data.label ?? n.id) +
    handleHTML({ type: 'source', position: Position.Right, nodeId: n.id }) +
    `</div>`
  )
}

export function XyflowCustomBodyDemo() {
  return (
    <div className="w-full h-[280px] rounded-lg border bg-background overflow-hidden">
      <Flow
        nodes={customBodyNodes}
        edges={customBodyEdges}
        // biome-ignore lint/suspicious/noExplicitAny: returning a string (not Child) so the SSR + hydrate template-literal embedding stays clean.
        renderNode={((n: { id: string; data: { label?: string } }) => pillBodyHTML(n)) as any}
      >
        <Background variant="dots" gap={30} />
      </Flow>
    </div>
  )
}

const fanNodes = [
  { id: 'fan', position: { x:  80, y: 120 }, data: { label: 'Router' } },
  { id: 'a',   position: { x: 360, y:  30 }, data: { label: 'A' } },
  { id: 'b',   position: { x: 360, y: 140 }, data: { label: 'B' } },
  { id: 'c',   position: { x: 360, y: 240 }, data: { label: 'C' } },
]
const fanEdges = [
  { id: 'fan-a', source: 'fan', sourceHandle: 'top',    target: 'a' },
  { id: 'fan-b', source: 'fan', sourceHandle: 'right',  target: 'b' },
  { id: 'fan-c', source: 'fan', sourceHandle: 'bottom', target: 'c' },
]

function fanBodyHTML(n: { id: string; data: { label?: string } }): string {
  if (n.id === 'fan') {
    return (
      `<div class="rounded-full border-2 border-violet-600 bg-violet-500 text-white px-5 py-2 text-sm font-semibold shadow-md">` +
      handleHTML({ type: 'source', position: Position.Top,    nodeId: n.id, id: 'top' }) +
      handleHTML({ type: 'source', position: Position.Right,  nodeId: n.id, id: 'right' }) +
      handleHTML({ type: 'source', position: Position.Bottom, nodeId: n.id, id: 'bottom' }) +
      escapeHtml(n.data.label ?? n.id) +
      `</div>`
    )
  }
  return (
    `<div class="rounded-full border-2 border-slate-400 bg-white text-slate-800 px-4 py-1.5 text-sm font-medium shadow-sm">` +
    handleHTML({ type: 'target', position: Position.Left, nodeId: n.id }) +
    escapeHtml(n.data.label ?? n.id) +
    `</div>`
  )
}

export function XyflowCustomHandlesDemo() {
  return (
    <div className="w-full h-[320px] rounded-lg border bg-background overflow-hidden">
      <Flow
        nodes={fanNodes}
        edges={fanEdges}
        // biome-ignore lint/suspicious/noExplicitAny: see XyflowCustomBodyDemo above for the rationale.
        renderNode={((n: { id: string; data: { label?: string } }) => fanBodyHTML(n)) as any}
      >
        <Background variant="dots" gap={30} />
      </Flow>
    </div>
  )
}

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
        <Background variant="dots" gap={20} />
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

// Edge-variants demo: four parallel routes between two columns, each
// using a different `edge.type` so the path geometries sit side by
// side for comparison. Default node body keeps the bundle parseable.
const variantsLeftNodes = [
  { id: 'l1', position: { x: 60, y: 30 },  data: { label: 'default' } },
  { id: 'l2', position: { x: 60, y: 110 }, data: { label: 'bezier' } },
  { id: 'l3', position: { x: 60, y: 190 }, data: { label: 'smoothstep' } },
  { id: 'l4', position: { x: 60, y: 270 }, data: { label: 'straight' } },
]
const variantsRightNodes = [
  { id: 'r1', position: { x: 360, y: 30 },  data: { label: 'r1' } },
  { id: 'r2', position: { x: 360, y: 110 }, data: { label: 'r2' } },
  { id: 'r3', position: { x: 360, y: 190 }, data: { label: 'r3' } },
  { id: 'r4', position: { x: 360, y: 270 }, data: { label: 'r4' } },
]
const variantsEdges = [
  { id: 'e1', source: 'l1', target: 'r1' },
  { id: 'e2', source: 'l2', target: 'r2', type: 'bezier' },
  { id: 'e3', source: 'l3', target: 'r3', type: 'smoothstep' },
  { id: 'e4', source: 'l4', target: 'r4', type: 'straight' },
]

export function XyflowEdgeVariantsDemo() {
  return (
    <div className="w-full h-[360px] rounded-lg border bg-background overflow-hidden">
      <Flow nodes={[...variantsLeftNodes, ...variantsRightNodes]} edges={variantsEdges}>
        <Background variant="dots" gap={30} />
      </Flow>
    </div>
  )
}

// Animated-edges demo: same nodes as the preview, edges marked
// `animated` so the visible stroke gains the dash-march animation.
const animatedEdgesNodes = [
  { id: 'a', position: { x: 80,  y: 50 }, data: { label: 'Source' } },
  { id: 'b', position: { x: 320, y: 50 }, data: { label: 'Process' } },
  { id: 'c', position: { x: 560, y: 50 }, data: { label: 'Sink' } },
]
const animatedEdgesEdges = [
  { id: 'a-b', source: 'a', target: 'b', animated: true },
  { id: 'b-c', source: 'b', target: 'c', animated: true },
]

export function XyflowAnimatedEdgesDemo() {
  return (
    <div className="w-full h-[220px] rounded-lg border bg-background overflow-hidden">
      <Flow nodes={animatedEdgesNodes} edges={animatedEdgesEdges}>
        <Background variant="dots" gap={30} />
      </Flow>
    </div>
  )
}
