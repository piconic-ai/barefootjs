/**
 * InputGroup Reference Page (/components/input-group)
 *
 * Focused developer reference with interactive Props Playground.
 */

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupInput,
  InputGroupTextarea,
} from '@/components/ui/input-group'
import { InputGroupPlayground } from '@/components/input-group-playground'
import { InputGroupBasicDemo, InputGroupButtonDemo, InputGroupPasswordDemo } from '@/components/input-group-demo'
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
  { id: 'prefix-suffix', title: 'Prefix & Suffix', branch: 'start' },
  { id: 'with-button', title: 'With Button', branch: 'child' },
  { id: 'password-toggle', title: 'Password Toggle', branch: 'child' },
  { id: 'disabled', title: 'Disabled', branch: 'child' },
  { id: 'with-textarea', title: 'With Textarea', branch: 'end' },
  { id: 'api-reference', title: 'API Reference' },
]

const usageCode = `import {
  InputGroup,
  InputGroupAddon,
  InputGroupText,
  InputGroupInput,
} from "@/components/ui/input-group"

function InputGroupDemo() {
  return (
    <InputGroup>
      <InputGroupAddon>
        <InputGroupText>https://</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput placeholder="example.com" />
    </InputGroup>
  )
}`

const prefixSuffixCode = `import {
  InputGroup,
  InputGroupAddon,
  InputGroupText,
  InputGroupInput,
} from "@/components/ui/input-group"

function PrefixSuffix() {
  return (
    <div className="flex flex-col gap-4 max-w-sm">
      <InputGroup>
        <InputGroupAddon>
          <InputGroupText>https://</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput placeholder="example.com" />
      </InputGroup>

      <InputGroup>
        <InputGroupInput placeholder="Enter amount" />
        <InputGroupAddon align="inline-end">
          <InputGroupText>USD</InputGroupText>
        </InputGroupAddon>
      </InputGroup>

      <InputGroup>
        <InputGroupAddon>
          <InputGroupText>
            <SearchIcon />
          </InputGroupText>
        </InputGroupAddon>
        <InputGroupInput placeholder="Search..." />
      </InputGroup>
    </div>
  )
}`

const buttonCode = `"use client"

import { createSignal } from "@barefootjs/dom"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupInput,
} from "@/components/ui/input-group"

function WithButton() {
  const [value, setValue] = createSignal("")

  return (
    <InputGroup>
      <InputGroupInput
        placeholder="Enter text to copy..."
        value={value()}
        onInput={(e) => setValue(e.target.value)}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          onClick={() => navigator.clipboard.writeText(value())}
        >
          Copy
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
}`

const passwordCode = `"use client"

import { createSignal } from "@barefootjs/dom"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupInput,
} from "@/components/ui/input-group"

function PasswordToggle() {
  const [visible, setVisible] = createSignal(false)

  return (
    <InputGroup>
      <InputGroupAddon>
        <InputGroupText><LockIcon /></InputGroupText>
      </InputGroupAddon>
      <InputGroupInput
        type={visible() ? "text" : "password"}
        placeholder="Enter password"
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          size="icon-xs"
          onClick={() => setVisible(v => !v)}
          aria-label={visible() ? "Hide password" : "Show password"}
        >
          {visible() ? <EyeOffIcon /> : <EyeIcon />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
}`

const disabledCode = `import {
  InputGroup,
  InputGroupAddon,
  InputGroupText,
  InputGroupInput,
} from "@/components/ui/input-group"

function Disabled() {
  return (
    <InputGroup data-disabled="true">
      <InputGroupAddon>
        <InputGroupText>https://</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput placeholder="example.com" disabled />
    </InputGroup>
  )
}`

const textareaCode = `import {
  InputGroup,
  InputGroupAddon,
  InputGroupText,
  InputGroupTextarea,
} from "@/components/ui/input-group"

function WithTextarea() {
  return (
    <InputGroup>
      <InputGroupAddon align="block-start">
        <InputGroupText>Description</InputGroupText>
      </InputGroupAddon>
      <InputGroupTextarea placeholder="Type your message..." rows={3} />
    </InputGroup>
  )
}`

