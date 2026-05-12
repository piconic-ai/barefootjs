/**
 * xyflow JSX-native Demos
 *
 * Renders the JSX-native `<Flow>` graph editor with the four overlays
 * (`<Background>` / `<Controls>` / `<MiniMap>`).
 *
 * The custom-body / custom-handle demos below return live JSX from
 * `renderNode`. This relies on the compiler fix in #1211 (inline
 * `(n) => <div/>` arrows hoisted into synthesized client components)
 * and the runtime fix in #1213 (live `Node` returns spliced into
 * branch templates via `__bfSlot` instead of being stringified by
 * the surrounding template literal).
 */

"use client"

import { createSignal, createEffect, onCleanup, createContext, useContext } from '@barefootjs/client'
import {
  Background,
  Controls,
  Flow,
  Handle,
  MiniMap,
} from '@/components/ui/xyflow'
import { Position } from '@barefootjs/xyflow'

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

function PillNode(props: { id: string }) {
  const node = customBodyNodes.find((n) => n.id === props.id)
  const label = node?.data?.label ?? props.id
  const tone = customBodyTone[props.id] ?? 'bg-card text-foreground border'
  return (
    <div className={`rounded-full border-2 px-5 py-2 text-sm font-semibold shadow-md ${tone}`}>
      <Handle type="target" position={Position.Left} nodeId={props.id} />
      {label}
      <Handle type="source" position={Position.Right} nodeId={props.id} />
    </div>
  )
}

