/**
 * Label Reference Page (/components/label)
 *
 * Focused developer reference with interactive Props Playground.
 * Part of the #515 page redesign initiative.
 */

import { Label } from '@/components/ui/label'
import { LabelPlayground } from '@/components/label-playground'
import { LabelFormDemo, LabelDisabledDemo } from '@/components/label-demo'
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
  { id: 'form', title: 'Form', branch: 'start' },
  { id: 'disabled', title: 'Disabled', branch: 'end' },
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

const formCode = `import { Label } from '@/components/ui/label'

function LabelForm() {
  return (
    <div className="flex flex-col gap-4 max-w-sm">
      <div className="grid w-full items-center gap-1.5">
        <Label for="name">Name</Label>
        <input id="name" type="text" placeholder="Enter your name" />
      </div>
      <div className="grid w-full items-center gap-1.5">
        <Label for="email">Email</Label>
        <input id="email" type="email" placeholder="Enter your email" />
      </div>
    </div>
  )
}`

const disabledCode = `import { Label } from '@/components/ui/label'

function LabelDisabled() {
  return (
    <div className="group" data-disabled="true">
      <Label for="disabled-input">Disabled field</Label>
      <input id="disabled-input" type="text" disabled placeholder="Cannot edit" />
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
    type: 'Child',
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
          <PackageManagerTabs command="@barefootjs/cli add label" />
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

        {/* Examples */}
        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="Form" code={formCode}>
              <LabelFormDemo />
            </Example>

            <Example title="Disabled" code={disabledCode}>
              <LabelDisabledDemo />
            </Example>
          </div>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <PropsTable props={labelProps} />
        </Section>
      </div>
    </DocPage>
  )
}
