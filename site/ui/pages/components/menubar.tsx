/**
 * Menubar Reference Page (/components/menubar)
 *
 * Focused developer reference with interactive Props Playground.
 * Migrated from /docs/components/menubar.
 */

import { MenubarBasicDemo, MenubarApplicationDemo } from '@/components/menubar-demo'
import { MenubarPlayground } from '@/components/menubar-playground'
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
  { id: 'application', title: 'Application', branch: 'end' },
  { id: 'accessibility', title: 'Accessibility' },
  { id: 'api-reference', title: 'API Reference' },
]

const usageCode = `import {
  Menubar,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarShortcut,
} from '@/components/ui/menubar'`

const basicCode = `"use client"

import {
  Menubar,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarShortcut,
} from '@/components/ui/menubar'

function BasicMenubar() {
  return (
    <Menubar>
      <MenubarMenu value="file">
        <MenubarTrigger>File</MenubarTrigger>
        <MenubarContent>
          <MenubarItem>
            <span>New Tab</span>
            <MenubarShortcut>⌘T</MenubarShortcut>
          </MenubarItem>
          <MenubarItem>
            <span>New Window</span>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem>
            <span>Print</span>
            <MenubarShortcut>⌘P</MenubarShortcut>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu value="edit">
        <MenubarTrigger>Edit</MenubarTrigger>
        <MenubarContent>
          <MenubarItem>
            <span>Undo</span>
            <MenubarShortcut>⌘Z</MenubarShortcut>
          </MenubarItem>
          <MenubarItem>
            <span>Redo</span>
            <MenubarShortcut>⇧⌘Z</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem><span>Cut</span></MenubarItem>
          <MenubarItem><span>Copy</span></MenubarItem>
          <MenubarItem><span>Paste</span></MenubarItem>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  )
}`

const applicationCode = `"use client"

import { createSignal } from '@barefootjs/dom'
import {
  Menubar,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarCheckboxItem,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent,
  MenubarSeparator,
  MenubarShortcut,
} from '@/components/ui/menubar'

function AppMenubar() {
  const [showBookmarks, setShowBookmarks] = createSignal(true)
  const [showFullUrls, setShowFullUrls] = createSignal(false)
  const [profile, setProfile] = createSignal('benoit')

  return (
    <Menubar>
      <MenubarMenu value="file">
        <MenubarTrigger>File</MenubarTrigger>
        <MenubarContent>
          <MenubarItem>
            <span>New Tab</span>
            <MenubarShortcut>⌘T</MenubarShortcut>
          </MenubarItem>
          <MenubarItem>
            <span>New Window</span>
            <MenubarShortcut>⌘N</MenubarShortcut>
          </MenubarItem>
          <MenubarItem disabled={true}>
            <span>New Incognito Window</span>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarSub>
            <MenubarSubTrigger>
              <span>Share</span>
            </MenubarSubTrigger>
            <MenubarSubContent>
              <MenubarItem><span>Email</span></MenubarItem>
              <MenubarItem><span>Messages</span></MenubarItem>
              <MenubarItem><span>Notes</span></MenubarItem>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSeparator />
          <MenubarItem>
            <span>Print...</span>
            <MenubarShortcut>⌘P</MenubarShortcut>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu value="view">
        <MenubarTrigger>View</MenubarTrigger>
        <MenubarContent>
          <MenubarCheckboxItem
            checked={showBookmarks()}
            onCheckedChange={setShowBookmarks}
          >
            <span>Always Show Bookmarks Bar</span>
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={showFullUrls()}
            onCheckedChange={setShowFullUrls}
          >
            <span>Always Show Full URLs</span>
          </MenubarCheckboxItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu value="profiles">
        <MenubarTrigger>Profiles</MenubarTrigger>
        <MenubarContent>
          <MenubarRadioGroup
            value={profile()}
            onValueChange={setProfile}
          >
            <MenubarRadioItem value="andy">
              <span>Andy</span>
            </MenubarRadioItem>
            <MenubarRadioItem value="benoit">
              <span>Benoit</span>
            </MenubarRadioItem>
            <MenubarRadioItem value="luis">
              <span>Luis</span>
            </MenubarRadioItem>
          </MenubarRadioGroup>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  )
}`