export function XyflowCustomBodyDemo() {
  return (
    <div className="w-full h-[280px] rounded-lg border bg-background overflow-hidden">
      <Flow
        nodes={customBodyNodes}
        edges={customBodyEdges}
        renderNode={(n) => <PillNode id={n.id} />}
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

function FanNode(props: { id: string }) {
  const node = fanNodes.find((n) => n.id === props.id)
  const label = node?.data?.label ?? props.id
  if (props.id === 'fan') {
    return (
      <div className="rounded-full border-2 border-violet-600 bg-violet-500 text-white px-5 py-2 text-sm font-semibold shadow-md">
        <Handle type="source" position={Position.Top} nodeId={props.id} id="top" />
        <Handle type="source" position={Position.Right} nodeId={props.id} id="right" />
        <Handle type="source" position={Position.Bottom} nodeId={props.id} id="bottom" />
        {label}
      </div>
    )
  }
  return (
    <div className="rounded-full border-2 border-slate-400 bg-white text-slate-800 px-4 py-1.5 text-sm font-medium shadow-sm">
      <Handle type="target" position={Position.Left} nodeId={props.id} />
      {label}
    </div>
  )
}

export function XyflowCustomHandlesDemo() {
  return (
    <div className="w-full h-[320px] rounded-lg border bg-background overflow-hidden">
      <Flow
        nodes={fanNodes}
        edges={fanEdges}
        renderNode={(n) => <FanNode id={n.id} />}
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

/**
 * Highlight Depth demo — per-node `--node-glow` CSS custom property
 * driven by a depth signal.
 *
 * A slider controls a `depthLimit` signal (0..4). Each node has a
 * pre-configured `nodeDepth` (its distance from the root). When the
 * slider's value is at or above the node's depth, the node gets a
 * visible glow whose intensity is `style={{'--node-glow': intensity}}`.
 * Otherwise the node fades.
 *
 * Exercises the CSS-var × `.map()` × per-node binding path inside a
 * `renderNode` callback that's invoked once per node by `<Flow>`.
 */
const highlightDepthNodes = [
  { id: 'root', position: { x:  80, y: 130 }, data: { label: 'Root', depth: 0 } },
  { id: 'l1',   position: { x: 280, y:  60 }, data: { label: 'Tier 1', depth: 1 } },
  { id: 'l1b',  position: { x: 280, y: 200 }, data: { label: 'Tier 1', depth: 1 } },
  { id: 'l2',   position: { x: 480, y:  30 }, data: { label: 'Tier 2', depth: 2 } },
  { id: 'l2b',  position: { x: 480, y: 130 }, data: { label: 'Tier 2', depth: 2 } },
  { id: 'l2c',  position: { x: 480, y: 230 }, data: { label: 'Tier 2', depth: 2 } },
]
const highlightDepthEdges = [
  { id: 'root-l1',  source: 'root', target: 'l1' },
  { id: 'root-l1b', source: 'root', target: 'l1b' },
  { id: 'l1-l2',    source: 'l1',   target: 'l2' },
  { id: 'l1-l2b',   source: 'l1',   target: 'l2b' },
  { id: 'l1b-l2c',  source: 'l1b',  target: 'l2c' },
]

// Module-scope lookup so the inline `renderNode` callback can read each
// node's depth inside the template lambda — BF052 forbids referencing
// init-body locals from the template position, so the Record stays at
// module scope and the callback only reads `props.id`.
const highlightDepthMap: Record<string, { label: string; depth: number }> = {
  root: { label: 'Root',   depth: 0 },
  l1:   { label: 'Tier 1', depth: 1 },
  l1b:  { label: 'Tier 1', depth: 1 },
  l2:   { label: 'Tier 2', depth: 2 },
  l2b:  { label: 'Tier 2', depth: 2 },
  l2c:  { label: 'Tier 2', depth: 2 },
}

// Context bridges the depth signal across the renderNode boundary.
// `<Flow renderNode>` callbacks can't capture init-body locals (the
// callback's body is lifted to a synthesized module-level component),
// so we publish the value via a Context the wrapper sets up.
const HighlightDepthContext = createContext<{ depth: () => number }>({ depth: () => 0 })

function HighlightDepthNodeBody(props: { id: string }) {
  const ctx = useContext(HighlightDepthContext)
  const intensity = () => {
    const nodeDepth = highlightDepthMap[props.id]?.depth ?? 0
    return ctx.depth() >= nodeDepth
      ? Math.max(0, 1 - (ctx.depth() - nodeDepth) * 0.25).toFixed(2)
      : '0'
  }
  return (
    <div
      className="xyflow-depth-node rounded-md border-2 border-primary bg-card px-4 py-2 text-sm font-medium shadow-sm transition-[opacity,box-shadow]"
      style={{
        '--node-glow': intensity(),
        opacity: 'calc(0.3 + 0.7 * var(--node-glow))',
        boxShadow: '0 0 calc(12px * var(--node-glow)) hsl(var(--primary, 0deg) / var(--node-glow))',
      }}
      data-depth-node={props.id}
      data-node-depth={String(highlightDepthMap[props.id]?.depth ?? 0)}
    >
      <Handle type="target" position={Position.Left} nodeId={props.id} />
      {highlightDepthMap[props.id]?.label ?? props.id}
      <Handle type="source" position={Position.Right} nodeId={props.id} />
    </div>
  )
}

export function XyflowHighlightDepthDemo() {
  const [depth, setDepth] = createSignal(2)

  return (
    <HighlightDepthContext.Provider value={{ depth }}>
      <div className="w-full space-y-3" data-highlight-depth-demo>
        <label className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground w-32">Highlight depth</span>
          <input
            type="range"
            min="0"
            max="4"
            value={String(depth())}
            onInput={(e: Event) => setDepth(Number((e.target as HTMLInputElement).value))}
            data-highlight-depth-slider
            className="flex-1 accent-primary"
          />
          <span className="w-8 text-right font-mono" data-highlight-depth-value>
            {depth()}
          </span>
        </label>
        <div className="w-full h-[280px] rounded-lg border bg-background overflow-hidden">
          <Flow
            nodes={highlightDepthNodes}
            edges={highlightDepthEdges}
            renderNode={(n) => <HighlightDepthNodeBody id={n.id} />}
          >
            <Background variant="dots" gap={30} />
          </Flow>
        </div>
      </div>
    </HighlightDepthContext.Provider>
  )
}

/**
 * Flow Animation demo — rAF-driven reactive `stroke-dashoffset` on a
 * standalone `<path>` element.
 *
 * Pairs with the pie-chart "Animated" demo (#135 Concrete Additions)
 * but exercises a CONTINUOUS rAF loop (the dashoffset keeps decreasing
 * every frame for the duration of the toggle) instead of a one-shot
 * easing. Toggling off stops the loop via `cancelAnimationFrame` in
 * `onCleanup`, leaving the dashoffset at its last value.
 */
const FLOW_PATH = 'M 40 60 C 140 60 160 120 280 120 S 380 60 480 60'

export function XyflowFlowAnimateDemo() {
  const [animating, setAnimating] = createSignal(false)
  const [offset, setOffset] = createSignal(0)

  createEffect(() => {
    if (!animating()) return
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = now - last
      last = now
      setOffset((prev: number) => (prev - dt * 0.04) % 16)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    onCleanup(() => cancelAnimationFrame(frame))
  })

  return (
    <div className="w-full space-y-3" data-flow-animate>
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-flow-animate-toggle
          className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-medium h-8 px-3 hover:bg-primary/90"
          onClick={() => setAnimating(!animating())}
        >
          {animating() ? 'Stop' : 'Animate flow'}
        </button>
        <span className="text-xs text-muted-foreground">
          stroke-dashoffset is driven by requestAnimationFrame
        </span>
      </div>
      <div className="w-full h-[180px] rounded-lg border bg-background overflow-hidden">
        <svg viewBox="0 0 520 180" style="width:100%;height:100%;display:block">
          <path
            d={FLOW_PATH}
            fill="none"
            stroke="var(--primary)"
            stroke-width="3"
            stroke-dasharray="8 8"
            stroke-dashoffset={String(offset())}
            stroke-linecap="round"
            data-flow-path
          />
          <circle cx="40" cy="60" r="6" fill="var(--primary)" />
          <circle cx="480" cy="60" r="6" fill="var(--primary)" />
        </svg>
      </div>
    </div>
  )
}
