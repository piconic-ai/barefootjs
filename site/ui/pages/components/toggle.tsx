/**
 * Toggle Reference Page (/components/toggle)
 *
 * Focused developer reference with interactive Props Playground.
 * Part of the #515 page redesign initiative.
 */

import { Toggle } from '@/components/ui/toggle'
import { TogglePlayground } from '@/components/toggle-playground'
import {
  ToggleBasicDemo,
  ToggleOutlineDemo,
  ToggleToolbarDemo,
} from '@/components/toggle-demo'
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
  { id: 'outline', title: 'Outline', branch: 'child' },
  { id: 'toolbar', title: 'Toolbar', branch: 'end' },
  { id: 'api-reference', title: 'API Reference' },
]

const basicCode = `import { Toggle } from "@/components/ui/toggle"

export function ToggleBasicDemo() {
  return (
    <div className="flex items-center gap-2">
      <Toggle aria-label="Toggle bold">
        <BoldIcon />
      </Toggle>
      <Toggle defaultPressed aria-label="Toggle italic">
        <ItalicIcon />
      </Toggle>
      <Toggle disabled aria-label="Toggle underline">
        <UnderlineIcon />
      </Toggle>
    </div>
  )
}`

const outlineCode = `import { Toggle } from "@/components/ui/toggle"

export function ToggleOutlineDemo() {
  return (
    <div className="flex items-center gap-2">
      <Toggle variant="outline" aria-label="Toggle bold">
        <BoldIcon />
      </Toggle>
      <Toggle variant="outline" aria-label="Toggle italic">
        <ItalicIcon />
      </Toggle>
      <Toggle variant="outline" aria-label="Toggle underline">
        <UnderlineIcon />
      </Toggle>
    </div>
  )
}`

const toolbarCode = `"use client"

import { createSignal, createMemo } from "@barefootjs/dom"
import { Toggle } from "@/components/ui/toggle"

const formatOptions = [
  { id: 0, name: 'Bold', label: 'Toggle bold' },
  { id: 1, name: 'Italic', label: 'Toggle italic' },
  { id: 2, name: 'Underline', label: 'Toggle underline' },
]

export function ToggleToolbarDemo() {
  const [active, setActive] = createSignal(formatOptions.map(() => false))

  const activeCount = createMemo(() => active().filter(Boolean).length)
  const activeNames = createMemo(() =>
    formatOptions.filter((_, i) => active()[i]).map(o => o.name).join(', ') || 'None'
  )

  const toggleFormat = (index: number) => {
    setActive(prev => prev.map((v, i) => i === index ? !v : v))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 rounded-md border border-input p-1">
        {formatOptions.map((option) => (
          <Toggle
            key={option.id}
            pressed={active()[option.id]}
            onPressedChange={() => toggleFormat(option.id)}
            size="sm"
            aria-label={option.label}
          >
            <Icon />
          </Toggle>
        ))}
      </div>
      <div className="text-sm text-muted-foreground">
        Active formatting: {activeNames()} ({activeCount()} selected)
      </div>
    </div>
  )
}`

const usageCode = `import { Toggle } from "@/components/ui/toggle"

function ToggleDemo() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Toggle>Default</Toggle>
      <Toggle variant="outline">Outline</Toggle>
      <Toggle size="sm">Small</Toggle>
      <Toggle size="lg">Large</Toggle>
      <Toggle defaultPressed>Pressed</Toggle>
      <Toggle disabled>Disabled</Toggle>
    </div>
  )
}`

const toggleProps: PropDefinition[] = [
  {
    name: 'defaultPressed',
    type: 'boolean',
    defaultValue: 'false',
    description: 'The initial pressed state for uncontrolled mode.',
  },
  {
    name: 'pressed',
    type: 'boolean',
    description: 'The controlled pressed state of the toggle. When provided, the component is in controlled mode.',
  },
  {
    name: 'disabled',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Whether the toggle is disabled.',
  },
  {
    name: 'variant',
    type: "'default' | 'outline'",
    defaultValue: "'default'",
    description: 'The visual variant of the toggle.',
  },
  {
    name: 'size',
    type: "'default' | 'sm' | 'lg'",
    defaultValue: "'default'",
    description: 'The size of the toggle.',
  },
  {
    name: 'onPressedChange',
    type: '(pressed: boolean) => void',
    description: 'Event handler called when the toggle state changes.',
  },
]

export function ToggleRefPage() {
  return (
    <DocPage slug="toggle" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Toggle"
          description="A two-state button that can be either on or off."
          {...getNavLinks('toggle')}
        />

        {/* Props Playground */}
        <TogglePlayground />

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="barefoot add toggle" />
        </Section>

        {/* Usage */}
        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <div className="flex flex-wrap items-center gap-2">
              <Toggle>Default</Toggle>
              <Toggle variant="outline">Outline</Toggle>
              <Toggle size="sm">Small</Toggle>
              <Toggle size="lg">Large</Toggle>
              <Toggle defaultPressed>Pressed</Toggle>
              <Toggle disabled>Disabled</Toggle>
            </div>
          </Example>
        </Section>

        {/* Examples */}
        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="Basic" code={basicCode}>
              <ToggleBasicDemo />
            </Example>

            <Example title="Outline" code={outlineCode}>
              <ToggleOutlineDemo />
            </Example>

            <Example title="Toolbar" code={toolbarCode}>
              <ToggleToolbarDemo />
            </Example>
          </div>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <PropsTable props={toggleProps} />
        </Section>
      </div>
    </DocPage>
  )
}