const menubarProps: PropDefinition[] = [
  {
    name: 'class',
    type: 'string',
    description: 'Additional CSS classes for the menubar container.',
  },
]

const menubarMenuProps: PropDefinition[] = [
  {
    name: 'value',
    type: 'string',
    description: 'Unique identifier for this menu. Auto-generated if not provided.',
  },
]

const menubarTriggerProps: PropDefinition[] = [
  {
    name: 'children',
    type: 'Child',
    description: 'Trigger label text.',
  },
]

const menubarContentProps: PropDefinition[] = [
  {
    name: 'align',
    type: "'start' | 'end'",
    defaultValue: "'start'",
    description: 'Alignment relative to the trigger element.',
  },
]

const menubarItemProps: PropDefinition[] = [
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

const menubarCheckboxItemProps: PropDefinition[] = [
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

const menubarRadioGroupProps: PropDefinition[] = [
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

const menubarRadioItemProps: PropDefinition[] = [
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

const menubarSubTriggerProps: PropDefinition[] = [
  {
    name: 'disabled',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Whether the sub trigger is disabled.',
  },
]

const menubarShortcutProps: PropDefinition[] = [
  {
    name: 'children',
    type: 'Child',
    description: 'The keyboard shortcut text (e.g., "⌘T").',
  },
]

export function MenubarRefPage() {
  return (
    <DocPage slug="menubar" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Menubar"
          description="A visually persistent menu common in desktop applications."
          {...getNavLinks('menubar')}
        />

        {/* Props Playground */}
        <MenubarPlayground />

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="barefoot add menubar" />
        </Section>

        {/* Usage */}
        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <MenubarBasicDemo />
          </Example>
        </Section>

        {/* Examples */}
        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="Basic" code={basicCode}>
              <MenubarBasicDemo />
            </Example>

            <Example title="Application" code={applicationCode}>
              <MenubarApplicationDemo />
            </Example>
          </div>
        </Section>

        {/* Accessibility */}
        <Section id="accessibility" title="Accessibility">
          <ul className="list-disc list-inside space-y-2 text-muted-foreground">
            <li><strong className="text-foreground">Roving Hover</strong> - When one menu is open, hovering another trigger opens it</li>
            <li><strong className="text-foreground">Keyboard Navigation</strong> - ArrowLeft/Right navigates between menus, ArrowDown/Up within menus</li>
            <li><strong className="text-foreground">Submenu Support</strong> - Nested submenus with hover and keyboard navigation</li>
            <li><strong className="text-foreground">ARIA</strong> - Triggers use aria-haspopup, aria-expanded; Items use appropriate roles (menuitem, menuitemcheckbox, menuitemradio)</li>
            <li><strong className="text-foreground">Disabled State</strong> - aria-disabled on disabled items, skipped in keyboard navigation</li>
          </ul>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">Menubar</h3>
              <PropsTable props={menubarProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">MenubarMenu</h3>
              <PropsTable props={menubarMenuProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">MenubarTrigger</h3>
              <PropsTable props={menubarTriggerProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">MenubarContent</h3>
              <PropsTable props={menubarContentProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">MenubarItem</h3>
              <PropsTable props={menubarItemProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">MenubarCheckboxItem</h3>
              <PropsTable props={menubarCheckboxItemProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">MenubarRadioGroup</h3>
              <PropsTable props={menubarRadioGroupProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">MenubarRadioItem</h3>
              <PropsTable props={menubarRadioItemProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">MenubarSub</h3>
              <p className="text-sm text-muted-foreground">Submenu container. Manages sub-open state internally. Wrap SubTrigger and SubContent.</p>
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">MenubarSubTrigger</h3>
              <PropsTable props={menubarSubTriggerProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">MenubarSubContent</h3>
              <p className="text-sm text-muted-foreground">Content container for submenu items. Positioned to the right of the trigger.</p>
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">MenubarLabel</h3>
              <p className="text-sm text-muted-foreground">Section label inside the menu.</p>
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">MenubarSeparator</h3>
              <p className="text-sm text-muted-foreground">Visual separator between menu item groups.</p>
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">MenubarShortcut</h3>
              <PropsTable props={menubarShortcutProps} />
            </div>
          </div>
        </Section>
      </div>
    </DocPage>
  )
}
