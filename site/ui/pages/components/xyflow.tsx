/**
 * xyflow Reference Page (/components/xyflow)
 *
 * Documents the JSX-native xyflow components introduced in cutover step
 * C1 of barefootjs#1081. Pan/zoom/drag wiring lands in step C4 — until
 * then the page renders a visually correct (but interactively static)
 * graph editor.
 */

import {
  XyflowPreviewDemo,
  XyflowBackgroundVariantsDemo,
  XyflowCustomNodeDemo,
} from '@/components/xyflow-demo'
import {
  DocPage,
  PageHeader,
  Section,
  Example,
  PropsTable,
  PackageManagerTabs,
  type PropDefinition,
  type TocItem,
} from '../../components/shared/docs'
import { getNavLinks } from '../../components/shared/PageNavigation'

const tocItems: TocItem[] = [
  { id: 'preview', title: 'Preview' },
  { id: 'installation', title: 'Installation' },
  { id: 'usage', title: 'Usage' },
  { id: 'examples', title: 'Examples' },
  { id: 'background-variants', title: 'Background variants', branch: 'start' },
  { id: 'custom-node', title: 'Custom node body', branch: 'end' },
  { id: 'api-reference', title: 'API Reference' },
]

const usageCode = `"use client"

import {
  Background,
  Controls,
  Flow,
  MiniMap,
} from "@/components/ui/xyflow"

const nodes = [
  { id: "1", position: { x: 100, y: 100 }, data: { label: "Input" } },
  { id: "2", position: { x: 350, y: 50 }, data: { label: "Transform" } },
  { id: "3", position: { x: 600, y: 125 }, data: { label: "Output" } },
]

const edges = [
  { id: "e1-2", source: "1", target: "2" },
  { id: "e2-3", source: "2", target: "3" },
]

export function MyFlow() {
  return (
    <div className="w-full h-[420px]">
      <Flow nodes={nodes} edges={edges}>
        <Background variant="dots" gap={20} />
        <Controls />
        <MiniMap pannable zoomable />
      </Flow>
    </div>
  )
}`

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

const customNodeCode = `import {
  Flow, Background, Controls, NodeWrapper, Handle,
} from "@/components/ui/xyflow"
import { Position } from "@xyflow/system"

const nodes = [
  { id: "src", position: { x: 80, y: 100 }, data: { label: "Source" } },
  { id: "dst", position: { x: 480, y: 100 }, data: { label: "Sink" } },
]

export function CustomNodeFlow() {
  return (
    <Flow nodes={nodes} edges={[]}>
      <Background />
      <Controls />
      {nodes.map((n) => (
        <NodeWrapper key={n.id} nodeId={n.id}>
          <div className="rounded-md border bg-card px-3 py-2">
            {n.data.label}
            <Handle type="target" position={Position.Left} nodeId={n.id} />
            <Handle type="source" position={Position.Right} nodeId={n.id} />
          </div>
        </NodeWrapper>
      ))}
    </Flow>
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
    name: 'children',
    type: 'Child',
    description: 'Slot for `<Background>` / `<Controls>` / `<MiniMap>` overlays and any custom `<NodeWrapper>` content.',
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
    defaultValue: '"#ddd"',
    description: 'Pattern color.',
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

export function XyflowRefPage() {
  return (
    <DocPage slug="xyflow" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="xyflow"
          description="Signal-based graph editor with Flow, Background, Controls, MiniMap, Handle, NodeWrapper, and SimpleEdge components."
          {...getNavLinks('xyflow')}
        />

        <Section id="preview" title="Preview">
          <XyflowPreviewDemo />
        </Section>

        <Section id="installation" title="Installation">
          <PackageManagerTabs command="barefoot add xyflow" />
        </Section>

        <Section id="usage" title="Usage">
          <Example code={usageCode}>
            <XyflowPreviewDemo />
          </Example>
        </Section>

        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Section id="background-variants" title="Background variants">
              <Example title="Background variants" code={backgroundVariantsCode}>
                <XyflowBackgroundVariantsDemo />
              </Example>
            </Section>
            <Section id="custom-node" title="Custom node body">
              <Example title="Custom node body" code={customNodeCode}>
                <XyflowCustomNodeDemo />
              </Example>
            </Section>
          </div>
        </Section>

        <Section id="api-reference" title="API Reference">
          <div className="space-y-8">
            <Section id="flow-props" title="<Flow>">
              <PropsTable props={flowProps} />
            </Section>
            <Section id="background-props" title="<Background>">
              <PropsTable props={backgroundProps} />
            </Section>
            <Section id="controls-props" title="<Controls>">
              <PropsTable props={controlsProps} />
            </Section>
            <Section id="minimap-props" title="<MiniMap>">
              <PropsTable props={minimapProps} />
            </Section>
          </div>
        </Section>
      </div>
    </DocPage>
  )
}
