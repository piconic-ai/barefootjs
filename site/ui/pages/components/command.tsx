/**
 * Command Reference Page (/components/command)
 *
 * Focused developer reference with interactive Props Playground.
 * Migrated from /docs/components/command.
 */

import { CommandPreviewDemo, CommandDialogDemo, CommandFilterDemo } from '@/components/command-demo'
import { CommandPlayground } from '@/components/command-playground'
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
  { id: 'dialog', title: 'Dialog', branch: 'start' },
  { id: 'custom-filter', title: 'Custom Filter', branch: 'end' },
  { id: 'api-reference', title: 'API Reference' },
]

const usageCode = `import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'`

const previewCode = `"use client"

import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'

function CommandMenu() {
  return (
    <Command class="rounded-lg border shadow-md md:min-w-[450px]">
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Suggestions">
          <CommandItem value="Calendar">Calendar</CommandItem>
          <CommandItem value="Search Emoji">Search Emoji</CommandItem>
          <CommandItem value="Calculator">Calculator</CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Settings">
          <CommandItem value="Profile">
            Profile
            <CommandShortcut>⌘P</CommandShortcut>
          </CommandItem>
          <CommandItem value="Billing">
            Billing
            <CommandShortcut>⌘B</CommandShortcut>
          </CommandItem>
          <CommandItem value="Settings">
            Settings
            <CommandShortcut>⌘S</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  )
}`

const dialogCode = `"use client"

import { createSignal, createEffect, onCleanup } from '@barefootjs/dom'
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'

function CommandDialogDemo() {
  const [open, setOpen] = createSignal(false)

  createEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'j' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen(prev => !prev)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    onCleanup(() => document.removeEventListener('keydown', handleKeyDown))
  })

  return (
    <>
      <p className="text-sm text-muted-foreground">
        Press <kbd>⌘J</kbd> or click the button.
      </p>
      <button onClick={() => setOpen(true)}>
        Open Command Palette
      </button>
      <CommandDialog open={open()} onOpenChange={setOpen}>
        <CommandInput placeholder="Type a command or search..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Suggestions">
            <CommandItem>Calendar</CommandItem>
            <CommandItem>Search Emoji</CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Settings">
            <CommandItem>Profile<CommandShortcut>⌘P</CommandShortcut></CommandItem>
            <CommandItem>Settings<CommandShortcut>⌘S</CommandShortcut></CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  )
}`

const filterCode = `import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command'

function CommandFilterDemo() {
  // Prefix match: only show items starting with the search string
  const prefixFilter = (value: string, search: string) => {
    if (!search) return true
    return value.toLowerCase().startsWith(search.toLowerCase())
  }

  return (
    <Command filter={prefixFilter} class="rounded-lg border shadow-md">
      <CommandInput placeholder="Try prefix matching..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Fruits">
          <CommandItem value="Apple">Apple</CommandItem>
          <CommandItem value="Apricot">Apricot</CommandItem>
          <CommandItem value="Banana">Banana</CommandItem>
          <CommandItem value="Blueberry">Blueberry</CommandItem>
          <CommandItem value="Cherry">Cherry</CommandItem>
          <CommandItem value="Cranberry">Cranberry</CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  )
}`

// Props definitions
const commandProps: PropDefinition[] = [
  {
    name: 'filter',
    type: '(value: string, search: string, keywords?: string[]) => boolean',
    description: 'Custom filter function. Default is case-insensitive substring match.',
  },
  {
    name: 'onValueChange',
    type: '(value: string) => void',
    description: 'Callback when selected item changes.',
  },
]

const commandInputProps: PropDefinition[] = [
  {
    name: 'placeholder',
    type: 'string',
    description: 'Placeholder text for the search input.',
  },
  {
    name: 'disabled',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Whether the input is disabled.',
  },
]

const commandItemProps: PropDefinition[] = [
  {
    name: 'value',
    type: 'string',
    description: 'Value for filtering and selection. Defaults to textContent.',
  },
  {
    name: 'keywords',
    type: 'string[]',
    description: 'Additional keywords for search matching.',
  },
  {
    name: 'disabled',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Whether the item is disabled.',
  },
  {
    name: 'onSelect',
    type: '(value: string) => void',
    description: 'Callback when the item is selected.',
  },
]

const commandGroupProps: PropDefinition[] = [
  {
    name: 'heading',
    type: 'string',
    description: 'Heading text for the group.',
  },
]

const commandDialogProps: PropDefinition[] = [
  {
    name: 'open',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Whether the dialog is open.',
  },
  {
    name: 'onOpenChange',
    type: '(open: boolean) => void',
    description: 'Callback when the open state should change.',
  },
  {
    name: 'filter',
    type: '(value: string, search: string, keywords?: string[]) => boolean',
    description: 'Custom filter function passed to Command.',
  },
]

export function CommandRefPage() {
  return (
    <DocPage slug="command" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Command"
          description="A command menu with search, keyboard navigation, and filtering. Use it as an inline menu or inside a dialog for a command palette experience."
          {...getNavLinks('command')}
        />

        {/* Props Playground */}
        <CommandPlayground />

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="barefoot add command" />
        </Section>

        {/* Usage */}
        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <CommandPreviewDemo />
          </Example>
        </Section>

        {/* Examples */}
        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="Dialog" code={dialogCode}>
              <CommandDialogDemo />
            </Example>

            <Example title="Custom Filter" code={filterCode}>
              <CommandFilterDemo />
            </Example>
          </div>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">Command</h3>
              <PropsTable props={commandProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">CommandInput</h3>
              <PropsTable props={commandInputProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">CommandItem</h3>
              <PropsTable props={commandItemProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">CommandGroup</h3>
              <PropsTable props={commandGroupProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">CommandDialog</h3>
              <PropsTable props={commandDialogProps} />
            </div>
          </div>
        </Section>
      </div>
    </DocPage>
  )
}
