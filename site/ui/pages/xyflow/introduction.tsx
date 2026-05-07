/**
 * xyflow Introduction Page
 *
 * Overview / framing only. The deep dives (Nodes, Edges, built-in
 * Components) live in their own pages so this page can stay short and
 * scannable — the user shouldn't have to scroll past every concept to
 * see the Quick Start.
 */

import { GraphEditorDemo } from '@/components/graph-editor-demo'
import { XyflowQuickStartDemo } from '@/components/xyflow-intro-demo'
import {
  PageHeader,
  Section,
  Example,
  PackageManagerTabs,
  type TocItem,
} from '../../components/shared/docs'
import { getXyflowNavLinks } from '../../components/shared/PageNavigation'
import { TableOfContents } from '@/components/table-of-contents'

const tocItems: TocItem[] = [
  { id: 'overview', title: 'Overview' },
  { id: 'simple-example', title: 'Simple Example' },
  { id: 'when-to-reach-for-xyflow', title: 'When to Reach for @barefootjs/xyflow' },
  { id: 'installation', title: 'Installation' },
  { id: 'quick-start', title: 'Quick Start' },
  { id: 'next-steps', title: 'Next Steps' },
]

const simpleSvgCode = `"use client"

import { createSignal, createMemo } from '@barefootjs/client'

// Nodes / edges / zoom live in plain signals. SVG attributes bind
// directly: <circle cx={n.x}/> tracks a node's position, edge <path d=
// {edgePath(e)}/> rebuilds whenever any endpoint moves, and the root
// viewBox reacts to zoom. No extra package required.

function GraphEditor() {
  const [nodes, setNodes] = createSignal(INITIAL_NODES)
  const [edges, setEdges] = createSignal(INITIAL_EDGES)
  const [zoom, setZoom] = createSignal(1)

  const viewBox = createMemo(() => {
    const w = 720 / zoom(), h = 400 / zoom()
    return \`\${360 - w / 2} \${200 - h / 2} \${w} \${h}\`
  })

  return (
    <svg viewBox={viewBox()} onPointerMove={onMove} onPointerUp={onUp}>
      <g>
        {edges().map((e) => (
          <path key={e.id} d={edgePath(e)} stroke="#94a3b8" fill="none" />
        ))}
      </g>
      <g>
        {nodes().map((n) => (
          <g key={n.id} data-node-id={n.id} onPointerDown={onNodeDown}>
            <circle cx={n.x} cy={n.y} r={28} />
            <text x={n.x} y={n.y}>{n.label}</text>
          </g>
        ))}
      </g>
    </svg>
  )
}`

const quickStartCode = `"use client"

import {
  Flow,
  Background,
  Controls,
} from "@/components/ui/xyflow"

const nodes = [
  { id: "a", position: { x: 80,  y: 30 },  data: { label: "Hello" } },
  { id: "b", position: { x: 320, y: 180 }, data: { label: "World" } },
]
const edges = [
  { id: "a-b", source: "a", target: "b" },
]

export function MyFlow() {
  return (
    <div className="w-full h-[420px] rounded-lg border bg-background overflow-hidden">
      <Flow nodes={nodes} edges={edges}>
        <Background variant="dots" gap={30} />
        <Controls />
      </Flow>
    </div>
  )
}`

