/**
 * Context Menu Reference Page (/components/context-menu)
 *
 * Focused developer reference with interactive Props Playground.
 * Part of the #515 page redesign initiative.
 */

import { ContextMenuFullDemo, ContextMenuBasicDemo, ContextMenuCheckboxDemo } from '@/components/context-menu-demo'
import { ContextMenuPlayground } from '@/components/context-menu-playground'
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

const usageCode = `"use client"

import { createSignal } from '@barefootjs/dom'
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
} from '@/components/ui/context-menu'

function ContextMenuDemo() {
  const [open, setOpen] = createSignal(false)

  return (
    <ContextMenu open={open()} onOpenChange={setOpen}>
      <ContextMenuTrigger>
        <div className="flex h-[150px] w-[300px] items-center justify-center rounded-md border border-dashed text-sm">
          Right-click here
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem>
          <span>Back</span>
          <ContextMenuShortcut>⌘[</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem>
          <span>Forward</span>
          <ContextMenuShortcut>⌘]</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem>
          <span>Reload</span>
          <ContextMenuShortcut>⌘R</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}`

const basicCode = `"use client"

import { createSignal } from '@barefootjs/dom'
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuShortcut,
  ContextMenuSeparator,
} from '@/components/ui/context-menu'

function BasicContextMenu() {
  const [open, setOpen] = createSignal(false)

  return (
    <ContextMenu open={open()} onOpenChange={setOpen}>
      <ContextMenuTrigger>
        <div className="flex h-[150px] w-[300px] items-center justify-center rounded-md border border-dashed text-sm">
          Right-click here
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem>
          <span>Back</span>
          <ContextMenuShortcut>⌘[</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem>
          <span>Forward</span>
          <ContextMenuShortcut>⌘]</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem>
          <span>Reload</span>
          <ContextMenuShortcut>⌘R</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem>
          <span>Save As...</span>
          <ContextMenuShortcut>⇧⌘S</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}`

const checkboxCode = `"use client"

import { createSignal } from '@barefootjs/dom'
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuCheckboxItem,
  ContextMenuLabel,
  ContextMenuSeparator,
} from '@/components/ui/context-menu'

function CheckboxContextMenu() {
  const [open, setOpen] = createSignal(false)
  const [showBookmarks, setShowBookmarks] = createSignal(true)
  const [showFullUrls, setShowFullUrls] = createSignal(false)

  return (
    <ContextMenu open={open()} onOpenChange={setOpen}>
      <ContextMenuTrigger>
        <div className="flex h-[150px] w-[300px] items-center justify-center rounded-md border border-dashed text-sm">
          Right-click here
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuLabel>Appearance</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuCheckboxItem checked={showBookmarks()} onCheckedChange={setShowBookmarks}>
          <span>Show Bookmarks Bar</span>
        </ContextMenuCheckboxItem>
        <ContextMenuCheckboxItem checked={showFullUrls()} onCheckedChange={setShowFullUrls}>
          <span>Show Full URLs</span>
        </ContextMenuCheckboxItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}`

// Props definitions
const contextMenuProps: PropDefinition[] = [
  {
    name: 'open',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Whether the context menu is open.',
  },
  {
    name: 'onOpenChange',
    type: '(open: boolean) => void',
    description: 'Callback when open state should change.',
  },
]

const contextMenuContentProps: PropDefinition[] = [
  {
    name: 'children',
    type: 'Child',
    description: 'Menu items to display.',
  },
]

const contextMenuItemProps: PropDefinition[] = [
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
    description: 'Visual variant. Use "destructive" for dangerous actions.',
  },
]

const contextMenuCheckboxItemProps: PropDefinition[] = [
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

const contextMenuRadioGroupProps: PropDefinition[] = [
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

const contextMenuRadioItemProps: PropDefinition[] = [
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

const contextMenuSubTriggerProps: PropDefinition[] = [
  {
    name: 'disabled',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Whether the sub trigger is disabled.',
  },
]

const contextMenuLabelProps: PropDefinition[] = [
  {
    name: 'children',
    type: 'Child',
    description: 'The label text to display.',
  },
]

const contextMenuShortcutProps: PropDefinition[] = [
  {
    name: 'children',
    type: 'Child',
    description: 'The keyboard shortcut text (e.g., "⇧⌘B").',
  },
]

export function ContextMenuRefPage() {
  return (
    <DocPage slug="context-menu" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Context Menu"
          description="A menu triggered by right-click, displayed at the cursor position."
          {...getNavLinks('context-menu')}
        />

        {/* Props Playground */}
        <ContextMenuPlayground />

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="barefoot add context-menu" />
        </Section>

        {/* Usage */}
        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <div className="flex gap-4">
              <ContextMenuFullDemo />
            </div>
          </Example>
        </Section>

        {/* Examples */}
        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="Basic" code={basicCode}>
              <ContextMenuBasicDemo />
            </Example>
            <Example title="Checkbox Items" code={checkboxCode}>
              <ContextMenuCheckboxDemo />
            </Example>
          </div>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">ContextMenu</h3>
              <PropsTable props={contextMenuProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">ContextMenuTrigger</h3>
              <p className="text-sm text-muted-foreground">Area that listens for right-click. Uses display:contents wrapper.</p>
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">ContextMenuContent</h3>
              <PropsTable props={contextMenuContentProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">ContextMenuItem</h3>
              <PropsTable props={contextMenuItemProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">ContextMenuCheckboxItem</h3>
              <PropsTable props={contextMenuCheckboxItemProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">ContextMenuRadioGroup</h3>
              <PropsTable props={contextMenuRadioGroupProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">ContextMenuRadioItem</h3>
              <PropsTable props={contextMenuRadioItemProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">ContextMenuSub</h3>
              <p className="text-sm text-muted-foreground">Submenu container. Manages sub-open state internally. Wrap SubTrigger and SubContent.</p>
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">ContextMenuSubTrigger</h3>
              <PropsTable props={contextMenuSubTriggerProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">ContextMenuSubContent</h3>
              <p className="text-sm text-muted-foreground">Content container for submenu items. Positioned to the right of the trigger.</p>
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">ContextMenuLabel</h3>
              <PropsTable props={contextMenuLabelProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">ContextMenuShortcut</h3>
              <PropsTable props={contextMenuShortcutProps} />
            </div>
          </div>
        </Section>
      </div>
    </DocPage>
  )
}
