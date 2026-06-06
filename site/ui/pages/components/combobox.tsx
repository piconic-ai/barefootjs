/**
 * Combobox Reference Page (/components/combobox)
 *
 * Focused developer reference with interactive Props Playground.
 * Part of the #515 page redesign initiative.
 */

import { ComboboxPlayground } from '@/components/combobox-playground'
import { ComboboxBasicDemo, ComboboxFormDemo, ComboboxGroupedDemo } from '@/components/combobox-demo'
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

const usageCode = `"use client"

import { createSignal } from '@barefootjs/client'
import {
  Combobox, ComboboxTrigger, ComboboxValue, ComboboxContent,
  ComboboxInput, ComboboxEmpty, ComboboxItem,
} from '@/components/ui/combobox'

function ComboboxDemo() {
  const [value, setValue] = createSignal('')

  return (
    <Combobox value={value()} onValueChange={setValue}>
      <ComboboxTrigger class="w-[280px]">
        <ComboboxValue placeholder="Select framework..." />
      </ComboboxTrigger>
      <ComboboxContent>
        <ComboboxInput placeholder="Search framework..." />
        <ComboboxEmpty>No framework found.</ComboboxEmpty>
        <ComboboxItem value="next">Next.js</ComboboxItem>
        <ComboboxItem value="svelte">SvelteKit</ComboboxItem>
        <ComboboxItem value="nuxt">Nuxt</ComboboxItem>
        <ComboboxItem value="remix">Remix</ComboboxItem>
        <ComboboxItem value="astro">Astro</ComboboxItem>
      </ComboboxContent>
    </Combobox>
  )
}`

const basicCode = `"use client"

import { createSignal } from '@barefootjs/client'
import {
  Combobox, ComboboxTrigger, ComboboxValue, ComboboxContent,
  ComboboxInput, ComboboxEmpty, ComboboxItem,
} from '@/components/ui/combobox'

function ComboboxBasicDemo() {
  const [value, setValue] = createSignal('')

  return (
    <div className="space-y-3">
      <Combobox value={value()} onValueChange={setValue}>
        <ComboboxTrigger class="w-[280px]">
          <ComboboxValue placeholder="Select framework..." />
        </ComboboxTrigger>
        <ComboboxContent>
          <ComboboxInput placeholder="Search framework..." />
          <ComboboxEmpty>No framework found.</ComboboxEmpty>
          <ComboboxItem value="next">Next.js</ComboboxItem>
          <ComboboxItem value="svelte">SvelteKit</ComboboxItem>
          <ComboboxItem value="nuxt">Nuxt</ComboboxItem>
          <ComboboxItem value="remix">Remix</ComboboxItem>
          <ComboboxItem value="astro">Astro</ComboboxItem>
        </ComboboxContent>
      </Combobox>
      <p className="text-sm text-muted-foreground">
        Selected: {value() || 'None'}
      </p>
    </div>
  )
}`

const formCode = `"use client"

import { createSignal, createMemo } from '@barefootjs/client'
import {
  Combobox, ComboboxTrigger, ComboboxValue, ComboboxContent,
  ComboboxInput, ComboboxEmpty, ComboboxItem,
} from '@/components/ui/combobox'

function ComboboxFormDemo() {
  const [language, setLanguage] = createSignal('')
  const [framework, setFramework] = createSignal('')

  const summary = createMemo(() => {
    const parts: string[] = []
    if (language()) parts.push(language())
    if (framework()) parts.push(\`with \${framework()}\`)
    return parts.length > 0 ? parts.join(' ') : 'No selections yet'
  })

  return (
    <div className="space-y-4 max-w-sm">
      <h4 className="text-sm font-medium">Tech Stack</h4>
      <div className="grid gap-3">
        <Combobox value={language()} onValueChange={setLanguage}>
          <ComboboxTrigger>
            <ComboboxValue placeholder="Select language..." />
          </ComboboxTrigger>
          <ComboboxContent>
            <ComboboxInput placeholder="Search language..." />
            <ComboboxEmpty>No language found.</ComboboxEmpty>
            <ComboboxItem value="TypeScript">TypeScript</ComboboxItem>
            <ComboboxItem value="JavaScript">JavaScript</ComboboxItem>
            <ComboboxItem value="Python">Python</ComboboxItem>
            <ComboboxItem value="Go">Go</ComboboxItem>
            <ComboboxItem value="Rust">Rust</ComboboxItem>
          </ComboboxContent>
        </Combobox>
        {/* ... more comboboxes ... */}
      </div>
      <p>Summary: {summary()}</p>
    </div>
  )
}`

