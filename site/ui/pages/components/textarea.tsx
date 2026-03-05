/**
 * Textarea Reference Page (/components/textarea)
 *
 * Focused developer reference with interactive Props Playground.
 * Part of the #515 page redesign initiative.
 */

import { Textarea } from '@/components/ui/textarea'
import { TextareaPlayground } from '@/components/textarea-playground'
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

const usageCode = `import { Textarea } from "@/components/ui/textarea"

function TextareaDemo() {
  return (
    <div className="flex flex-col gap-4 max-w-sm">
      <Textarea placeholder="Type your message here." />
      <Textarea disabled placeholder="Disabled textarea" />
      <Textarea error placeholder="Error state" />
      <Textarea rows={6} placeholder="With explicit rows" />
    </div>
  )
}`

const textareaProps: PropDefinition[] = [
  {
    name: 'placeholder',
    type: 'string',
    description: 'Placeholder text shown when textarea is empty.',
  },
  {
    name: 'value',
    type: 'string',
    description: 'The controlled value of the textarea.',
  },
  {
    name: 'disabled',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Whether the textarea is disabled.',
  },
  {
    name: 'readOnly',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Whether the textarea is read-only.',
  },
  {
    name: 'error',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Whether the textarea is in an error state.',
  },
  {
    name: 'rows',
    type: 'number',
    description: 'Number of visible text rows.',
  },
  {
    name: 'onInput',
    type: '(e: Event) => void',
    description: 'Event handler called on each input change.',
  },
  {
    name: 'onChange',
    type: '(e: Event) => void',
    description: 'Event handler called when textarea value changes and loses focus.',
  },
  {
    name: 'onBlur',
    type: '(e: Event) => void',
    description: 'Event handler called when textarea loses focus.',
  },
  {
    name: 'onFocus',
    type: '(e: Event) => void',
    description: 'Event handler called when textarea gains focus.',
  },
]

export function TextareaRefPage() {
  return (
    <DocPage slug="textarea" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Textarea"
          description="Displays a multi-line text input field."
          {...getNavLinks('textarea')}
        />

        {/* Props Playground */}
        <TextareaPlayground />

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="barefoot add textarea" />
        </Section>

        {/* Usage */}
        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <div className="flex flex-col gap-4 max-w-sm">
              <Textarea placeholder="Type your message here." />
              <Textarea disabled placeholder="Disabled textarea" />
              <Textarea error placeholder="Error state" />
              <Textarea rows={6} placeholder="With explicit rows" />
            </div>
          </Example>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <PropsTable props={textareaProps} />
        </Section>
      </div>
    </DocPage>
  )
}