export function XyflowIntroductionPage() {
  return (
    <div className="flex gap-10">
      <div className="flex-1 min-w-0 space-y-12">
        <PageHeader
          title="Introduction"
          description="Node graphs in BarefootJS — start with createSignal + SVG for small canvases, reach for @barefootjs/xyflow once you need pan / zoom / drag-to-connect / minimap and friends."
          {...getXyflowNavLinks('introduction')}
        />

        {/* Overview */}
        <Section id="overview" title="Overview">
          <div className="prose prose-invert max-w-none">
            <p className="text-muted-foreground">
              BarefootJS lets you bind signals directly to SVG attributes — <code className="text-foreground">cx</code>,{' '}
              <code className="text-foreground">cy</code>, <code className="text-foreground">d</code>, and{' '}
              <code className="text-foreground">viewBox</code> all update granularly when their underlying
              signals change. That alone is enough to build a small interactive canvas.{' '}
              <code className="text-foreground">@barefootjs/xyflow</code> wraps{' '}
              <code className="text-foreground">@xyflow/system</code> (the engine behind React Flow / Svelte
              Flow) with a signal-friendly store and a JSX-native renderer for everything bigger.
            </p>
          </div>
        </Section>

        {/* Simple Example */}
        <Section id="simple-example" title="Simple Example">
          <div className="prose prose-invert max-w-none">
            <p className="text-muted-foreground">
              For a small canvas, plain signals plus SVG attribute bindings go a long way. The demo below
              keeps nodes / edges / zoom in <code className="text-foreground">createSignal</code>, recomputes
              the edge <code className="text-foreground">d</code> path whenever an endpoint moves, and
              reactively rewrites the root <code className="text-foreground">viewBox</code>. No extra
              dependencies.
            </p>
          </div>

          <Example title="SVG canvas with createSignal" code={simpleSvgCode}>
            <GraphEditorDemo />
          </Example>
        </Section>

        {/* When to Reach for @barefootjs/xyflow */}
        <Section id="when-to-reach-for-xyflow" title="When to Reach for @barefootjs/xyflow">
          <div className="prose prose-invert max-w-none">
            <p className="text-muted-foreground">
              The signal-bound SVG approach stays pleasant up until you start needing the things every real
              node-graph editor ends up needing:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 mt-2">
              <li>Pointer-paced pan and zoom (with momentum, bounds, and pinch support)</li>
              <li>Drag-to-connect handles with snapping and connection validation</li>
              <li>Fit-view, zoom-to-node, and a coordinate transform shared across overlays</li>
              <li>Selection rectangles, multi-select, and keyboard nudging</li>
              <li>Custom HTML node bodies that participate in edge routing and resizing</li>
            </ul>
            <p className="text-muted-foreground mt-2">
              At that point, <code className="text-foreground">@barefootjs/xyflow</code> packages all of it
              behind a small JSX-native API.
            </p>
          </div>
        </Section>

        {/* Installation */}
        <Section id="installation" title="Installation">
          <div className="prose prose-invert max-w-none">
            <p className="text-muted-foreground">
              The renderer components ship via the shadcn-style registry. The utility helpers (signal hooks,
              store, types, geometry helpers) live in <code className="text-foreground">@barefootjs/xyflow</code>{' '}
              and are pulled in by the registry install.
            </p>
          </div>

          <PackageManagerTabs command="barefoot add xyflow" />
        </Section>

        {/* Quick Start */}
        <Section id="quick-start" title="Quick Start">
          <div className="prose prose-invert max-w-none">
            <p className="text-muted-foreground">
              Two draggable nodes connected by an edge, on a dotted background with zoom controls. The
              surrounding <code className="text-foreground">{'<div>'}</code>{' '}
              <strong>must have explicit width and height</strong> — Flow measures its container to size the
              canvas, so a zero-sized parent renders nothing.
            </p>
          </div>

          <Example title="" code={quickStartCode}>
            <XyflowQuickStartDemo />
          </Example>
        </Section>

        {/* Next Steps */}
        <Section id="next-steps" title="Next Steps">
          <ul className="list-disc list-inside text-muted-foreground space-y-1">
            <li>
              <a href="/xyflow/nodes" className="text-foreground underline underline-offset-4">
                Nodes
              </a>{' '}
              — the node shape, custom node bodies, and per-node connection handles.
            </li>
            <li>
              <a href="/xyflow/edges" className="text-foreground underline underline-offset-4">
                Edges
              </a>{' '}
              — the edge shape, path variants, animated strokes, markers, and custom edge components.
            </li>
            <li>
              <a href="/xyflow/components" className="text-foreground underline underline-offset-4">
                Components
              </a>{' '}
              — every built-in piece (<code className="text-foreground">Flow</code>,{' '}
              <code className="text-foreground">Background</code>,{' '}
              <code className="text-foreground">Controls</code>,{' '}
              <code className="text-foreground">MiniMap</code>,{' '}
              <code className="text-foreground">Handle</code>,{' '}
              <code className="text-foreground">NodeWrapper</code>,{' '}
              <code className="text-foreground">SimpleEdge</code>) with prop tables.
            </li>
            <li>
              <a href="https://reactflow.dev/learn" className="text-foreground underline underline-offset-4">
                xyflow / react getting started
              </a>{' '}
              — the upstream tutorial this section is modelled on; the engine concepts (handles,
              connections, viewport) carry over directly.
            </li>
          </ul>
        </Section>
      </div>
      <TableOfContents items={tocItems} />
    </div>
  )
}
