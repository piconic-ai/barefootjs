/**
 * Input Reference Page (/components/input)
 *
 * Focused developer reference with interactive Props Playground.
 * Part of the #515 page redesign initiative.
 */

import { Input } from '@/components/ui/input'
import { InputPlayground } from '@/components/input-playground'
import { InputBindingDemo, InputFocusDemo } from '@/components/input-demo'
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
  { id: 'input-types', title: 'Input Types', branch: 'start' },
  { id: 'disabled', title: 'Disabled', branch: 'child' },
  { id: 'value-binding', title: 'Value Binding', branch: 'child' },
  { id: 'focus-state', title: 'Focus State', branch: 'end' },
  { id: 'api-reference', title: 'API Reference' },
]

const usageCode = `import { Input } from "@/components/ui/input"

function InputDemo() {
  return (
    <div className="flex flex-col gap-4 max-w-sm">
      <Input type="text" placeholder="Text input" />
      <Input type="email" placeholder="Email address" />
      <Input type="password" placeholder="Password" />
      <Input type="number" placeholder="Number" />
      <Input disabled placeholder="Disabled input" />
    </div>
  )
}`

const typesCode = `import { Input } from "@/components/ui/input"

function InputTypes() {
  return (
    <div className="flex flex-col gap-2 max-w-sm">
      <Input type="text" placeholder="Text input" />
      <Input type="email" placeholder="Email address" />
      <Input type="password" placeholder="Password" />
      <Input type="number" placeholder="Number" />
    </div>
  )
}`

const disabledCode = `import { Input } from "@/components/ui/input"

function InputDisabled() {
  return (
    <div className="flex flex-col gap-2 max-w-sm">
      <Input disabled placeholder="Disabled input" />
      <Input disabled value="Disabled with value" />
    </div>
  )
}`

const bindingCode = `"use client"

import { createSignal } from "@barefootjs/dom"
import { Input } from "@/components/ui/input"

function InputBinding() {
  const [value, setValue] = createSignal("")

  return (
    <div className="max-w-sm space-y-2">
      <Input
        value={value()}
        onInput={(e) => setValue(e.target.value)}
        placeholder="Type something..."
      />
      <p className="text-sm text-muted-foreground">
        You typed: {value()}
      </p>
    </div>
  )
}`

const focusCode = `"use client"

import { createSignal } from "@barefootjs/dom"
import { Input } from "@/components/ui/input"

function InputFocus() {
  const [focused, setFocused] = createSignal(false)

  return (
    <div className="max-w-sm space-y-2">
      <Input
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="Focus me..."
      />
      <p className="text-sm text-muted-foreground">
        {focused() ? "Input is focused" : "Input is not focused"}
      </p>
    </div>
  )
}`

const inputProps: PropDefinition[] = [
  {
    name: 'type',
    type: "'text' | 'email' | 'password' | 'number' | 'search' | 'tel' | 'url'",
    defaultValue: "'text'",
    description: 'The type of the input.',
  },
  {
    name: 'placeholder',
    type: 'string',
    description: 'Placeholder text shown when input is empty.',
  },
  {
    name: 'value',
    type: 'string',
    description: 'The controlled value of the input.',
  },
  {
    name: 'disabled',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Whether the input is disabled.',
  },
  {
    name: 'className',
    type: 'string',
    description: 'Additional CSS class names.',
  },
  {
    name: 'onInput',
    type: '(e: InputEvent) => void',
    description: 'Event handler called on each input change.',
  },
  {
    name: 'onChange',
    type: '(e: Event) => void',
    description: 'Event handler called when input value changes and loses focus.',
  },
  {
    name: 'onBlur',
    type: '(e: FocusEvent) => void',
    description: 'Event handler called when input loses focus.',
  },
  {
    name: 'onFocus',
    type: '(e: FocusEvent) => void',
    description: 'Event handler called when input gains focus.',
  },
]

export function InputRefPage() {
  return (
    <DocPage slug="input" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Input"
          description="Displays an input field for user text entry."
          {...getNavLinks('input')}
        />

        {/* Props Playground */}
        <InputPlayground />

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="barefoot add input" />
        </Section>

        {/* Usage */}
        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <div className="flex flex-col gap-4 max-w-sm">
              <Input type="text" placeholder="Text input" />
              <Input type="email" placeholder="Email address" />
              <Input type="password" placeholder="Password" />
              <Input type="number" placeholder="Number" />
              <Input disabled placeholder="Disabled input" />
            </div>
          </Example>
        </Section>

        {/* Examples */}
        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="Input Types" code={typesCode}>
              <div className="flex flex-col gap-2 max-w-sm">
                <Input type="text" placeholder="Text input" />
                <Input type="email" placeholder="Email address" />
                <Input type="password" placeholder="Password" />
                <Input type="number" placeholder="Number" />
              </div>
            </Example>

            <Example title="Disabled" code={disabledCode}>
              <div className="flex flex-col gap-2 max-w-sm">
                <Input disabled placeholder="Disabled input" />
                <Input disabled value="Disabled with value" />
              </div>
            </Example>

            <Example title="Value Binding" code={bindingCode}>
              <div className="max-w-sm">
                <InputBindingDemo />
              </div>
            </Example>

            <Example title="Focus State" code={focusCode}>
              <div className="max-w-sm">
                <InputFocusDemo />
              </div>
            </Example>
          </div>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <PropsTable props={inputProps} />
        </Section>
      </div>
    </DocPage>
  )
}
