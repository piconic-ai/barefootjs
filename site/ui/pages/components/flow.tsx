/**
 * Flow Reference Page (/components/flow)
 *
 * Node-based flow editor using @barefootjs/xyflow.
 * Wraps @xyflow/system with signal-based reactivity.
 *
 * Compiler stress test for:
 * - ref callback with imperative init
 * - Integration with D3-based pan/zoom
 * - Multiple createRoot scopes (per-node isolation)
 */

import {
  FlowBasicDemo,
  FlowWithPluginsDemo,
  FlowStressDemo,
} from '@/components/flow-demo'
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
  { id: 'examples', title: 'Examples' },
  { id: 'basic', title: 'Basic Flow', branch: 'start' },
  { id: 'plugins', title: 'With Plugins', branch: 'child' },
  { id: 'stress', title: 'Stress Test', branch: 'end' },
]

const basicCode = `"use client"
import { createRoot } from '@barefootjs/dom'
import { initFlow } from '@barefootjs/xyflow'

export function FlowBasicDemo() {
  const handleMount = (el: HTMLElement) => {
    createRoot(() => {
      initFlow(el, {
        nodes: [
          { id: '1', position: { x: 0, y: 0 }, data: { label: 'Start' } },
          { id: '2', position: { x: 200, y: 80 }, data: { label: 'Process' } },
          { id: '3', position: { x: 400, y: 130 }, data: { label: 'End' } },
        ],
        edges: [
          { id: 'e1-2', source: '1', target: '2' },
          { id: 'e2-3', source: '2', target: '3' },
        ],
      })
    })
  }

  return <div ref={handleMount} style="width:100%;height:400px" />
}`

const pluginsCode = `import { initFlow, initBackground, initControls } from '@barefootjs/xyflow'

createRoot(() => {
  initFlow(el, { nodes, edges })
  initBackground(el, { variant: 'dots', gap: 20 })
  initControls(el, { position: 'bottom-left' })
})`

const stressCode = `// Generate a 5x4 grid of nodes with edges
const nodes = []
const edges = []
for (let r = 0; r < 4; r++) {
  for (let c = 0; c < 5; c++) {
    nodes.push({ id: \`n\${r}-\${c}\`, position: { x: c * 180, y: r * 100 }, data: { label: \`Node \${r * 5 + c + 1}\` } })
    if (c < 4) edges.push({ id: \`h\${r}-\${c}\`, source: \`n\${r}-\${c}\`, target: \`n\${r}-\${c+1}\` })
    if (r < 3) edges.push({ id: \`v\${r}-\${c}\`, source: \`n\${r}-\${c}\`, target: \`n\${r+1}-\${c}\` })
  }
}
initFlow(el, { nodes, edges, fitView: true })`

export function FlowRefPage() {
  return (
    <DocPage slug="flow" toc={tocItems}>
      <PageHeader
        title="Flow"
        description="Node-based flow editor powered by @xyflow/system with signal-based reactivity. Supports pan/zoom, node dragging, edge connections, selection, and plugins."
        {...getNavLinks('flow')}
      />

      <Section id="preview" title="Preview">
        <Example title="Flow Editor" code={basicCode}>
          <FlowBasicDemo />
        </Example>
      </Section>

      <Section id="examples" title="Examples">
        <Example title="Basic Flow" code={basicCode}>
          <FlowBasicDemo />
        </Example>

        <Example title="With Background &amp; Controls" code={pluginsCode}>
          <FlowWithPluginsDemo />
        </Example>

        <Example title="Stress Test (20 nodes, 31 edges)" code={stressCode}>
          <FlowStressDemo />
        </Example>
      </Section>
    </DocPage>
  )
}
