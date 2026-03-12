/**
 * Sidebar Reference Page (/components/sidebar)
 *
 * Focused developer reference with interactive Props Playground.
 * Migrated from /docs/components/sidebar.
 */

import { SidebarBasicDemo, SidebarCollapsibleGroupDemo, SidebarFloatingDemo } from '@/components/sidebar-demo'
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
  { id: 'installation', title: 'Installation' },
  { id: 'usage', title: 'Usage' },
  { id: 'examples', title: 'Examples' },
  { id: 'basic', title: 'Basic', branch: 'start' },
  { id: 'collapsible-groups', title: 'Collapsible Groups', branch: 'child' },
  { id: 'floating', title: 'Floating', branch: 'end' },
  { id: 'api-reference', title: 'API Reference' },
]

const previewCode = `"use client"

import {
  Sidebar, SidebarContent, SidebarGroup,
  SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarInset, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarProvider, SidebarTrigger,
} from '@/components/ui/sidebar'

function SidebarDemo() {
  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>...</SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Navigation</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive>Home</SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <header><SidebarTrigger /></header>
        <main>Content</main>
      </SidebarInset>
    </SidebarProvider>
  )
}`

const usageCode = `import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup,
  SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarInset, SidebarMenu, SidebarMenuBadge,
  SidebarMenuButton, SidebarMenuItem, SidebarMenuSub,
  SidebarMenuSubButton, SidebarMenuSubItem, SidebarProvider,
  SidebarSeparator, SidebarTrigger,
} from '@/components/ui/sidebar'`

const basicCode = `"use client"

import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup,
  SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarInset, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarProvider, SidebarSeparator,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { SettingsIcon } from '@/components/ui/icon'

function SidebarBasic() {
  return (
    <div className="h-[400px] overflow-hidden rounded-lg border">
      <SidebarProvider>
        <Sidebar>
          <SidebarHeader>
            <div className="flex items-center gap-2 px-2 py-1">
              <div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold">A</div>
              <span className="text-sm font-semibold">Acme Inc</span>
            </div>
          </SidebarHeader>
          <SidebarSeparator />
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Navigation</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton isActive>Home</SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton>Projects</SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton>Inbox</SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton>
                      <SettingsIcon size="sm" />
                      <span>Settings</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <div className="flex items-center gap-2 px-2 py-1 text-sm text-muted-foreground">
              <div className="size-6 rounded-full bg-muted" />
              <span>john@acme.com</span>
            </div>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset>
          <header className="flex h-12 items-center gap-2 border-b px-4">
            <SidebarTrigger />
            <span className="text-sm font-medium">Dashboard</span>
          </header>
          <div className="flex-1 p-4">
            <p className="text-sm text-muted-foreground">
              Main content area. Toggle sidebar with the button or Ctrl+B.
            </p>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}`

const collapsibleCode = `"use client"

import { createSignal } from '@barefootjs/dom'
import {
  Sidebar, SidebarContent, SidebarGroup,
  SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarInset, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton,
  SidebarMenuSubItem, SidebarProvider, SidebarTrigger,
} from '@/components/ui/sidebar'
import {
  Collapsible, CollapsibleTrigger, CollapsibleContent,
} from '@/components/ui/collapsible'
import { ChevronRightIcon } from '@/components/ui/icon'

function SidebarCollapsible() {
  const [open, setOpen] = createSignal(true)

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Platform</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <Collapsible open={open()} onOpenChange={setOpen} className="group/collapsible">
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton>
                        Dashboard
                        <ChevronRightIcon size="sm" className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton isActive>Overview</SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton>Analytics</SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <header><SidebarTrigger /></header>
      </SidebarInset>
    </SidebarProvider>
  )
}`

