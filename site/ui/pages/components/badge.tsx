/**
 * Badge Reference Page (/components/badge)
 *
 * Focused developer reference with interactive Props Playground.
 * Part of the #515 page redesign initiative.
 */

import { Badge } from '@/components/ui/badge'
import { BadgePlayground } from '@/components/badge-playground'
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
  { id: 'playground', title: 'Playground' },
  { id: 'installation', title: 'Installation' },
  { id: 'usage', title: 'Usage' },
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
    type: 'ReactNode',
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

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <PropsTable props={badgeProps} />
        </Section>
      </div>
    </DocPage>
  )
}
