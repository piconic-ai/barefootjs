/**
 * xyflow Edges Page
 *
 * Standalone deep dive on edges — the shape, default routing, the path
 * variants `<SimpleEdge>` understands, and how custom edge components
 * with labels plug in.
 */

import { XyflowEdgesDemo } from '@/components/xyflow-intro-demo'
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
  { id: 'custom-edges', title: 'Custom Edges and Labels' },
]

const edgeShapeCode = `// An edge is a plain object connecting two node ids.
const edges = [
  { id: "a-b", source: "a", target: "b" },
  // Optional fields:
  // - type        : 'default' | 'bezier' | 'straight' | 'smoothstep' | 'step'
  //                 or a key into the \`edgeTypes\` map for custom edges
  // - animated    : true → renders a moving dashed stroke
  // - markerStart : 'arrow' | 'arrowclosed' to draw an arrow at the start
  // - markerEnd   : same for the end (default is 'arrow' on directed flows)
  // - sourceHandle / targetHandle : pin to a specific handle id
  // - selected    : initial selection state
  // - data        : arbitrary payload your custom edge component can read
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

const edgeVariantsCode = `const edges = [
  { id: "a-b", source: "a", target: "b", type: "smoothstep" },
  { id: "b-c", source: "b", target: "c", type: "straight", animated: true },
  { id: "c-d", source: "c", target: "d", markerEnd: "arrowclosed" },
]`

const customEdgeCode = `// Custom edges receive an \`svgGroup\` slot to render label / decorations
// into. Keep the path stroke on a sibling SVG <path>.
import { getEdgePath, computeEdgePosition } from "@barefootjs/xyflow"

function ApprovalEdge(props) {
  // \`props\` includes id, source, target, sourceX/Y, targetX/Y,
  // sourcePosition, targetPosition, data, selected, animated, label,
  // and svgGroup (an SVGGElement to mount custom content into).
  // Render a path + foreignObject label inside svgGroup imperatively
  // (or hand it to a JSX render helper).
}

const edgeTypes = { approval: ApprovalEdge }

const edges = [
  { id: "a-b", source: "a", target: "b", type: "approval", label: "OK" },
]

<Flow nodes={nodes} edges={edges} edgeTypes={edgeTypes} />`

export function XyflowEdgesPage() {
  return (
    <div className="flex gap-10">
      <div className="flex-1 min-w-0 space-y-12">
        <PageHeader
          title="Edges"
          description="The edge shape, the path-type variants the built-in renderer understands, and how to plug in custom edges with labels."
          {...getXyflowNavLinks('edges')}
        />

        <Section id="shape" title="Edge Shape">
          <div className="prose prose-invert max-w-none">
            <p className="text-muted-foreground">
              An edge connects two nodes by their ids. The minimal shape is{' '}
              <code className="text-foreground">{'{ id, source, target }'}</code>; everything else —
              the curve type, animation, arrow markers, labels — is opt-in. Flow looks up{' '}
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
              <code className="text-foreground">"step"</code> (right-angle). Animated edges add a moving
              dashed stroke; markers attach an arrow at either end.
            </p>
          </div>
          <CodeBlock code={edgeVariantsCode} />
        </Section>

        <Section id="custom-edges" title="Custom Edges and Labels">
          <div className="prose prose-invert max-w-none">
            <p className="text-muted-foreground">
              For edge labels, decorations, or interactive controls along the path, register a custom
              edge component through the <code className="text-foreground">edgeTypes</code> map. Each
              custom edge receives the resolved geometry plus an{' '}
              <code className="text-foreground">svgGroup</code> slot it can render label foreignObjects
              and toolbars into. The <code className="text-foreground">label</code> field on the edge
              data is forwarded to your component as a prop.
            </p>
          </div>
          <CodeBlock code={customEdgeCode} />
        </Section>
      </div>
      <TableOfContents items={tocItems} />
    </div>
  )
}
