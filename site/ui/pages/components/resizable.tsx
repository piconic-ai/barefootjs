/**
 * Resizable Reference Page (/components/resizable)
 *
 * Focused developer reference with interactive Props Playground.
 * Part of the #515 page redesign initiative.
 */

import {
  ResizableHorizontalDemo,
  ResizableVerticalDemo,
  ResizableWithHandleDemo,
  ResizableThreePanelDemo,
} from '@/components/resizable-demo'
import { ResizablePlayground } from '@/components/resizable-playground'
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
  { id: 'horizontal', title: 'Horizontal', branch: 'start' },
  { id: 'vertical', title: 'Vertical', branch: 'child' },
  { id: 'with-handle', title: 'With Handle', branch: 'child' },
  { id: 'three-panels', title: 'Three Panels', branch: 'end' },
  { id: 'api-reference', title: 'API Reference' },
]

const horizontalCode = `"use client"

import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable"

function ResizableHorizontal() {
  return (
    <ResizablePanelGroup direction="horizontal" class="max-w-md rounded-lg border">
      <ResizablePanel defaultSize={50}>
        <div className="flex h-[200px] items-center justify-center p-6">
          <span className="font-semibold">One</span>
        </div>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel defaultSize={50}>
        <div className="flex h-[200px] items-center justify-center p-6">
          <span className="font-semibold">Two</span>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}`

const verticalCode = `"use client"

import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable"

function ResizableVertical() {
  return (
    <ResizablePanelGroup direction="vertical" class="min-h-[200px] max-w-md rounded-lg border">
      <ResizablePanel defaultSize={25}>
        <div className="flex h-full items-center justify-center p-6">
          <span className="font-semibold">Header</span>
        </div>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel defaultSize={75}>
        <div className="flex h-full items-center justify-center p-6">
          <span className="font-semibold">Content</span>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}`

const withHandleCode = `"use client"

import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable"

function ResizableWithHandle() {
  return (
    <ResizablePanelGroup direction="horizontal" class="min-h-[200px] max-w-md rounded-lg border">
      <ResizablePanel defaultSize={25}>
        <div className="flex h-full items-center justify-center p-6">
          <span className="font-semibold">Sidebar</span>
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={75}>
        <div className="flex h-full items-center justify-center p-6">
          <span className="font-semibold">Content</span>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}`

const threePanelsCode = `"use client"

import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable"

function ResizableThreePanels() {
  return (
    <ResizablePanelGroup direction="horizontal" class="min-h-[200px] rounded-lg border">
      <ResizablePanel defaultSize={20} minSize={15} maxSize={40}>
        <div className="flex h-full items-center justify-center p-6">
          <span className="font-semibold">Sidebar</span>
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={55} minSize={30}>
        <div className="flex h-full items-center justify-center p-6">
          <span className="font-semibold">Content</span>
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={25} minSize={15} maxSize={35}>
        <div className="flex h-full items-center justify-center p-6">
          <span className="font-semibold">Aside</span>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}`

const usageCode = `"use client"

import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable"

function ResizableDemo() {
  return (
    <ResizablePanelGroup direction="horizontal" class="min-h-[200px] rounded-lg border">
      <ResizablePanel defaultSize={20} minSize={15} maxSize={40}>
        <div className="flex h-full items-center justify-center p-6">
          <span className="font-semibold">Sidebar</span>
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={55} minSize={30}>
        <div className="flex h-full items-center justify-center p-6">
          <span className="font-semibold">Content</span>
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={25} minSize={15} maxSize={35}>
        <div className="flex h-full items-center justify-center p-6">
          <span className="font-semibold">Aside</span>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}`

const panelGroupProps: PropDefinition[] = [
  {
    name: 'direction',
    type: "'horizontal' | 'vertical'",
    defaultValue: '-',
    description: 'The layout direction of panels.',
  },
  {
    name: 'class',
    type: 'string',
    defaultValue: "''",
    description: 'Additional CSS classes.',
  },
  {
    name: 'onLayout',
    type: '(sizes: number[]) => void',
    defaultValue: '-',
    description: 'Callback fired when panel sizes change.',
  },
]

const panelProps: PropDefinition[] = [
  {
    name: 'defaultSize',
    type: 'number',
    defaultValue: '-',
    description: 'Initial size as percentage (0-100).',
  },
  {
    name: 'minSize',
    type: 'number',
    defaultValue: '0',
    description: 'Minimum size as percentage.',
  },
  {
    name: 'maxSize',
    type: 'number',
    defaultValue: '100',
    description: 'Maximum size as percentage.',
  },
  {
    name: 'class',
    type: 'string',
    defaultValue: "''",
    description: 'Additional CSS classes.',
  },
]

const handleProps: PropDefinition[] = [
  {
    name: 'withHandle',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Show visible grip dots on the handle.',
  },
  {
    name: 'disabled',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Disable drag interaction.',
  },
  {
    name: 'class',
    type: 'string',
    defaultValue: "''",
    description: 'Additional CSS classes.',
  },
]

export function ResizableRefPage() {
  return (
    <DocPage slug="resizable" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Resizable"
          description="Accessible resizable panel groups and layouts with drag and keyboard support."
          {...getNavLinks('resizable')}
        />

        {/* Props Playground */}
        <ResizablePlayground />

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="barefoot add resizable" />
        </Section>

        {/* Usage */}
        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <ResizableHorizontalDemo />
          </Example>
        </Section>

        {/* Examples */}
        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="Horizontal" code={horizontalCode}>
              <ResizableHorizontalDemo />
            </Example>

            <Example title="Vertical" code={verticalCode}>
              <ResizableVerticalDemo />
            </Example>

            <Example title="With Handle" code={withHandleCode}>
              <ResizableWithHandleDemo />
            </Example>

            <Example title="Three Panels" code={threePanelsCode}>
              <ResizableThreePanelDemo />
            </Example>
          </div>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <div className="space-y-8">
            <div>
              <h3 className="text-lg font-semibold mb-4">ResizablePanelGroup</h3>
              <PropsTable props={panelGroupProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">ResizablePanel</h3>
              <PropsTable props={panelProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">ResizableHandle</h3>
              <PropsTable props={handleProps} />
            </div>
          </div>
        </Section>
      </div>
    </DocPage>
  )
}
