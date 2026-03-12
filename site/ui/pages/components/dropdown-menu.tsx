/**
 * Dropdown Menu Reference Page (/components/dropdown-menu)
 *
 * Focused developer reference with interactive Props Playground.
 * Migrated from /docs/components/dropdown-menu.
 */

import { DropdownMenuProfileDemo, DropdownMenuBasicDemo, DropdownMenuCheckboxDemo } from '@/components/dropdown-menu-demo'
import { DropdownMenuPlayground } from '@/components/dropdown-menu-playground'
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
  { id: 'checkbox-items', title: 'Checkbox Items', branch: 'end' },
  { id: 'api-reference', title: 'API Reference' },
]

// Code examples
const usageCode = `"use client"

import { createSignal } from "@barefootjs/dom"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"

function MyMenu() {
  const [open, setOpen] = createSignal(false)

  return (
    <DropdownMenu open={open()} onOpenChange={setOpen}>
      <DropdownMenuTrigger>
        <span className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
          Open Menu
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <span>Copy</span>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <span>Paste</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">
          <span>Delete</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}`

const basicCode = `"use client"

import { createSignal } from "@barefootjs/dom"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"

function BasicMenu() {
  const [open, setOpen] = createSignal(false)

  return (
    <DropdownMenu open={open()} onOpenChange={setOpen}>
      <DropdownMenuTrigger>
        <span className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
          Open Menu
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <span>Copy</span>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <span>Paste</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">
          <span>Delete</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}`

const checkboxCode = `"use client"

import { createSignal } from "@barefootjs/dom"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"

function CheckboxMenu() {
  const [open, setOpen] = createSignal(false)
  const [showStatus, setShowStatus] = createSignal(true)
  const [showActivity, setShowActivity] = createSignal(false)

  return (
    <DropdownMenu open={open()} onOpenChange={setOpen}>
      <DropdownMenuTrigger>
        <span className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
          View
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Toggle Panels</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem checked={showStatus()} onCheckedChange={setShowStatus}>
          <span>Status Bar</span>
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked={showActivity()} onCheckedChange={setShowActivity}>
          <span>Activity Panel</span>
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}`

// Props definitions
const dropdownMenuProps: PropDefinition[] = [
  {
    name: 'open',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Whether the dropdown menu is open.',
  },
  {
    name: 'onOpenChange',
    type: '(open: boolean) => void',
    description: 'Callback when open state should change.',
  },
]

const dropdownMenuTriggerProps: PropDefinition[] = [
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

const dropdownMenuContentProps: PropDefinition[] = [
  {
    name: 'align',
    type: "'start' | 'end'",
    defaultValue: "'start'",
    description: 'Alignment relative to the trigger element.',
  },
]

const dropdownMenuItemProps: PropDefinition[] = [
  {
    name: 'disabled',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Whether the item is disabled.',
  },
  {
    name: 'onSelect',
    type: '() => void',
    description: 'Callback when the item is selected. Menu auto-closes after selection.',
  },
  {
    name: 'variant',
    type: "'default' | 'destructive'",
    defaultValue: "'default'",
    description: 'Visual variant. Use "destructive" for dangerous actions like log out.',
  },
]

const dropdownMenuCheckboxItemProps: PropDefinition[] = [
  {
    name: 'checked',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Whether the checkbox is checked.',
  },
  {
    name: 'onCheckedChange',
    type: '(checked: boolean) => void',
    description: 'Callback when checked state changes. Menu stays open.',
  },
  {
    name: 'disabled',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Whether the item is disabled.',
  },
]

const dropdownMenuRadioGroupProps: PropDefinition[] = [
  {
    name: 'value',
    type: 'string',
    description: 'Currently selected value.',
  },
  {
    name: 'onValueChange',
    type: '(value: string) => void',
    description: 'Callback when value changes.',
  },
]

const dropdownMenuRadioItemProps: PropDefinition[] = [
  {
    name: 'value',
    type: 'string',
    description: 'Value for this radio item.',
  },
  {
    name: 'disabled',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Whether the item is disabled.',
  },
]

const dropdownMenuSubTriggerProps: PropDefinition[] = [
  {
    name: 'disabled',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Whether the sub trigger is disabled.',
  },
]

const dropdownMenuLabelProps: PropDefinition[] = [
  {
    name: 'children',
    type: 'Child',
    description: 'The label text to display.',
  },
]

const dropdownMenuShortcutProps: PropDefinition[] = [
  {
    name: 'children',
    type: 'Child',
    description: 'The keyboard shortcut text (e.g., "⇧⌘,").',
  },
]

export function DropdownMenuRefPage() {
  return (
    <DocPage slug="dropdown-menu" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Dropdown Menu"
          description="A menu of actions triggered by a button."
          {...getNavLinks('dropdown-menu')}
        />

        {/* Props Playground */}
        <DropdownMenuPlayground />

        {/* Full-featured preview */}
        <Example title="" code={`<DropdownMenu open={open()} onOpenChange={setOpen}><DropdownMenuTrigger>...</DropdownMenuTrigger><DropdownMenuContent>...</DropdownMenuContent></DropdownMenu>`}>
          <div className="flex gap-4">
            <DropdownMenuProfileDemo />
          </div>
        </Example>

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="barefoot add dropdown-menu" />
        </Section>

        {/* Usage */}
        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <DropdownMenuBasicDemo />
          </Example>
        </Section>

        {/* Examples */}
        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="Basic" code={basicCode}>
              <DropdownMenuBasicDemo />
            </Example>
            <Example title="Checkbox Items" code={checkboxCode}>
              <DropdownMenuCheckboxDemo />
            </Example>
          </div>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">DropdownMenu</h3>
              <PropsTable props={dropdownMenuProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">DropdownMenuTrigger</h3>
              <PropsTable props={dropdownMenuTriggerProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">DropdownMenuContent</h3>
              <PropsTable props={dropdownMenuContentProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">DropdownMenuItem</h3>
              <PropsTable props={dropdownMenuItemProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">DropdownMenuCheckboxItem</h3>
              <PropsTable props={dropdownMenuCheckboxItemProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">DropdownMenuRadioGroup</h3>
              <PropsTable props={dropdownMenuRadioGroupProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">DropdownMenuRadioItem</h3>
              <PropsTable props={dropdownMenuRadioItemProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">DropdownMenuSub</h3>
              <p className="text-sm text-muted-foreground">Submenu container. Manages sub-open state internally. Wrap SubTrigger and SubContent.</p>
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">DropdownMenuSubTrigger</h3>
              <PropsTable props={dropdownMenuSubTriggerProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">DropdownMenuSubContent</h3>
              <p className="text-sm text-muted-foreground">Content container for submenu items. Positioned to the right of the trigger.</p>
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">DropdownMenuLabel</h3>
              <PropsTable props={dropdownMenuLabelProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">DropdownMenuShortcut</h3>
              <PropsTable props={dropdownMenuShortcutProps} />
            </div>
          </div>
        </Section>
      </div>
    </DocPage>
  )
}
