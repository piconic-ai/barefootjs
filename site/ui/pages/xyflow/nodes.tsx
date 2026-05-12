/**
 * xyflow Nodes Page
 *
 * Standalone deep dive on nodes — the shape, the default body, custom
 * bodies via `nodeTypes`, and per-node `<Handle>` placement.
 */

import { XyflowNodesDemo } from '@/components/xyflow-intro-demo'
import {
  XyflowCustomBodyDemo,
  XyflowCustomHandlesDemo,
  XyflowHighlightDepthDemo,
} from '@/components/xyflow-demo'
import {
  PageHeader,
  Section,
  Example,
  CodeBlock,
  type TocItem,
} from '../../components/shared/docs'
import { getXyflowNavLinks } from '../../components/shared/PageNavigation'
import { TableOfContents } from '@/components/table-of-contents'

const tocItems: TocItem[] = [
  { id: 'shape', title: 'Node Shape' },
  { id: 'default-body', title: 'Default Body' },
  { id: 'custom-bodies', title: 'Custom Bodies' },
  { id: 'custom-handles', title: 'Custom Handles' },
  { id: 'highlight-depth', title: 'Highlight Depth' },
]

const nodeShapeCode = `// A node is a plain object: id, position, data.
const nodes = [
  { id: "a", position: { x: 80, y: 30 }, data: { label: "Hello" } },
  // Optional fields:
  // - type      : key into the \`nodeTypes\` map (custom rendering)
  // - selected  : initial selection state
  // - draggable : disable per-node drag
]`

const defaultBodyCode = `import { Flow, Background } from "@/components/ui/xyflow"

const nodes = [
  { id: "a", position: { x: 80, y: 30 },   data: { label: "Hello" } },
  { id: "b", position: { x: 280, y: 150 }, data: { label: "World" } },
]

export function MyFlow() {
  return (
    <div className="w-full h-[240px] rounded-lg border bg-background overflow-hidden">
      <Flow nodes={nodes} edges={[]}>
        <Background variant="dots" gap={30} />
      </Flow>
    </div>
  )
}`

const customNodeCode = `"use client"

import { Background, Flow, Handle } from "@/components/ui/xyflow"
import { Position } from "@barefootjs/xyflow"

// Per-id colour palette so each node looks distinct from the others
// and from Flow's default body. Flow strips the default card styling
// (padding / border / background) automatically when \`renderNode\` is
// provided so the body below paints the entire node visual.
const tone = {
  src: "bg-emerald-500 text-white border-emerald-600",
  mid: "bg-amber-500   text-white border-amber-600",
  dst: "bg-sky-500     text-white border-sky-600",
}

const nodes = [
  { id: "src", position: { x:  80, y: 100 }, data: { label: "Source" } },
  { id: "mid", position: { x: 320, y:  80 }, data: { label: "Pipeline" } },
  { id: "dst", position: { x: 560, y: 120 }, data: { label: "Sink" } },
]
const edges = [
  { id: "src-mid", source: "src", target: "mid" },
  { id: "mid-dst", source: "mid", target: "dst" },
]

export function MyFlow() {
  return (
    <Flow
      nodes={nodes}
      edges={edges}
      renderNode={(n) => (
        <div className={\`rounded-full border-2 px-5 py-2 text-sm font-semibold shadow-md \${tone[n.id]}\`}>
          <Handle type="target" position={Position.Left}  nodeId={n.id} />
          {n.data.label}
          <Handle type="source" position={Position.Right} nodeId={n.id} />
        </div>
      )}
    >
      <Background variant="dots" gap={30} />
    </Flow>
  )
}`

const customHandlesCode = `// Multiple handles per node — give each one a stable \`id\`
// and reference it from the edge's \`sourceHandle\` / \`targetHandle\`.
const nodes = [
  { id: "fan", position: { x:  80, y: 120 }, data: { label: "Router" } },
  { id: "a",   position: { x: 360, y:  30 }, data: { label: "A" } },
  { id: "b",   position: { x: 360, y: 140 }, data: { label: "B" } },
  { id: "c",   position: { x: 360, y: 240 }, data: { label: "C" } },
]
const edges = [
  { id: "fan-a", source: "fan", sourceHandle: "top",    target: "a" },
  { id: "fan-b", source: "fan", sourceHandle: "right",  target: "b" },
  { id: "fan-c", source: "fan", sourceHandle: "bottom", target: "c" },
]

<Flow
  nodes={nodes}
  edges={edges}
  renderNode={(n) =>
    n.id === "fan" ? (
      <div className="rounded-full border-2 border-violet-600 bg-violet-500 text-white px-5 py-2 text-sm font-semibold shadow-md">
        <Handle type="source" position={Position.Top}    nodeId={n.id} id="top"    />
        <Handle type="source" position={Position.Right}  nodeId={n.id} id="right"  />
        <Handle type="source" position={Position.Bottom} nodeId={n.id} id="bottom" />
        {n.data.label}
      </div>
    ) : (
      <div className="rounded-full border-2 border-slate-400 bg-white text-slate-800 px-4 py-1.5 text-sm font-medium shadow-sm">
        <Handle type="target" position={Position.Left} nodeId={n.id} />
        {n.data.label}
      </div>
    )
  }
>
  <Background variant="dots" gap={30} />
</Flow>`

