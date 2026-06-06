/**
 * NativeSelect Reference Page (/components/native-select)
 *
 * Focused developer reference with interactive Props Playground.
 */

import { NativeSelect, NativeSelectOption, NativeSelectOptGroup } from '@/components/ui/native-select'
import { NativeSelectPlayground } from '@/components/native-select-playground'
import { NativeSelectBindingDemo, NativeSelectFormDemo } from '@/components/native-select-demo'
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
  { id: 'sizes', title: 'Sizes', branch: 'start' },
  { id: 'disabled', title: 'Disabled', branch: 'child' },
  { id: 'with-optgroup', title: 'With OptGroup', branch: 'child' },
  { id: 'value-binding', title: 'Value Binding', branch: 'child' },
  { id: 'form', title: 'Form', branch: 'end' },
  { id: 'api-reference', title: 'API Reference' },
]

const usageCode = `import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select"

function NativeSelectDemo() {
  return (
    <NativeSelect>
      <NativeSelectOption value="apple">Apple</NativeSelectOption>
      <NativeSelectOption value="banana">Banana</NativeSelectOption>
      <NativeSelectOption value="cherry">Cherry</NativeSelectOption>
    </NativeSelect>
  )
}`

const sizesCode = `import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select"

function NativeSelectSizes() {
  return (
    <div className="flex flex-col gap-4 max-w-sm">
      <NativeSelect>
        <NativeSelectOption value="default">Default size</NativeSelectOption>
      </NativeSelect>
      <NativeSelect size="sm">
        <NativeSelectOption value="sm">Small size</NativeSelectOption>
      </NativeSelect>
    </div>
  )
}`

const disabledCode = `import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select"

function NativeSelectDisabled() {
  return (
    <NativeSelect disabled>
      <NativeSelectOption value="disabled">Disabled</NativeSelectOption>
    </NativeSelect>
  )
}`

const optgroupCode = `import {
  NativeSelect,
  NativeSelectOption,
  NativeSelectOptGroup,
} from "@/components/ui/native-select"

function NativeSelectWithOptGroup() {
  return (
    <NativeSelect>
      <NativeSelectOptGroup label="Fruits">
        <NativeSelectOption value="apple">Apple</NativeSelectOption>
        <NativeSelectOption value="banana">Banana</NativeSelectOption>
      </NativeSelectOptGroup>
      <NativeSelectOptGroup label="Vegetables">
        <NativeSelectOption value="carrot">Carrot</NativeSelectOption>
        <NativeSelectOption value="broccoli">Broccoli</NativeSelectOption>
      </NativeSelectOptGroup>
    </NativeSelect>
  )
}`

const bindingCode = `"use client"

import { createSignal } from "@barefootjs/client"
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select"

function NativeSelectBinding() {
  const [value, setValue] = createSignal("")

  return (
    <div className="space-y-2">
      <NativeSelect
        value={value()}
        onChange={(e) => setValue(e.target.value)}
      >
        <NativeSelectOption value="" disabled>
          Select a fruit...
        </NativeSelectOption>
        <NativeSelectOption value="apple">Apple</NativeSelectOption>
        <NativeSelectOption value="banana">Banana</NativeSelectOption>
        <NativeSelectOption value="cherry">Cherry</NativeSelectOption>
      </NativeSelect>
      <p className="text-sm text-muted-foreground">
        Selected: {value() || "none"}
      </p>
    </div>
  )
}`

const formCode = `"use client"

import { createSignal } from "@barefootjs/client"
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select"

function NativeSelectForm() {
  const [role, setRole] = createSignal("viewer")
  const [theme, setTheme] = createSignal("system")

  return (
    <div className="space-y-4 max-w-sm">
      <div className="space-y-2">
        <label className="text-sm font-medium">Role</label>
        <NativeSelect
          value={role()}
          onChange={(e) => setRole(e.target.value)}
        >
          <NativeSelectOption value="viewer">Viewer</NativeSelectOption>
          <NativeSelectOption value="editor">Editor</NativeSelectOption>
          <NativeSelectOption value="admin">Admin</NativeSelectOption>
        </NativeSelect>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Theme</label>
        <NativeSelect
          value={theme()}
          onChange={(e) => setTheme(e.target.value)}
        >
          <NativeSelectOption value="system">System</NativeSelectOption>
          <NativeSelectOption value="light">Light</NativeSelectOption>
          <NativeSelectOption value="dark">Dark</NativeSelectOption>
        </NativeSelect>
      </div>
      <p className="text-sm text-muted-foreground">
        Role: {role()}, Theme: {theme()}
      </p>
    </div>
  )
}`

