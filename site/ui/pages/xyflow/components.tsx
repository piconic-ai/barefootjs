/**
 * xyflow Components Page
 *
 * Built-in component reference. Replaces the older `/components/xyflow`
 * page so all xyflow docs live under a single section.
 */

import { XyflowBackgroundVariantsDemo } from '@/components/xyflow-demo'
import {
  PageHeader,
  Section,
  Example,
  PropsTable,
  type PropDefinition,
  type TocItem,
} from '../../components/shared/docs'
import { getXyflowNavLinks } from '../../components/shared/PageNavigation'
import { TableOfContents } from '@/components/table-of-contents'

const tocItems: TocItem[] = [
  { id: 'overview', title: 'Overview' },
  { id: 'flow', title: '<Flow>' },
  { id: 'background', title: '<Background>' },
  { id: 'controls', title: '<Controls>' },
  { id: 'minimap', title: '<MiniMap>' },
  { id: 'handle', title: '<Handle>' },
  { id: 'node-wrapper', title: '<NodeWrapper>' },
  { id: 'simple-edge', title: '<SimpleEdge>' },
]

const backgroundVariantsCode = `import { Flow, Background } from "@/components/ui/xyflow"

export function Variants() {
  return (
    <div className="grid grid-cols-3 gap-4">
      <Flow nodes={[]} edges={[]}>
        <Background variant="dots" gap={20} />
      </Flow>
      <Flow nodes={[]} edges={[]}>
        <Background variant="lines" gap={30} />
      </Flow>
      <Flow nodes={[]} edges={[]}>
        <Background variant="cross" gap={32} />
      </Flow>
    </div>
  )
}`

const flowProps: PropDefinition[] = [
  {
    name: 'nodes',
    type: 'NodeBase[]',
    description: 'Initial node list. Each node needs `id`, `position: { x, y }`, and `data: {…}`.',
  },
  {
    name: 'edges',
    type: 'EdgeBase[]',
    description: 'Initial edge list. Each edge needs `id`, `source`, `target`.',
  },
  {
    name: 'nodeTypes',
    type: 'Record<string, NodeComponent>',
    description: 'Map of `node.type` → custom component for rendering.',
  },
  {
    name: 'edgeTypes',
    type: 'Record<string, EdgeComponent>',
    description: 'Map of `edge.type` → custom component for rendering.',
  },
  {
    name: 'children',
    type: 'Child',
    description: 'Slot for `<Background>` / `<Controls>` / `<MiniMap>` overlays.',
  },
]

const backgroundProps: PropDefinition[] = [
  {
    name: 'variant',
    type: '"dots" | "lines" | "cross"',
    defaultValue: '"dots"',
    description: 'Pattern style.',
  },
  {
    name: 'gap',
    type: 'number',
    defaultValue: '20',
    description: 'Spacing between pattern repeats (in flow coordinates, scales with zoom).',
  },
  {
    name: 'color',
    type: 'string',
    defaultValue: '"var(--border)"',
    description: 'Pattern color. Defaults to the design-system border token so light / dark themes adapt.',
  },
]

const controlsProps: PropDefinition[] = [
  {
    name: 'position',
    type: '"top-left" | "top-right" | "bottom-left" | "bottom-right"',
    defaultValue: '"bottom-left"',
    description: 'Corner the controls float in.',
  },
  {
    name: 'showZoom',
    type: 'boolean',
    defaultValue: 'true',
    description: 'Show zoom-in / zoom-out buttons.',
  },
  {
    name: 'showFitView',
    type: 'boolean',
    defaultValue: 'true',
    description: 'Show fit-view button.',
  },
  {
    name: 'showInteractive',
    type: 'boolean',
    defaultValue: 'true',
    description: 'Show the lock toggle.',
  },
]

const minimapProps: PropDefinition[] = [
  {
    name: 'pannable',
    type: 'boolean',
    defaultValue: 'true',
    description: 'Allow drag-to-pan inside the minimap.',
  },
  {
    name: 'zoomable',
    type: 'boolean',
    defaultValue: 'true',
    description: 'Allow wheel zoom on the minimap.',
  },
  {
    name: 'nodeColor',
    type: 'string | (node) => string',
    defaultValue: '"#e2e8f0"',
    description: 'Per-node fill color in the minimap.',
  },
]

const handleProps: PropDefinition[] = [
  {
    name: 'type',
    type: '"source" | "target"',
    defaultValue: '"source"',
    description: 'Whether this handle starts (`source`) or accepts (`target`) a connection.',
  },
  {
    name: 'position',
    type: 'Position',
    defaultValue: 'Position.Top',
    description: 'Where on the node body the handle sits — `Top`, `Bottom`, `Left`, or `Right`.',
  },
  {
    name: 'nodeId',
    type: 'string',
    description: 'Id of the parent node. Required so the connection layer can resolve handle bounds.',
  },
  {
    name: 'id',
    type: 'string',
    description: 'Optional handle id. Required when a node has more than one handle of the same type so edges can pin via `sourceHandle` / `targetHandle`.',
  },
]

const nodeWrapperProps: PropDefinition[] = [
  {
    name: 'nodeId',
    type: 'string',
    description: 'Stable id of the node inside `store.nodeLookup()`.',
  },
  {
    name: 'children',
    type: 'Child',
    description: 'Slot for the rendered node body.',
  },
  {
    name: 'ref',
    type: '(element: HTMLElement) => void',
    description: 'Optional ref callback for low-level imperative work; rarely needed.',
  },
]

