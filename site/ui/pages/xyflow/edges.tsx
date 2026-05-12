/**
 * xyflow Edges Page
 *
 * Standalone deep dive on edges — the shape, default routing, the path
 * variants `<SimpleEdge>` understands, and the `animated` flag.
 */

import { XyflowEdgesDemo } from '@/components/xyflow-intro-demo'
import {
  XyflowEdgeVariantsDemo,
  XyflowAnimatedEdgesDemo,
  XyflowFlowAnimateDemo,
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
  { id: 'shape', title: 'Edge Shape' },
  { id: 'default-routing', title: 'Default Routing' },
  { id: 'variants', title: 'Edge Variants' },
  { id: 'animated', title: 'Animated Edges' },
  { id: 'flow-animate', title: 'rAF Flow Animation' },
]

const edgeShapeCode = `// An edge is a plain object connecting two node ids.
const edges = [
  { id: "a-b", source: "a", target: "b" },
  // Optional fields:
  // - type        : 'default' | 'bezier' | 'straight' | 'smoothstep' | 'step'
  // - animated    : true → renders a moving dashed stroke
  // - sourceHandle / targetHandle : pin to a specific handle id
  // - selected    : initial selection state
  // - data        : arbitrary payload for forward compatibility
]`

const defaultRoutingCode = `import { Flow, Background } from "@/components/ui/xyflow"

const nodes = [
  { id: "a", position: { x: 80, y: 30 },   data: { label: "Hello" } },
  { id: "b", position: { x: 280, y: 150 }, data: { label: "World" } },
]
const edges = [
  { id: "a-b", source: "a", target: "b" },
]

export function MyFlow() {
  return (
    <div className="w-full h-[240px] rounded-lg border bg-background overflow-hidden">
      <Flow nodes={nodes} edges={edges}>
        <Background variant="dots" gap={30} />
      </Flow>
    </div>
  )
}`

const edgeVariantsCode = `// Each edge picks its path algorithm from \`type\`.
const edges = [
  { id: "e1", source: "l1", target: "r1" },                       // default (bezier)
  { id: "e2", source: "l2", target: "r2", type: "bezier"     },
  { id: "e3", source: "l3", target: "r3", type: "smoothstep" },
  { id: "e4", source: "l4", target: "r4", type: "straight"   },
]`

const animatedEdgesCode = `// Toggle the moving-dash animation per edge.
const edges = [
  { id: "a-b", source: "a", target: "b", animated: true },
  { id: "b-c", source: "b", target: "c", animated: true },
]

<Flow nodes={nodes} edges={edges}>
  <Background variant="dots" gap={30} />
</Flow>`

const flowAnimateCode = `"use client"

import { createSignal, createEffect, onCleanup } from "@barefootjs/client"

export function XyflowFlowAnimateDemo() {
  const [animating, setAnimating] = createSignal(false)
  const [offset, setOffset]       = createSignal(0)

  createEffect(() => {
    if (!animating()) return
    let frame = 0
    let last  = performance.now()
    const tick = (now) => {
      const dt = now - last
      last = now
      setOffset((prev) => (prev - dt * 0.04) % 16)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    onCleanup(() => cancelAnimationFrame(frame))
  })

  return (
    <div>
      <button onClick={() => setAnimating(!animating())}>
        {animating() ? "Stop" : "Animate flow"}
      </button>
      <svg viewBox="0 0 520 180">
        <path
          d="M 40 60 C 140 60 160 120 280 120 S 380 60 480 60"
          fill="none"
          stroke="currentColor"
          stroke-width="3"
          stroke-dasharray="8 8"
          stroke-dashoffset={String(offset())}
        />
      </svg>
    </div>
  )
}`

export function XyflowEdgesPage() {
  return (
    <div className="flex gap-10">
      <div className="flex-1 min-w-0 space-y-12">
        <PageHeader
          title="Edges"
          description="The edge shape, the path-type variants the built-in renderer understands, and the animated flag."
          {...getXyflowNavLinks('edges')}
        />

        <Section id="shape" title="Edge Shape">
          <div className="prose prose-invert max-w-none">
            <p className="text-muted-foreground">
              An edge connects two nodes by their ids. The minimal shape is{' '}
              <code className="text-foreground">{'{ id, source, target }'}</code>; everything else —
              the curve type, animation, handle pinning — is opt-in. Flow looks up{' '}
              <code className="text-foreground">source</code> /{' '}
              <code className="text-foreground">target</code> in the node lookup, finds the matching
              handles, and draws a path between them.
            </p>
          </div>
          <CodeBlock code={edgeShapeCode} />
        </Section>

        <Section id="default-routing" title="Default Routing">
          <div className="prose prose-invert max-w-none">
            <p className="text-muted-foreground">
              With no <code className="text-foreground">type</code> set, an edge renders as a Bezier curve
              from the source node's bottom handle to the target node's top handle.
            </p>
          </div>
          <Example title="A single edge" code={defaultRoutingCode}>
            <XyflowEdgesDemo />
          </Example>
        </Section>

        <Section id="variants" title="Edge Variants">
          <div className="prose prose-invert max-w-none">
            <p className="text-muted-foreground">
              The built-in <code className="text-foreground">{'<SimpleEdge>'}</code> picks a path
              algorithm from the edge's <code className="text-foreground">type</code> string —{' '}
              <code className="text-foreground">"default"</code> /{' '}
              <code className="text-foreground">"bezier"</code> (curve),{' '}
              <code className="text-foreground">"straight"</code> (line),{' '}
              <code className="text-foreground">"smoothstep"</code> /{' '}
              <code className="text-foreground">"step"</code> (right-angle).
            </p>
          </div>

          <Example title="Four path types side-by-side" code={edgeVariantsCode}>
            <XyflowEdgeVariantsDemo />
          </Example>
        </Section>

        <Section id="animated" title="Animated Edges">
          <div className="prose prose-invert max-w-none">
            <p className="text-muted-foreground">
              Set <code className="text-foreground">animated: true</code> on an edge and{' '}
              <code className="text-foreground">{'<SimpleEdge>'}</code> appends the{' '}
              <code className="text-foreground">bf-flow__edge--animated</code> class — a stroke-dasharray
              keyframe animation that gives a sense of direction or activity. The flag is independent of{' '}
              <code className="text-foreground">type</code>, so it composes with any of the path variants.
            </p>
          </div>

          <Example title="Animated stroke" code={animatedEdgesCode}>
            <XyflowAnimatedEdgesDemo />
          </Example>
        </Section>

        <Section id="flow-animate" title="rAF Flow Animation">
          <div className="prose prose-invert max-w-none">
            <p className="text-muted-foreground">
              The CSS keyframe animation above happens entirely inside the browser. When you need the
              path direction or speed to be reactive — to track a signal — drive the
              {' '}<code className="text-foreground">stroke-dashoffset</code> attribute from a
              {' '}<code className="text-foreground">requestAnimationFrame</code> loop owned by a
              {' '}<code className="text-foreground">createEffect</code>. Toggling the effect off
              calls <code className="text-foreground">cancelAnimationFrame</code> in{' '}
              <code className="text-foreground">onCleanup</code>, so the loop never leaks past unmount.
            </p>
          </div>

          <Example title="rAF-driven dashoffset" code={flowAnimateCode}>
            <XyflowFlowAnimateDemo />
          </Example>
        </Section>
      </div>
      <TableOfContents items={tocItems} />
    </div>
  )
}
