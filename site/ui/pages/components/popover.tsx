/**
 * Popover Reference Page (/components/popover)
 *
 * Focused developer reference with interactive Props Playground.
 * Migrated from /docs/components/popover.
 */

import { PopoverPreviewDemo, PopoverBasicDemo, PopoverFormDemo } from '@/components/popover-demo'
import { PopoverPlayground } from '@/components/popover-playground'
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
  { id: 'form', title: 'Form', branch: 'end' },
  { id: 'api-reference', title: 'API Reference' },
]

const usageCode = `import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverClose,
} from '@/components/ui/popover'`

const basicCode = `"use client"

import { createSignal } from '@barefootjs/dom'
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover'

function BasicPopover() {
  const [open, setOpen] = createSignal(false)

  return (
    <Popover open={open()} onOpenChange={setOpen}>
      <PopoverTrigger>
        <span className="inline-flex items-center rounded-md border px-4 py-2 text-sm">
          Click me
        </span>
      </PopoverTrigger>
      <PopoverContent>
        <div className="space-y-2">
          <h4 className="font-medium leading-none">About</h4>
          <p className="text-sm text-muted-foreground">
            This is a basic popover with simple text content.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  )
}`

const formCode = `"use client"

import { createSignal } from '@barefootjs/dom'
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverClose,
} from '@/components/ui/popover'

function FormPopover() {
  const [open, setOpen] = createSignal(false)

  return (
    <Popover open={open()} onOpenChange={setOpen}>
      <PopoverTrigger>
        <span className="inline-flex items-center rounded-md border px-4 py-2 text-sm">
          Settings
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" class="w-80">
        <div className="grid gap-4">
          <div className="space-y-2">
            <h4 className="font-medium leading-none">Notifications</h4>
            <p className="text-sm text-muted-foreground">
              Configure how you receive notifications.
            </p>
          </div>
          <div className="grid gap-3">
            <div className="flex items-center justify-between">
              <label className="text-sm">Email</label>
              <input
                type="email"
                placeholder="you@example.com"
                className="h-8 w-48 rounded-md border px-3 text-sm"
              />
            </div>
          </div>
          <div className="flex justify-between">
            <PopoverClose class="rounded-md border px-3 py-1.5 text-sm">
              Cancel
            </PopoverClose>
            <button className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground">
              Save
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}`

const popoverProps: PropDefinition[] = [
  {
    name: 'open',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Whether the popover is open.',
  },
  {
    name: 'onOpenChange',
    type: '(open: boolean) => void',
    description: 'Callback when open state should change.',
  },
]

const popoverTriggerProps: PropDefinition[] = [
  {
    name: 'disabled',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Whether the trigger is disabled.',
  },
  {
    name: 'asChild',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Render child element as trigger instead of built-in button.',
  },
]

const popoverContentProps: PropDefinition[] = [
  {
    name: 'align',
    type: "'start' | 'center' | 'end'",
    defaultValue: "'center'",
    description: 'Alignment relative to the trigger element.',
  },
  {
    name: 'side',
    type: "'top' | 'bottom'",
    defaultValue: "'bottom'",
    description: 'Which side of the trigger to position the popover.',
  },
]

const popoverCloseProps: PropDefinition[] = [
  {
    name: 'children',
    type: 'Child',
    description: 'The button content.',
  },
]

export function PopoverRefPage() {
  return (
    <DocPage slug="popover" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Popover"
          description="A floating panel that appears relative to a trigger element."
          {...getNavLinks('popover')}
        />

        {/* Props Playground */}
        <PopoverPlayground />

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="barefoot add popover" />
        </Section>

        {/* Usage */}
        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <div className="flex gap-4">
              <PopoverPreviewDemo />
            </div>
          </Example>
        </Section>

        {/* Examples */}
        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="Basic" code={basicCode}>
              <PopoverBasicDemo />
            </Example>
            <Example title="Form" code={formCode}>
              <PopoverFormDemo />
            </Example>
          </div>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">Popover</h3>
              <PropsTable props={popoverProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">PopoverTrigger</h3>
              <PropsTable props={popoverTriggerProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">PopoverContent</h3>
              <PropsTable props={popoverContentProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">PopoverClose</h3>
              <PropsTable props={popoverCloseProps} />
            </div>
          </div>
        </Section>
      </div>
    </DocPage>
  )
}
