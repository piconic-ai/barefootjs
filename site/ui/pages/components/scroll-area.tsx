/**
 * Scroll Area Reference Page (/components/scroll-area)
 *
 * Focused developer reference with interactive Props Playground.
 * Part of the #515 page redesign initiative.
 */

import { ScrollAreaTagsDemo } from '@/components/scroll-area-demo'
import { ScrollAreaPlayground } from '@/components/scroll-area-playground'
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
  { id: 'api-reference', title: 'API Reference' },
]

const usageCode = `"use client"

import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"

const tags = Array.from({ length: 50 }).map(
  (_, i, a) => \`v1.2.0-beta.\${a.length - i}\`
)

function ScrollAreaDemo() {
  return (
    <ScrollArea class="h-72 w-48 rounded-md border">
      <div className="p-4">
        <h4 className="mb-4 text-sm font-medium leading-none">Tags</h4>
        {tags.map((tag) => (
          <div>
            <div className="text-sm">{tag}</div>
            <Separator className="my-2" />
          </div>
        ))}
      </div>
    </ScrollArea>
  )
}`

const scrollAreaProps: PropDefinition[] = [
  {
    name: 'class',
    type: 'string',
    defaultValue: "''",
    description: 'Additional CSS classes for the root element.',
  },
  {
    name: 'type',
    type: "'hover' | 'scroll' | 'auto' | 'always'",
    defaultValue: "'hover'",
    description: 'When to show scrollbars. hover: on mouse enter; scroll: while scrolling; auto: both; always: permanent.',
  },
]

export function ScrollAreaRefPage() {
  return (
    <DocPage slug="scroll-area" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Scroll Area"
          description="Augments native scroll functionality for custom, cross-browser styling."
          {...getNavLinks('scroll-area')}
        />

        {/* Props Playground */}
        <ScrollAreaPlayground />

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="barefoot add scroll-area" />
        </Section>

        {/* Usage */}
        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <ScrollAreaTagsDemo />
          </Example>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <PropsTable props={scrollAreaProps} />
        </Section>
      </div>
    </DocPage>
  )
}
