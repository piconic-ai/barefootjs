/**
 * Textarea Reference Page (/components/textarea)
 *
 * Focused developer reference with interactive Props Playground.
 * Part of the #515 page redesign initiative.
 */

import { Textarea } from '@/components/ui/textarea'
import { TextareaBindingDemo } from '@/components/textarea-demo'
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
  { id: 'examples', title: 'Examples' },
  { id: 'disabled', title: 'Disabled', branch: 'start' },
  { id: 'value-binding', title: 'Value Binding', branch: 'end' },
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

const disabledCode = `"use client"

import { Textarea } from '@/components/ui/textarea'

function TextareaDisabled() {
  return (
    <div className="flex flex-col gap-2 max-w-sm">
      <Textarea disabled placeholder="Disabled textarea" />
      <Textarea readOnly value="Read-only content" />
    </div>
  )
}`

const bindingCode = `"use client"

import { createSignal } from '@barefootjs/dom'
import { Textarea } from '@/components/ui/textarea'

function TextareaBinding() {
  const [value, setValue] = createSignal('')

  return (
    <div className="max-w-sm space-y-2">
      <Textarea
        value={value()}
        onInput={(e) => setValue(e.target.value)}
        placeholder="Type your message here."
      />
      <p className="text-sm text-muted-foreground">
        {value().length} characters
      </p>
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

        {/* Examples */}
        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="Disabled" code={disabledCode}>
              <div className="flex flex-col gap-2 max-w-sm">
                <Textarea disabled placeholder="Disabled textarea" />
                <Textarea readonly value="Read-only content" />
              </div>
            </Example>

            <Example title="Value Binding" code={bindingCode}>
              <div className="max-w-sm">
                <TextareaBindingDemo />
              </div>
            </Example>
          </div>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <PropsTable props={textareaProps} />
        </Section>
      </div>
    </DocPage>
  )
}
