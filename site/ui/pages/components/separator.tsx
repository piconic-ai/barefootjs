/**
 * Separator Reference Page (/components/separator)
 *
 * Focused developer reference with interactive Props Playground.
 * Part of the #515 page redesign initiative.
 */

import { Separator } from '@/components/ui/separator'
import { SeparatorPlayground } from '@/components/separator-playground'
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

const usageCode = `import { Separator } from "@/components/ui/separator"

function SeparatorDemo() {
  return (
    <div>
      <div className="space-y-1">
        <h4 className="text-sm font-medium leading-none">BarefootJS</h4>
        <p className="text-sm text-muted-foreground">An open-source UI component library.</p>
      </div>
      <Separator className="my-4" />
      <div className="flex h-5 items-center space-x-4 text-sm">
        <div>Docs</div>
        <Separator orientation="vertical" />
        <div>Source</div>
        <Separator orientation="vertical" />
        <div>Blog</div>
      </div>
    </div>
  )
}`

const separatorProps: PropDefinition[] = [
  {
    name: 'orientation',
    type: "'horizontal' | 'vertical'",
    defaultValue: "'horizontal'",
    description: 'The orientation of the separator.',
  },
  {
    name: 'decorative',
    type: 'boolean',
    defaultValue: 'true',
    description: 'When true, renders with role="none" (purely visual). When false, renders with role="separator" for accessibility.',
  },
  {
    name: 'className',
    type: 'string',
    defaultValue: "''",
    description: 'Additional CSS classes to apply.',
  },
]

export function SeparatorRefPage() {
  return (
    <DocPage slug="separator" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Separator"
          description="Visually or semantically separates content."
          {...getNavLinks('separator')}
        />

        {/* Props Playground */}
        <SeparatorPlayground />

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="barefoot add separator" />
        </Section>

        {/* Usage */}
        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <div className="w-full max-w-sm">
              <div className="space-y-1">
                <h4 className="text-sm font-medium leading-none">BarefootJS</h4>
                <p className="text-sm text-muted-foreground">An open-source UI component library.</p>
              </div>
              <Separator className="my-4" />
              <div className="flex h-5 items-center space-x-4 text-sm">
                <div>Docs</div>
                <Separator orientation="vertical" />
                <div>Source</div>
                <Separator orientation="vertical" />
                <div>Blog</div>
              </div>
            </div>
          </Example>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <PropsTable props={separatorProps} />
        </Section>
      </div>
    </DocPage>
  )
}
