/**
 * Select Reference Page (/components/select)
 *
 * Focused developer reference with interactive Props Playground.
 * Part of the #515 page redesign initiative.
 */

import { SelectPlayground } from '@/components/select-playground'
import { SelectBasicDemo, SelectFormDemo, SelectGroupedDemo } from '@/components/select-demo'
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
  { id: 'grouped', title: 'Grouped', branch: 'end' },
  { id: 'api-reference', title: 'API Reference' },
]

const basicCode = `"use client"

import { createSignal } from "@barefootjs/dom"
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select"

function SelectBasicDemo() {
  const [value, setValue] = createSignal("")

  return (
    <div className="space-y-3">
      <Select value={value()} onValueChange={setValue}>
        <SelectTrigger class="w-[280px]">
          <SelectValue placeholder="Select a fruit..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="apple">Apple</SelectItem>
          <SelectItem value="banana">Banana</SelectItem>
          <SelectItem value="blueberry" disabled>Blueberry</SelectItem>
          <SelectItem value="grape">Grape</SelectItem>
          <SelectItem value="pineapple">Pineapple</SelectItem>
        </SelectContent>
      </Select>
      <p className="text-sm text-muted-foreground">
        Selected: {value() || "None"}
      </p>
    </div>
  )
}`

const formCode = `"use client"

import { createSignal, createMemo } from "@barefootjs/dom"
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select"

function SelectFormDemo() {
  const [framework, setFramework] = createSignal("")
  const [role, setRole] = createSignal("")
  const [experience, setExperience] = createSignal("")

  const summary = createMemo(() => {
    const parts: string[] = []
    if (role()) parts.push(role())
    if (framework()) parts.push(\`using \${framework()}\`)
    if (experience()) parts.push(\`with \${experience()} experience\`)
    return parts.length > 0 ? parts.join(" ") : "No selections yet"
  })

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium">Developer Profile</h4>
      <div className="grid gap-3">
        <Select value={framework()} onValueChange={setFramework}>
          <SelectTrigger>
            <SelectValue placeholder="Select framework..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Next.js">Next.js</SelectItem>
            <SelectItem value="Remix">Remix</SelectItem>
            <SelectItem value="Astro">Astro</SelectItem>
            <SelectItem value="Nuxt">Nuxt</SelectItem>
          </SelectContent>
        </Select>
        {/* ... more selects ... */}
      </div>
      <p>Summary: {summary()}</p>
    </div>
  )
}`

const groupedCode = `"use client"

import { createSignal } from "@barefootjs/dom"
import {
  Select, SelectTrigger, SelectValue, SelectContent,
  SelectItem, SelectGroup, SelectLabel, SelectSeparator,
} from "@/components/ui/select"

function SelectGroupedDemo() {
  const [timezone, setTimezone] = createSignal("")

  return (
    <Select value={timezone()} onValueChange={setTimezone}>
      <SelectTrigger class="w-[280px]">
        <SelectValue placeholder="Select timezone..." />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>North America</SelectLabel>
          <SelectItem value="est">Eastern Standard Time (EST)</SelectItem>
          <SelectItem value="cst">Central Standard Time (CST)</SelectItem>
          <SelectItem value="pst">Pacific Standard Time (PST)</SelectItem>
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>Europe</SelectLabel>
          <SelectItem value="gmt">Greenwich Mean Time (GMT)</SelectItem>
          <SelectItem value="cet">Central European Time (CET)</SelectItem>
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>Asia</SelectLabel>
          <SelectItem value="jst">Japan Standard Time (JST)</SelectItem>
          <SelectItem value="cst_china">China Standard Time (CST)</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}`

const usageCode = `"use client"

import { createSignal } from "@barefootjs/dom"
import {
  Select, SelectTrigger, SelectValue,
  SelectContent, SelectItem, SelectGroup,
  SelectLabel, SelectSeparator,
} from "@/components/ui/select"

function SelectDemo() {
  const [timezone, setTimezone] = createSignal("")

  return (
    <Select value={timezone()} onValueChange={setTimezone}>
      <SelectTrigger className="w-[280px]">
        <SelectValue placeholder="Select timezone..." />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>North America</SelectLabel>
          <SelectItem value="est">Eastern Standard Time (EST)</SelectItem>
          <SelectItem value="cst">Central Standard Time (CST)</SelectItem>
          <SelectItem value="mst">Mountain Standard Time (MST)</SelectItem>
          <SelectItem value="pst">Pacific Standard Time (PST)</SelectItem>
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>Europe</SelectLabel>
          <SelectItem value="gmt">Greenwich Mean Time (GMT)</SelectItem>
          <SelectItem value="cet">Central European Time (CET)</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}`

const selectProps: PropDefinition[] = [
  {
    name: 'value',
    type: 'string',
    description: 'The controlled value of the select.',
  },
  {
    name: 'onValueChange',
    type: '(value: string) => void',
    description: 'Callback when the selected value changes.',
  },
  {
    name: 'disabled',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Whether the select is disabled.',
  },
  {
    name: 'open',
    type: 'boolean',
    description: 'Controlled open state of the dropdown.',
  },
  {
    name: 'onOpenChange',
    type: '(open: boolean) => void',
    description: 'Callback when the open state changes.',
  },
]

const selectItemProps: PropDefinition[] = [
  {
    name: 'value',
    type: 'string',
    description: 'The value for this item (required).',
  },
  {
    name: 'disabled',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Whether this item is disabled.',
  },
  {
    name: 'children',
    type: 'Child',
    description: 'The display label for this item.',
  },
]

export function SelectRefPage() {
  return (
    <DocPage slug="select" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Select"
          description="Displays a list of options for the user to pick from, triggered by a button."
          {...getNavLinks('select')}
        />

        {/* Props Playground */}
        <SelectPlayground />

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="barefoot add select" />
        </Section>

        {/* Usage */}
        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <SelectGroupedDemo />
          </Example>
        </Section>

        {/* Examples */}
        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="Basic" code={basicCode}>
              <SelectBasicDemo />
            </Example>

            <Example title="Form" code={formCode}>
              <SelectFormDemo />
            </Example>

            <Example title="Grouped" code={groupedCode}>
              <SelectGroupedDemo />
            </Example>
          </div>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <h3 className="text-lg font-semibold mb-4">Select</h3>
          <PropsTable props={selectProps} />
          <h3 className="text-lg font-semibold mb-4 mt-8">SelectItem</h3>
          <PropsTable props={selectItemProps} />
        </Section>
      </div>
    </DocPage>
  )
}