const highlightDepthCode = `"use client"

import { createSignal } from "@barefootjs/client"
import { Flow, Handle, Background } from "@/components/ui/xyflow"
import { Position } from "@barefootjs/xyflow"

const [depth, setDepth] = createSignal(2)

const nodes = [
  { id: "root", position: { x:  80, y: 130 }, data: { label: "Root",   depth: 0 } },
  { id: "l1",   position: { x: 280, y:  60 }, data: { label: "Tier 1", depth: 1 } },
  // ...
]

function HighlightDepthNode({ id }) {
  const node = nodes.find((n) => n.id === id)
  const nodeDepth = node.data.depth
  const intensity = () =>
    depth() >= nodeDepth
      ? Math.max(0, 1 - (depth() - nodeDepth) * 0.25).toFixed(2)
      : "0"
  return (
    <div
      style={{
        "--node-glow": intensity(),
        opacity: "calc(0.3 + 0.7 * var(--node-glow))",
        boxShadow: "0 0 calc(12px * var(--node-glow)) currentColor",
      }}
    >
      <Handle type="target" position={Position.Left}  nodeId={id} />
      {node.data.label}
      <Handle type="source" position={Position.Right} nodeId={id} />
    </div>
  )
}

<input type="range" min="0" max="4"
       value={String(depth())}
       onInput={(e) => setDepth(Number(e.target.value))} />
<Flow nodes={nodes} edges={edges}
      renderNode={(n) => <HighlightDepthNode id={n.id} />}>
  <Background variant="dots" gap={30} />
</Flow>`

export function XyflowNodesPage() {
  return (
    <div className="flex gap-10">
      <div className="flex-1 min-w-0 space-y-12">
        <PageHeader
          title="Nodes"
          description="The node shape, the default rendering, and how to swap in your own body or handles."
          {...getXyflowNavLinks('nodes')}
        />

        <Section id="shape" title="Node Shape">
          <div className="prose prose-invert max-w-none">
            <p className="text-muted-foreground">
              A node is a plain JavaScript object that lives in the{' '}
              <code className="text-foreground">nodes</code> prop. It needs a unique{' '}
              <code className="text-foreground">id</code>, a{' '}
              <code className="text-foreground">position</code> in flow coordinates, and a{' '}
              <code className="text-foreground">data</code> bag of whatever payload your renderer wants — a
              label, a status, a row from your database. Everything else (selected, dragging, measured size,
              absolute position) is computed by the store.
            </p>
          </div>
          <CodeBlock code={nodeShapeCode} />
        </Section>

        <Section id="default-body" title="Default Body">
          <div className="prose prose-invert max-w-none">
            <p className="text-muted-foreground">
              Pass nodes to <code className="text-foreground">{'<Flow>'}</code> with no{' '}
              <code className="text-foreground">nodeTypes</code> map and Flow renders each node's{' '}
              <code className="text-foreground">data.label</code> inside the built-in card —
              a target handle on top, a source handle on the bottom, themed border / fill via the
              design tokens.
            </p>
          </div>

          <Example title="Two default nodes" code={defaultBodyCode}>
            <XyflowNodesDemo />
          </Example>
        </Section>

        <Section id="custom-bodies" title="Custom Bodies">
          <div className="prose prose-invert max-w-none">
            <p className="text-muted-foreground">
              To customise the body — colour, layout, an icon, an inline status — pass a{' '}
              <code className="text-foreground">renderNode</code> callback to{' '}
              <code className="text-foreground">{'<Flow>'}</code>. Flow calls it once per node and forwards
              the live <code className="text-foreground">id</code> /{' '}
              <code className="text-foreground">data</code> /{' '}
              <code className="text-foreground">selected</code> as props.
            </p>
          </div>

          <Example title="Source / Pipeline / Sink" code={customNodeCode}>
            <XyflowCustomBodyDemo />
          </Example>
        </Section>

        <Section id="custom-handles" title="Custom Handles">
          <div className="prose prose-invert max-w-none">
            <p className="text-muted-foreground">
              The default node has one target handle on top and one source handle on the bottom. For richer
              graphs you can mount as many{' '}
              <code className="text-foreground">{'<Handle>'}</code> elements as you need, each with its own{' '}
              <code className="text-foreground">position</code> and an{' '}
              <code className="text-foreground">id</code> so edges can pin to a specific connection point
              via <code className="text-foreground">sourceHandle</code> /{' '}
              <code className="text-foreground">targetHandle</code>.
            </p>
          </div>

          <Example title="Three-way fan-out" code={customHandlesCode}>
            <XyflowCustomHandlesDemo />
          </Example>
        </Section>

        <Section id="highlight-depth" title="Highlight Depth">
          <div className="prose prose-invert max-w-none">
            <p className="text-muted-foreground">
              A slider drives a <code className="text-foreground">depth()</code> signal that's read by
              every node inside <code className="text-foreground">renderNode</code>. Each rendered node
              writes its own inline <code className="text-foreground">style={'{{'}'--node-glow': intensity{'}}'}</code>
              CSS variable so the glow can fade per-node without a chart-level re-render.
            </p>
          </div>

          <Example title="Per-node CSS variable" code={highlightDepthCode}>
            <XyflowHighlightDepthDemo />
          </Example>
        </Section>
      </div>
      <TableOfContents items={tocItems} />
    </div>
  )
}