const inputGroupProps: PropDefinition[] = [
  {
    name: 'className',
    type: 'string',
    description: 'Additional CSS class names.',
  },
  {
    name: 'children',
    type: 'Child',
    description: 'Input controls and addons to render inside the group.',
  },
  {
    name: 'data-disabled',
    type: "'true'",
    description: 'Set to "true" to apply disabled styling to addons.',
  },
]

const addonProps: PropDefinition[] = [
  {
    name: 'align',
    type: "'inline-start' | 'inline-end' | 'block-start' | 'block-end'",
    defaultValue: "'inline-start'",
    description: 'Position of the addon relative to the input control.',
  },
  {
    name: 'className',
    type: 'string',
    description: 'Additional CSS class names.',
  },
  {
    name: 'children',
    type: 'Child',
    description: 'Content to display in the addon (text, icons, buttons).',
  },
]

const buttonProps: PropDefinition[] = [
  {
    name: 'size',
    type: "'xs' | 'sm' | 'icon-xs' | 'icon-sm'",
    defaultValue: "'xs'",
    description: 'Size of the button.',
  },
  {
    name: 'type',
    type: "'button' | 'submit' | 'reset'",
    defaultValue: "'button'",
    description: 'The HTML button type.',
  },
  {
    name: 'className',
    type: 'string',
    description: 'Additional CSS class names.',
  },
  {
    name: 'children',
    type: 'Child',
    description: 'Button content (text, icons).',
  },
]

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
    name: 'className',
    type: 'string',
    description: 'Additional CSS class names.',
  },
]

export function InputGroupRefPage() {
  return (
    <DocPage slug="input-group" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Input Group"
          description="Input with addons, prefixes, and suffixes."
          {...getNavLinks('input-group')}
        />

        {/* Props Playground */}
        <InputGroupPlayground />

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="barefoot add input-group" />
        </Section>

        {/* Usage */}
        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <div className="max-w-sm">
              <InputGroup>
                <InputGroupAddon>
                  <InputGroupText>https://</InputGroupText>
                </InputGroupAddon>
                <InputGroupInput placeholder="example.com" />
              </InputGroup>
            </div>
          </Example>
        </Section>

        {/* Examples */}
        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="Prefix & Suffix" code={prefixSuffixCode}>
              <InputGroupBasicDemo />
            </Example>

            <Example title="With Button" code={buttonCode}>
              <div className="max-w-sm">
                <InputGroupButtonDemo />
              </div>
            </Example>

            <Example title="Password Toggle" code={passwordCode}>
              <InputGroupPasswordDemo />
            </Example>

            <Example title="Disabled" code={disabledCode}>
              <div className="max-w-sm">
                <InputGroup data-disabled="true">
                  <InputGroupAddon>
                    <InputGroupText>https://</InputGroupText>
                  </InputGroupAddon>
                  <InputGroupInput placeholder="example.com" disabled />
                </InputGroup>
              </div>
            </Example>

            <Example title="With Textarea" code={textareaCode}>
              <div className="max-w-sm">
                <InputGroup>
                  <InputGroupAddon align="block-start">
                    <InputGroupText>Description</InputGroupText>
                  </InputGroupAddon>
                  <InputGroupTextarea placeholder="Type your message..." rows={3} />
                </InputGroup>
              </div>
            </Example>
          </div>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <div className="space-y-8">
            <div>
              <h3 className="text-lg font-semibold mb-4">InputGroup</h3>
              <PropsTable props={inputGroupProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">InputGroupAddon</h3>
              <PropsTable props={addonProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">InputGroupButton</h3>
              <PropsTable props={buttonProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">InputGroupInput</h3>
              <PropsTable props={inputProps} />
            </div>
          </div>
        </Section>
      </div>
    </DocPage>
  )
}
