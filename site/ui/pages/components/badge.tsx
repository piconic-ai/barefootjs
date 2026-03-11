/**
 * Badge Reference Page (/components/badge)
 *
 * Focused developer reference with interactive Props Playground.
 * Part of the #515 page redesign initiative.
 */

import { Badge } from '@/components/ui/badge'
import { BadgePlayground } from '@/components/badge-playground'
import { BadgeAsChildDemo } from '@/components/badge-as-child-demo'
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
  { id: 'secondary', title: 'Secondary', branch: 'start' },
  { id: 'destructive', title: 'Destructive', branch: 'child' },
  { id: 'outline', title: 'Outline', branch: 'child' },
  { id: 'as-child', title: 'As Child', branch: 'end' },
  { id: 'api-reference', title: 'API Reference' },
]

const usageCode = `import { Badge } from "@/components/ui/badge"

function BadgeDemo() {
  return (
    <div className="flex flex-wrap gap-2">
      <Badge>Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="destructive">Destructive</Badge>
      <Badge variant="outline">Outline</Badge>
      <Badge asChild>
        <a href="#">Link Badge</a>
      </Badge>
    </div>
  )
}`

const secondaryCode = `<Badge variant="secondary">Secondary</Badge>`

const destructiveCode = `<Badge variant="destructive">Destructive</Badge>`

const outlineCode = `<Badge variant="outline">Outline</Badge>`

const asChildCode = `"use client"

import { createSignal } from '@barefootjs/dom'
import { Badge } from '@/components/ui/badge'

function BadgeAsChild() {
  const [count, setCount] = createSignal(0)

  return (
    <div className="flex items-center gap-4">
      <Badge asChild>
        <a href="#" onClick={() => setCount(count() + 1)}>
          Clicked {count()} times
        </a>
      </Badge>
      <Badge variant="outline" asChild>
        <a href="#">Outline Link</a>
      </Badge>
    </div>
  )
}`

const badgeProps: PropDefinition[] = [
  {
    name: 'variant',
    type: "'default' | 'secondary' | 'destructive' | 'outline'",
    defaultValue: "'default'",
    description: 'The visual style of the badge.',
  },
  {
    name: 'asChild',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Render child element with badge styling instead of <span>.',
  },
  {
    name: 'children',
    type: 'Child',
    description: 'The content of the badge.',
  },
]

export function BadgeRefPage() {
  return (
    <DocPage slug="badge" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Badge"
          description="Displays a badge or a component that looks like a badge."
          {...getNavLinks('badge')}
        />

        {/* Props Playground */}
        <BadgePlayground />

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="barefoot add badge" />
        </Section>

        {/* Usage */}
        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <div className="flex flex-wrap gap-2">
              <Badge>Default</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="destructive">Destructive</Badge>
              <Badge variant="outline">Outline</Badge>
              <Badge asChild>
                <a href="#">Link Badge</a>
              </Badge>
            </div>
          </Example>
        </Section>

        {/* Examples */}
        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="Secondary" code={secondaryCode} showLineNumbers={false}>
              <Badge variant="secondary">Secondary</Badge>
            </Example>

            <Example title="Destructive" code={destructiveCode} showLineNumbers={false}>
              <Badge variant="destructive">Destructive</Badge>
            </Example>

            <Example title="Outline" code={outlineCode} showLineNumbers={false}>
              <Badge variant="outline">Outline</Badge>
            </Example>

            <Example title="As Child" code={asChildCode}>
              <BadgeAsChildDemo />
            </Example>
          </div>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <PropsTable props={badgeProps} />
        </Section>
      </div>
    </DocPage>
  )
}
