/**
 * xyflow Nodes Page
 *
 * Standalone deep dive on nodes — the shape, the default body, custom
 * bodies via `nodeTypes`, and per-node `<Handle>` placement.
 */

import { XyflowNodesDemo } from '@/components/xyflow-intro-demo'
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

import { Flow, Handle } from "@/components/ui/xyflow"
import { Position } from "@barefootjs/xyflow"

// A custom node is a regular function component. The store passes
// per-node props (id, data, selected, ...) through the nodeTypes map.
function PillNode(props) {
  return (
    <div className="rounded-full border-2 bg-card px-4 py-2 text-sm font-medium shadow-sm">
      <Handle type="target" position={Position.Top} nodeId={props.id} />
      {props.data.label}
      <Handle type="source" position={Position.Bottom} nodeId={props.id} />
    </div>
  )
}

const nodeTypes = { pill: PillNode }

const nodes = [
  { id: "a", type: "pill", position: { x: 80, y: 30 },  data: { label: "Hello" } },
  { id: "b", type: "pill", position: { x: 320, y: 180 }, data: { label: "World" } },
]

<Flow nodes={nodes} edges={edges} nodeTypes={nodeTypes}>
  <Background />
</Flow>`

const customHandlesCode = `// Multiple handles per node — give each one a stable \`id\`
// and reference it from the edge's \`sourceHandle\` / \`targetHandle\`.
function SplitNode(props) {
  return (
    <div className="...">
      <Handle type="target" position={Position.Top}    nodeId={props.id} />
      {props.data.label}
      <Handle type="source" position={Position.Bottom} nodeId={props.id} id="ok"   />
      <Handle type="source" position={Position.Right}  nodeId={props.id} id="warn" />
    </div>
  )
}

const edges = [
  { id: "a-b-ok",   source: "a", sourceHandle: "ok",   target: "b" },
  { id: "a-c-warn", source: "a", sourceHandle: "warn", target: "c" },
]`

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
              To customise the body — colour, layout, an icon, an inline status — give the node a{' '}
              <code className="text-foreground">type</code> and pass a matching component through the{' '}
              <code className="text-foreground">nodeTypes</code> map. Flow mounts your component once per
              node and forwards the live{' '}
              <code className="text-foreground">id</code> / <code className="text-foreground">data</code> /{' '}
              <code className="text-foreground">selected</code> as props.
            </p>
          </div>
          <CodeBlock code={customNodeCode} />
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
          <CodeBlock code={customHandlesCode} />
        </Section>
      </div>
      <TableOfContents items={tocItems} />
    </div>
  )
}