const groupedCode = `"use client"

import { createSignal } from '@barefootjs/client'
import {
  Combobox, ComboboxTrigger, ComboboxValue, ComboboxContent,
  ComboboxInput, ComboboxEmpty, ComboboxItem,
  ComboboxGroup, ComboboxSeparator,
} from '@/components/ui/combobox'

function ComboboxGroupedDemo() {
  const [timezone, setTimezone] = createSignal('')

  return (
    <Combobox value={timezone()} onValueChange={setTimezone}>
      <ComboboxTrigger class="w-[320px]">
        <ComboboxValue placeholder="Select timezone..." />
      </ComboboxTrigger>
      <ComboboxContent>
        <ComboboxInput placeholder="Search timezone..." />
        <ComboboxEmpty>No timezone found.</ComboboxEmpty>
        <ComboboxGroup heading="North America">
          <ComboboxItem value="est">Eastern Standard Time (EST)</ComboboxItem>
          <ComboboxItem value="cst">Central Standard Time (CST)</ComboboxItem>
          <ComboboxItem value="pst">Pacific Standard Time (PST)</ComboboxItem>
        </ComboboxGroup>
        <ComboboxSeparator />
        <ComboboxGroup heading="Europe">
          <ComboboxItem value="gmt">Greenwich Mean Time (GMT)</ComboboxItem>
          <ComboboxItem value="cet">Central European Time (CET)</ComboboxItem>
        </ComboboxGroup>
        <ComboboxSeparator />
        <ComboboxGroup heading="Asia">
          <ComboboxItem value="jst">Japan Standard Time (JST)</ComboboxItem>
          <ComboboxItem value="cst_china">China Standard Time (CST)</ComboboxItem>
        </ComboboxGroup>
      </ComboboxContent>
    </Combobox>
  )
}`

const comboboxProps: PropDefinition[] = [
  {
    name: 'value',
    type: 'string',
    description: 'Controlled selected value.',
  },
  {
    name: 'onValueChange',
    type: '(value: string) => void',
    description: 'Callback when the selected value changes.',
  },
  {
    name: 'filter',
    type: '(value: string, search: string) => boolean',
    description: 'Custom filter function. Defaults to case-insensitive substring match.',
  },
]

const comboboxItemProps: PropDefinition[] = [
  {
    name: 'value',
    type: 'string',
    description: 'The value for this option (required).',
  },
  {
    name: 'disabled',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Whether this option is disabled.',
  },
]

const comboboxInputProps: PropDefinition[] = [
  {
    name: 'placeholder',
    type: 'string',
    description: 'Placeholder text for the search input.',
  },
  {
    name: 'disabled',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Whether the search input is disabled.',
  },
]

export function ComboboxRefPage() {
  return (
    <DocPage slug="combobox" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Combobox"
          description="Autocomplete input with searchable dropdown."
          {...getNavLinks('combobox')}
        />

        {/* Props Playground */}
        <ComboboxPlayground />

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="@barefootjs/cli add combobox" />
        </Section>

        {/* Usage */}
        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <ComboboxBasicDemo />
          </Example>
        </Section>

        {/* Examples */}
        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="Basic" code={basicCode}>
              <ComboboxBasicDemo />
            </Example>

            <Example title="Form" code={formCode}>
              <ComboboxFormDemo />
            </Example>

            <Example title="Grouped" code={groupedCode}>
              <ComboboxGroupedDemo />
            </Example>
          </div>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <h3 className="text-base font-semibold mb-2">Combobox</h3>
          <PropsTable props={comboboxProps} />
          <h3 className="text-base font-semibold mt-6 mb-2">ComboboxItem</h3>
          <PropsTable props={comboboxItemProps} />
          <h3 className="text-base font-semibold mt-6 mb-2">ComboboxInput</h3>
          <PropsTable props={comboboxInputProps} />
        </Section>
      </div>
    </DocPage>
  )
}
