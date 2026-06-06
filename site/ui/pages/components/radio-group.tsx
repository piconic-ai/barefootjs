/**
 * RadioGroup Reference Page (/components/radio-group)
 *
 * Focused developer reference with interactive Props Playground.
 * Part of the #515 page redesign initiative.
 */

import { RadioGroupPlayground } from '@/components/radio-group-playground'
import { RadioGroupUsageDemo } from '@/components/radio-group-usage-demo'
import {
  RadioGroupBasicDemo,
  RadioGroupFormDemo,
  RadioGroupCardDemo,
} from '@/components/radio-group-demo'
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
  { id: 'basic', title: 'Basic', branch: 'start' },
  { id: 'form', title: 'Form', branch: 'child' },
  { id: 'card', title: 'Card', branch: 'end' },
  { id: 'api-reference', title: 'API Reference' },
]

const usageCode = `"use client"

import { createSignal } from "@barefootjs/client"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"

function RadioGroupDemo() {
  const [plan, setPlan] = createSignal("free")

  return (
    <div className="space-y-6">
      {/* Uncontrolled with defaultValue */}
      <RadioGroup defaultValue="email">
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="email" />
          <span className="text-sm font-medium leading-none">Email</span>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="sms" />
          <span className="text-sm font-medium leading-none">SMS</span>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="push" />
          <span className="text-sm font-medium leading-none">Push notification</span>
        </div>
      </RadioGroup>

      {/* Controlled with onValueChange */}
      <RadioGroup value={plan()} onValueChange={setPlan}>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="free" />
          <span className="text-sm font-medium leading-none">Free</span>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="pro" />
          <span className="text-sm font-medium leading-none">Pro</span>
        </div>
      </RadioGroup>

      {/* Disabled */}
      <RadioGroup disabled defaultValue="on">
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="on" />
          <span className="text-sm font-medium leading-none">On</span>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="off" />
          <span className="text-sm font-medium leading-none">Off</span>
        </div>
      </RadioGroup>
    </div>
  )
}`

const basicCode = `"use client"

import { createSignal } from "@barefootjs/client"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"

export function RadioGroupBasicDemo() {
  const [density, setDensity] = createSignal("default")

  return (
    <div className="space-y-4">
      <RadioGroup defaultValue="default" onValueChange={setDensity}>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="default" />
          <span className="text-sm font-medium leading-none">Default</span>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="comfortable" />
          <span className="text-sm font-medium leading-none">Comfortable</span>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="compact" />
          <span className="text-sm font-medium leading-none">Compact</span>
        </div>
      </RadioGroup>
      <div className="text-sm text-muted-foreground pt-2 border-t">
        Selected: {density()}
      </div>
    </div>
  )
}`

const formCode = `"use client"

import { createSignal, createMemo } from "@barefootjs/client"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"

export function RadioGroupFormDemo() {
  const [notifyType, setNotifyType] = createSignal("all")
  const [theme, setTheme] = createSignal("system")

  const summary = createMemo(() =>
    \`Notifications: \${notifyType()}, Theme: \${theme()}\`
  )

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h4 className="text-sm font-medium leading-none">Notify me about...</h4>
        <RadioGroup defaultValue="all" onValueChange={setNotifyType}>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="all" />
            <span className="text-sm leading-none">All new messages</span>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="mentions" />
            <span className="text-sm leading-none">Direct messages and mentions</span>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="none" />
            <span className="text-sm leading-none">Nothing</span>
          </div>
        </RadioGroup>
      </div>
      <div className="space-y-3">
        <h4 className="text-sm font-medium leading-none">Theme</h4>
        <RadioGroup defaultValue="system" onValueChange={setTheme}>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="light" />
            <span className="text-sm leading-none">Light</span>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="dark" />
            <span className="text-sm leading-none">Dark</span>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="system" />
            <span className="text-sm leading-none">System</span>
          </div>
        </RadioGroup>
      </div>
      <div className="text-sm text-muted-foreground pt-2 border-t">
        {summary()}
      </div>
    </div>
  )
}`

const cardCode = `"use client"

import { createSignal } from "@barefootjs/client"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"

const plans = [
  { value: "startup", name: "Startup", price: "$29", description: "For small teams getting started" },
  { value: "business", name: "Business", price: "$99", description: "For growing companies" },
  { value: "enterprise", name: "Enterprise", price: "$299", description: "For large organizations" },
]

export function RadioGroupCardDemo() {
  const [plan, setPlan] = createSignal("startup")

  return (
    <div className="space-y-4">
      <RadioGroup defaultValue="startup" onValueChange={setPlan} class="grid-cols-1 sm:grid-cols-3">
        {plans.map((p) => (
          <div key={p.value} className="relative">
            <div className="flex items-start space-x-3 rounded-lg border p-4 hover:bg-accent/50 cursor-pointer">
              <RadioGroupItem value={p.value} />
              <div className="space-y-1">
                <span className="text-sm font-medium leading-none">{p.name}</span>
                <p className="text-xl font-bold text-foreground">
                  {p.price}<span className="text-sm font-normal text-muted-foreground">/mo</span>
                </p>
                <p className="text-sm text-muted-foreground">{p.description}</p>
              </div>
            </div>
          </div>
        ))}
      </RadioGroup>
      <div className="text-sm text-muted-foreground pt-2 border-t">
        Selected plan: {plan()}
      </div>
    </div>
  )
}`

const radioGroupProps: PropDefinition[] = [
  {
    name: 'defaultValue',
    type: 'string',
    description: 'The initial selected value for uncontrolled mode.',
  },
  {
    name: 'value',
    type: 'string',
    description: 'The controlled selected value. When provided, the component is in controlled mode.',
  },
  {
    name: 'onValueChange',
    type: '(value: string) => void',
    description: 'Event handler called when the selected value changes.',
  },
  {
    name: 'disabled',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Whether the entire radio group is disabled.',
  },
]

const radioGroupItemProps: PropDefinition[] = [
  {
    name: 'value',
    type: 'string',
    description: 'The value of this radio item. Required.',
  },
  {
    name: 'disabled',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Whether this radio item is disabled.',
  },
]

export function RadioGroupRefPage() {
  return (
    <DocPage slug="radio-group" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Radio Group"
          description="A set of checkable buttons where only one can be checked at a time."
          {...getNavLinks('radio-group')}
        />

        {/* Props Playground */}
        <RadioGroupPlayground />

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="@barefootjs/cli add radio-group" />
        </Section>

        {/* Usage */}
        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <RadioGroupUsageDemo />
          </Example>
        </Section>

        {/* Examples */}
        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="Basic" code={basicCode}>
              <RadioGroupBasicDemo />
            </Example>

            <Example title="Form" code={formCode}>
              <RadioGroupFormDemo />
            </Example>

            <Example title="Card" code={cardCode}>
              <RadioGroupCardDemo />
            </Example>
          </div>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <h3 className="text-lg font-semibold mb-4">RadioGroup</h3>
          <PropsTable props={radioGroupProps} />
          <h3 className="text-lg font-semibold mb-4 mt-8">RadioGroupItem</h3>
          <PropsTable props={radioGroupItemProps} />
        </Section>
      </div>
    </DocPage>
  )
}
