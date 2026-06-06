/**
 * Empty Reference Page (/components/empty)
 *
 * Focused developer reference with interactive Props Playground.
 */

import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty'
import { Button } from '@/components/ui/button'
import { EmptyPlayground } from '@/components/empty-playground'
import { EmptyDemo } from '@/components/empty-demo'
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

// Lucide Package icon (inline SVG)
function PackageIcon() {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="size-6">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16.5 9.4 7.55 4.24" />
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline stroke-linecap="round" stroke-linejoin="round" stroke-width="2" points="3.29 7 12 12 20.71 7" />
      <line stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="12" x2="12" y1="22" y2="12" />
    </svg>
  )
}

// Lucide FileText icon (inline SVG)
function FileTextIcon() {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="size-6">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9H8" />
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 13H8" />
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 17H8" />
    </svg>
  )
}

const tocItems: TocItem[] = [
  { id: 'preview', title: 'Preview' },
  { id: 'installation', title: 'Installation' },
  { id: 'usage', title: 'Usage' },
  { id: 'examples', title: 'Examples' },
  { id: 'with-icon-variant', title: 'With Icon Variant', branch: 'start' },
  { id: 'without-action', title: 'Without Action', branch: 'child' },
  { id: 'interactive', title: 'Interactive', branch: 'end' },
  { id: 'api-reference', title: 'API Reference' },
]

const usageCode = `import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty"

function EmptyStateDemo() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <PackageIcon />
        </EmptyMedia>
        <EmptyTitle>No items yet</EmptyTitle>
        <EmptyDescription>
          Get started by adding your first item.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button>Add item</Button>
      </EmptyContent>
    </Empty>
  )
}`

const iconVariantCode = `<Empty className="border">
  <EmptyHeader>
    <EmptyMedia variant="icon">
      <PackageIcon />
    </EmptyMedia>
    <EmptyTitle>No packages</EmptyTitle>
    <EmptyDescription>
      Your package list is empty. Add a package to get started.
    </EmptyDescription>
  </EmptyHeader>
  <EmptyContent>
    <Button>Add package</Button>
  </EmptyContent>
</Empty>`

const withoutActionCode = `<Empty className="border">
  <EmptyHeader>
    <EmptyMedia>
      <FileTextIcon />
    </EmptyMedia>
    <EmptyTitle>No documents</EmptyTitle>
    <EmptyDescription>
      Documents will appear here once they are created.
    </EmptyDescription>
  </EmptyHeader>
</Empty>`

const interactiveCode = `"use client"

import { createSignal } from "@barefootjs/client"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty"
import { Button } from "@/components/ui/button"

function EmptyDemo() {
  const [items, setItems] = createSignal<string[]>([])

  return items().length === 0 ? (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon"><PackageIcon /></EmptyMedia>
        <EmptyTitle>No items yet</EmptyTitle>
        <EmptyDescription>Get started by adding your first item.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={() => setItems(["Item 1"])}>Add item</Button>
      </EmptyContent>
    </Empty>
  ) : (
    <div>
      <p>Items: {items().join(", ")}</p>
      <Button variant="outline" onClick={() => setItems([])}>Clear all</Button>
    </div>
  )
}`

const emptyProps: PropDefinition[] = [
  {
    name: 'children',
    type: 'Child',
    description: 'The content of the empty state (typically EmptyHeader and EmptyContent).',
  },
]

const emptyHeaderProps: PropDefinition[] = [
  {
    name: 'children',
    type: 'Child',
    description: 'The header content (typically EmptyMedia, EmptyTitle, and EmptyDescription).',
  },
]

const emptyMediaProps: PropDefinition[] = [
  {
    name: 'variant',
    type: "'default' | 'icon'",
    defaultValue: "'default'",
    description: 'The visual style of the media container. "icon" adds a rounded background.',
  },
  {
    name: 'children',
    type: 'Child',
    description: 'The media content (typically an SVG icon or image).',
  },
]

const emptyTitleProps: PropDefinition[] = [
  {
    name: 'children',
    type: 'Child',
    description: 'The title text of the empty state.',
  },
]

const emptyDescriptionProps: PropDefinition[] = [
  {
    name: 'children',
    type: 'Child',
    description: 'The description text of the empty state.',
  },
]

const emptyContentProps: PropDefinition[] = [
  {
    name: 'children',
    type: 'Child',
    description: 'The content area, typically containing action buttons.',
  },
]

export function EmptyRefPage() {
  return (
    <DocPage slug="empty" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Empty"
          description="Empty state placeholder with icon, title, and action."
          {...getNavLinks('empty')}
        />

        {/* Props Playground */}
        <EmptyPlayground />

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="@barefootjs/cli add empty" />
        </Section>

        {/* Usage */}
        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <div className="w-full">
              <Empty className="border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <PackageIcon />
                  </EmptyMedia>
                  <EmptyTitle>No items yet</EmptyTitle>
                  <EmptyDescription>
                    Get started by adding your first item.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button>Add item</Button>
                </EmptyContent>
              </Empty>
            </div>
          </Example>
        </Section>

        {/* Examples */}
        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="With Icon Variant" code={iconVariantCode} showLineNumbers={false}>
              <div className="w-full">
                <Empty className="border">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <PackageIcon />
                    </EmptyMedia>
                    <EmptyTitle>No packages</EmptyTitle>
                    <EmptyDescription>
                      Your package list is empty. Add a package to get started.
                    </EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <Button>Add package</Button>
                  </EmptyContent>
                </Empty>
              </div>
            </Example>

            <Example title="Without Action" code={withoutActionCode} showLineNumbers={false}>
              <div className="w-full">
                <Empty className="border">
                  <EmptyHeader>
                    <EmptyMedia>
                      <FileTextIcon />
                    </EmptyMedia>
                    <EmptyTitle>No documents</EmptyTitle>
                    <EmptyDescription>
                      Documents will appear here once they are created.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </div>
            </Example>

            <Example title="Interactive" code={interactiveCode}>
              <div className="w-full">
                <EmptyDemo />
              </div>
            </Example>
          </div>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-3">Empty</h3>
              <PropsTable props={emptyProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-3">EmptyHeader</h3>
              <PropsTable props={emptyHeaderProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-3">EmptyMedia</h3>
              <PropsTable props={emptyMediaProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-3">EmptyTitle</h3>
              <PropsTable props={emptyTitleProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-3">EmptyDescription</h3>
              <PropsTable props={emptyDescriptionProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-3">EmptyContent</h3>
              <PropsTable props={emptyContentProps} />
            </div>
          </div>
        </Section>
      </div>
    </DocPage>
  )
}