const nativeSelectProps: PropDefinition[] = [
  {
    name: 'size',
    type: "'default' | 'sm'",
    defaultValue: "'default'",
    description: 'The size variant of the select.',
  },
  {
    name: 'disabled',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Whether the select is disabled.',
  },
  {
    name: 'value',
    type: 'string',
    description: 'The controlled value of the select.',
  },
  {
    name: 'className',
    type: 'string',
    description: 'Additional CSS class names applied to the select element.',
  },
  {
    name: 'onChange',
    type: '(e: Event) => void',
    description: 'Event handler called when the selected value changes.',
  },
  {
    name: 'onBlur',
    type: '(e: FocusEvent) => void',
    description: 'Event handler called when the select loses focus.',
  },
  {
    name: 'onFocus',
    type: '(e: FocusEvent) => void',
    description: 'Event handler called when the select gains focus.',
  },
]

const optionProps: PropDefinition[] = [
  {
    name: 'value',
    type: 'string',
    description: 'The value of the option.',
  },
  {
    name: 'disabled',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Whether the option is disabled.',
  },
]

const optgroupProps: PropDefinition[] = [
  {
    name: 'label',
    type: 'string',
    description: 'The label for the option group.',
  },
  {
    name: 'disabled',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Whether all options in the group are disabled.',
  },
]

export function NativeSelectRefPage() {
  return (
    <DocPage slug="native-select" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Native Select"
          description="A styled native HTML select element."
          {...getNavLinks('native-select')}
        />

        {/* Props Playground */}
        <NativeSelectPlayground />

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="@barefootjs/cli add native-select" />
        </Section>

        {/* Usage */}
        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <div className="max-w-sm">
              <NativeSelect>
                <NativeSelectOption value="apple">Apple</NativeSelectOption>
                <NativeSelectOption value="banana">Banana</NativeSelectOption>
                <NativeSelectOption value="cherry">Cherry</NativeSelectOption>
              </NativeSelect>
            </div>
          </Example>
        </Section>

        {/* Examples */}
        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="Sizes" code={sizesCode}>
              <div className="flex flex-col gap-4 max-w-sm">
                <NativeSelect>
                  <NativeSelectOption value="default">Default size</NativeSelectOption>
                </NativeSelect>
                <NativeSelect size="sm">
                  <NativeSelectOption value="sm">Small size</NativeSelectOption>
                </NativeSelect>
              </div>
            </Example>

            <Example title="Disabled" code={disabledCode}>
              <div className="max-w-sm">
                <NativeSelect disabled>
                  <NativeSelectOption value="disabled">Disabled</NativeSelectOption>
                </NativeSelect>
              </div>
            </Example>

            <Example title="With OptGroup" code={optgroupCode}>
              <div className="max-w-sm">
                <NativeSelect>
                  <NativeSelectOptGroup label="Fruits">
                    <NativeSelectOption value="apple">Apple</NativeSelectOption>
                    <NativeSelectOption value="banana">Banana</NativeSelectOption>
                  </NativeSelectOptGroup>
                  <NativeSelectOptGroup label="Vegetables">
                    <NativeSelectOption value="carrot">Carrot</NativeSelectOption>
                    <NativeSelectOption value="broccoli">Broccoli</NativeSelectOption>
                  </NativeSelectOptGroup>
                </NativeSelect>
              </div>
            </Example>

            <Example title="Value Binding" code={bindingCode}>
              <div className="max-w-sm">
                <NativeSelectBindingDemo />
              </div>
            </Example>

            <Example title="Form" code={formCode}>
              <div className="max-w-sm">
                <NativeSelectFormDemo />
              </div>
            </Example>
          </div>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <div className="space-y-8">
            <div>
              <h3 className="text-lg font-semibold mb-4">NativeSelect</h3>
              <PropsTable props={nativeSelectProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">NativeSelectOption</h3>
              <PropsTable props={optionProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">NativeSelectOptGroup</h3>
              <PropsTable props={optgroupProps} />
            </div>
          </div>
        </Section>
      </div>
    </DocPage>
  )
}
