/**
 * Label Reference Page (/components/label)
 *
 * Focused developer reference with interactive Props Playground.
 * Part of the #515 page redesign initiative.
 */

import { Label } from '@/components/ui/label'
import { LabelPlayground } from '@/components/label-playground'
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

const usageCode = `import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"

function LabelDemo() {
  return (
    <div className="grid w-full max-w-sm items-center gap-1.5">
      <Label for="email">Email</Label>
      <Input type="email" id="email" placeholder="Email" />
    </div>
  )
}`

const labelProps: PropDefinition[] = [
  {
    name: 'for',
    type: 'string',
    description: 'The id of the form control this label is associated with.',
  },
  {
    name: 'className',
    type: 'string',
    description: 'Additional CSS class names.',
  },
  {
    name: 'children',
    type: 'ReactNode',
    description: 'The content displayed inside the label.',
  },
]

export function LabelRefPage() {
  return (
    <DocPage slug="label" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Label"
          description="Renders an accessible label associated with controls."
          {...getNavLinks('label')}
        />

        {/* Props Playground */}
        <LabelPlayground />

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="barefoot add label" />
        </Section>

        {/* Usage */}
        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <div className="grid w-full max-w-sm items-center gap-1.5">
              <Label for="email">Email</Label>
              <input
                type="email"
                id="email"
                placeholder="Email"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
              />
            </div>
          </Example>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <PropsTable props={labelProps} />
        </Section>
      </div>
    </DocPage>
  )
}
