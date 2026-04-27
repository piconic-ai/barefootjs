/**
 * Graph Editor Reference Page (/components/graph-editor)
 *
 * Block-level composition pattern: SVG-based DAG editor with reactive
 * cx/cy/d/viewBox bindings, drag-to-move nodes, drag-to-connect new
 * edges, and an auto-layout toggle. Exercises the compiler's SVG
 * namespace path that no other block touches.
 */

import { GraphEditorDemo } from '@/components/graph-editor-demo'
import {
  DocPage,
  PageHeader,
  Section,
  Example,
  type TocItem,
} from '../../components/shared/docs'
import { getNavLinks } from '../../components/shared/PageNavigation'

const tocItems: TocItem[] = [
  { id: 'preview', title: 'Preview' },
  { id: 'features', title: 'Features' },
]

const previewCode = `"use client"

import { createSignal, createMemo } from '@barefootjs/client'

// Nodes and edges live in plain signals. The SVG view mirrors them
// directly: <circle cx={n.x}/> binds to a node's position, <path d=
// {edgePath(e)}/> rebuilds whenever any node moves, and the root
// <svg viewBox={viewBox()}/> reacts to zoom changes. Every other
// block uses HTML elements only — this is the first block to drive
// the compiler's SVG namespace path with reactive updates.

function GraphEditor() {
  const [nodes, setNodes] = createSignal<GraphNode[]>(INITIAL_NODES)
  const [edges, setEdges] = createSignal<GraphEdge[]>(INITIAL_EDGES)
  const [zoom, setZoom] = createSignal(1)

  const viewBox = createMemo(() => {
    const w = 720 / zoom(), h = 400 / zoom()
    return \`\${360 - w / 2} \${200 - h / 2} \${w} \${h}\`
  })

  function edgePath(e: GraphEdge): string {
    const map = nodeIndex()
    const s = map[e.source], t = map[e.target]
    return bezierPath(s.x, s.y, t.x, t.y)
  }

  return (
    <svg viewBox={viewBox()} onPointerMove={onMove} onPointerUp={onUp}>
      {/* Edges: d rebuilds on any node move — mapArray over signal-derived list. */}
      <g>
        {edges().map(e => (
          <path key={e.id} d={edgePath(e)} stroke="#94a3b8" fill="none"/>
        ))}
      </g>

      {/* Nodes: cx/cy on <circle>, x/y on <text>, plus a connect handle.
          Nested SVG children inside a single .map() body. */}
      <g>
        {nodes().map(n => (
          <g key={n.id} data-node-id={n.id} onPointerDown={onNodeDown}>
            <circle cx={n.x} cy={n.y} r={28} fill={KIND_FILL[n.kind]}/>
            <text x={n.x} y={n.y}>{n.label}</text>
            <circle cx={n.x + 28} cy={n.y} r={5} onPointerDown={onHandleDown}/>
          </g>
        ))}
      </g>
    </svg>
  )
}`

export function GraphEditorRefPage() {
  return (
    <DocPage slug="graph-editor" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Graph / DAG Editor"
          description="SVG-based node graph with reactive cx/cy/d/viewBox bindings, drag-to-move, drag-to-connect, and auto-layout toggle. Exercises the compiler's SVG namespace path that other blocks don't touch."
          {...getNavLinks('graph-editor')}
        />

        <Section id="preview" title="Preview">
          <Example title="" code={previewCode}>
            <GraphEditorDemo />
          </Example>
        </Section>

        <Section id="features" title="Features">
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-medium text-foreground mb-2">SVG Namespace Attribute Bindings</h3>
              <p className="text-sm text-muted-foreground">
                Every other block in the gallery uses HTML elements only.
                This block is the first to bind signals to SVG attributes:
                <code className="mx-1 text-xs">cx</code> and
                <code className="mx-1 text-xs">cy</code> on
                <code className="mx-1 text-xs">&lt;circle&gt;</code>,
                <code className="mx-1 text-xs">d</code> on
                <code className="mx-1 text-xs">&lt;path&gt;</code>,
                <code className="mx-1 text-xs">x</code> /
                <code className="mx-1 text-xs">y</code> on
                <code className="mx-1 text-xs">&lt;text&gt;</code>, and
                <code className="mx-1 text-xs">viewBox</code> on the root
                <code className="mx-1 text-xs">&lt;svg&gt;</code>. The
                compiler must wire reactive bindings using the SVG
                namespace path so attributes update on the correct
                element.
              </p>
            </div>
            <div>
              <h3 className="text-base font-medium text-foreground mb-2">Reactive `d` Path Rebuild</h3>
              <p className="text-sm text-muted-foreground">
                Each edge&apos;s
                <code className="mx-1 text-xs">d</code> attribute is
                recomputed from both endpoints&apos; current
                <code className="mx-1 text-xs">x</code> /
                <code className="mx-1 text-xs">y</code>. Dragging a node
                triggers <code className="mx-1 text-xs">d</code> rebuilds
                for every edge connected to it, exercising path-string
                reactivity inside a <code className="mx-1 text-xs">mapArray</code>
                loop body.
              </p>
            </div>
            <div>
              <h3 className="text-base font-medium text-foreground mb-2">Reactive viewBox</h3>
              <p className="text-sm text-muted-foreground">
                Zoom buttons rewrite the SVG <code className="mx-1 text-xs">viewBox</code>
                string on every change, exercising attribute updates on
                the root SVG element.
              </p>
            </div>
            <div>
              <h3 className="text-base font-medium text-foreground mb-2">Nested SVG Loops</h3>
              <p className="text-sm text-muted-foreground">
                The nodes loop renders a <code className="mx-1 text-xs">&lt;g&gt;</code>
                wrapper containing a body
                <code className="mx-1 text-xs">&lt;circle&gt;</code>, a
                <code className="mx-1 text-xs">&lt;text&gt;</code> label,
                and a connect <code className="mx-1 text-xs">&lt;circle&gt;</code>
                handle — three SVG children sharing the same loop scope.
                Each one carries reactive attribute bindings.
              </p>
            </div>
            <div>
              <h3 className="text-base font-medium text-foreground mb-2">Drag-to-Connect with Preview Path</h3>
              <p className="text-sm text-muted-foreground">
                Pulling from a node&apos;s handle creates a temporary
                preview <code className="mx-1 text-xs">&lt;path&gt;</code>
                tracking the cursor. The preview lives in a conditional
                branch (rendered only while dragging), exercising
                conditional SVG mounts. Releasing on another node creates
                a real edge.
              </p>
            </div>
            <div>
              <h3 className="text-base font-medium text-foreground mb-2">Auto-Layout Swap</h3>
              <p className="text-sm text-muted-foreground">
                Toggling auto-layout replaces every node&apos;s
                <code className="mx-1 text-xs">x</code> /
                <code className="mx-1 text-xs">y</code> simultaneously
                via topological column placement. Every reactive
                <code className="mx-1 text-xs">cx</code> /
                <code className="mx-1 text-xs">cy</code> /
                <code className="mx-1 text-xs">d</code> binding must
                update on the same microtask without stale frames.
              </p>
            </div>
          </div>
        </Section>
      </div>
    </DocPage>
  )
}