const simpleEdgeProps: PropDefinition[] = [
  {
    name: 'edgeId',
    type: 'string',
    description: 'Stable id of the edge inside `store.edgeLookup()`. Used to read `type`, `selected`, `animated` reactively.',
  },
]

export function XyflowComponentsPage() {
  return (
    <div className="flex gap-10">
      <div className="flex-1 min-w-0 space-y-12">
        <PageHeader
          title="Components"
          description="Built-in components that ship with @barefootjs/xyflow. Drop them inside <Flow> (or compose into custom nodes / edges)."
          {...getXyflowNavLinks('components')}
        />

        <Section id="overview" title="Overview">
          <div className="prose prose-invert max-w-none">
            <p className="text-muted-foreground">
              <code className="text-foreground">@barefootjs/xyflow</code> ships seven JSX-native
              components. Most pages only need <code className="text-foreground">{'<Flow>'}</code> with
              a <code className="text-foreground">{'<Background>'}</code> and{' '}
              <code className="text-foreground">{'<Controls>'}</code>; the rest opt in for richer flows
              (minimap, custom nodes, custom edges).
            </p>
          </div>
        </Section>

        <Section id="flow" title="<Flow>">
          <div className="prose prose-invert max-w-none">
            <p className="text-muted-foreground">
              The top-level container. Owns the store, the viewport transform, pan / zoom / drag
              subsystems, and the per-node measurement loop. Accepts{' '}
              <code className="text-foreground">nodes</code>, <code className="text-foreground">edges</code>,
              optional <code className="text-foreground">nodeTypes</code> /{' '}
              <code className="text-foreground">edgeTypes</code> maps, and any of the overlays below as
              children.
            </p>
          </div>
          <PropsTable props={flowProps} />
        </Section>

        <Section id="background" title="<Background>">
          <div className="prose prose-invert max-w-none">
            <p className="text-muted-foreground">
              Pattern background that scales and pans with the viewport. Three variants —{' '}
              <code className="text-foreground">"dots"</code>,{' '}
              <code className="text-foreground">"lines"</code>,{' '}
              <code className="text-foreground">"cross"</code> — plus{' '}
              <code className="text-foreground">gap</code> / <code className="text-foreground">color</code>{' '}
              tuning. The default <code className="text-foreground">color</code> resolves to{' '}
              <code className="text-foreground">var(--border)</code> so the pattern stays subtle in both
              light and dark themes.
            </p>
          </div>

          <Example title="Variants" code={backgroundVariantsCode}>
            <XyflowBackgroundVariantsDemo />
          </Example>

          <PropsTable props={backgroundProps} />
        </Section>

        <Section id="controls" title="<Controls>">
          <div className="prose prose-invert max-w-none">
            <p className="text-muted-foreground">
              Zoom-in / zoom-out / fit-view / lock buttons. Each button is opt-out via the{' '}
              <code className="text-foreground">show*</code> props; corner placement via{' '}
              <code className="text-foreground">position</code>.
            </p>
          </div>
          <PropsTable props={controlsProps} />
        </Section>

        <Section id="minimap" title="<MiniMap>">
          <div className="prose prose-invert max-w-none">
            <p className="text-muted-foreground">
              Overview map with a synced viewport rectangle. Pannable and zoomable by default; per-node
              colours via the <code className="text-foreground">nodeColor</code> prop (string or function).
            </p>
          </div>
          <PropsTable props={minimapProps} />
        </Section>

        <Section id="handle" title="<Handle>">
          <div className="prose prose-invert max-w-none">
            <p className="text-muted-foreground">
              Per-node connection point. Render inside a custom node body with a{' '}
              <code className="text-foreground">type</code> (
              <code className="text-foreground">"source"</code> | <code className="text-foreground">"target"</code>)
              and a <code className="text-foreground">position</code>. Pass a stable{' '}
              <code className="text-foreground">id</code> when a node has more than one handle on the same
              side so edges can target a specific connection point.
            </p>
          </div>
          <PropsTable props={handleProps} />
        </Section>

        <Section id="node-wrapper" title="<NodeWrapper>">
          <div className="prose prose-invert max-w-none">
            <p className="text-muted-foreground">
              The transform / selection / measurement shell Flow mounts around every node. Most consumers
              don't reach for it directly — it shows up when you want the wrapper styling but need a fully
              manual rendering path instead of the <code className="text-foreground">nodeTypes</code> map.
            </p>
          </div>
          <PropsTable props={nodeWrapperProps} />
        </Section>

        <Section id="simple-edge" title="<SimpleEdge>">
          <div className="prose prose-invert max-w-none">
            <p className="text-muted-foreground">
              The default edge renderer. Reads the edge's{' '}
              <code className="text-foreground">type</code> /{' '}
              <code className="text-foreground">animated</code> /{' '}
              <code className="text-foreground">selected</code> flags and draws a stroke alongside an
              invisible wide hit area for click selection.
            </p>
          </div>
          <PropsTable props={simpleEdgeProps} />
        </Section>
      </div>
      <TableOfContents items={tocItems} />
    </div>
  )
}