const floatingCode = `"use client"

import {
  Sidebar, SidebarContent, SidebarGroup,
  SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarInset, SidebarMenu, SidebarMenuBadge,
  SidebarMenuButton, SidebarMenuItem, SidebarMenuAction,
  SidebarProvider, SidebarTrigger,
} from '@/components/ui/sidebar'

function SidebarFloating() {
  return (
    <div className="h-[400px] overflow-hidden rounded-lg border bg-muted/30">
      <SidebarProvider>
        <Sidebar variant="floating">
          <SidebarHeader>
            <div className="flex items-center gap-2 px-2 py-1">
              <div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold">S</div>
              <span className="text-sm font-semibold">Slack</span>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Channels</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton isActive>
                      <span>#</span><span>general</span>
                    </SidebarMenuButton>
                    <SidebarMenuBadge>12</SidebarMenuBadge>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton>
                      <span>#</span><span>engineering</span>
                    </SidebarMenuButton>
                    <SidebarMenuBadge>3</SidebarMenuBadge>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
        <SidebarInset>
          <header><SidebarTrigger /></header>
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}`

// Props definitions
const sidebarProviderProps: PropDefinition[] = [
  {
    name: 'defaultOpen',
    type: 'boolean',
    defaultValue: 'true',
    description: 'The default open state of the sidebar.',
  },
  {
    name: 'open',
    type: 'boolean',
    description: 'The controlled open state of the sidebar.',
  },
  {
    name: 'onOpenChange',
    type: '(open: boolean) => void',
    description: 'Callback when the sidebar open state changes.',
  },
]

const sidebarProps: PropDefinition[] = [
  {
    name: 'side',
    type: "'left' | 'right'",
    defaultValue: "'left'",
    description: 'Which side of the viewport the sidebar appears on.',
  },
  {
    name: 'variant',
    type: "'sidebar' | 'floating' | 'inset'",
    defaultValue: "'sidebar'",
    description: 'Visual variant. "floating" has rounded corners and shadow. "inset" insets the main content.',
  },
  {
    name: 'collapsible',
    type: "'offcanvas' | 'icon' | 'none'",
    defaultValue: "'offcanvas'",
    description: 'Collapse behavior. "offcanvas" slides completely off. "icon" shrinks to icon width. "none" always visible.',
  },
]

const sidebarMenuButtonProps: PropDefinition[] = [
  {
    name: 'variant',
    type: "'default' | 'outline'",
    defaultValue: "'default'",
    description: 'Visual variant of the menu button.',
  },
  {
    name: 'size',
    type: "'default' | 'sm' | 'lg'",
    defaultValue: "'default'",
    description: 'Size of the menu button.',
  },
  {
    name: 'isActive',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Whether the menu item is currently active.',
  },
  {
    name: 'tooltip',
    type: 'string',
    description: 'Tooltip text shown when sidebar is collapsed to icon mode.',
  },
]

export function SidebarRefPage() {
  return (
    <DocPage slug="sidebar" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Sidebar"
          description="A composable, collapsible sidebar component with responsive mobile support."
          {...getNavLinks('sidebar')}
        />

        {/* Preview */}
        <Example title="" code={previewCode}>
          <SidebarBasicDemo />
        </Example>

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="barefoot add sidebar" />
        </Section>

        {/* Usage */}
        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <span />
          </Example>
        </Section>

        {/* Examples */}
        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="Basic" code={basicCode}>
              <SidebarBasicDemo />
            </Example>

            <Example title="Collapsible Groups" code={collapsibleCode}>
              <SidebarCollapsibleGroupDemo />
            </Example>

            <Example title="Floating" code={floatingCode}>
              <SidebarFloatingDemo />
            </Example>
          </div>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">SidebarProvider</h3>
              <PropsTable props={sidebarProviderProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">Sidebar</h3>
              <PropsTable props={sidebarProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">SidebarMenuButton</h3>
              <PropsTable props={sidebarMenuButtonProps} />
            </div>
          </div>
        </Section>
      </div>
    </DocPage>
  )
}
