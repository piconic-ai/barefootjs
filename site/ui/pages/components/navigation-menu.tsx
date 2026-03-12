/**
 * Navigation Menu Reference Page (/components/navigation-menu)
 *
 * Focused developer reference with interactive Props Playground.
 * Part of the #515 page redesign initiative.
 */

import { NavigationMenuBasicDemo, NavigationMenuWithLinksDemo } from '@/components/navigation-menu-demo'
import { NavigationMenuPlayground } from '@/components/navigation-menu-playground'
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
  { id: 'with-links', title: 'With Links', branch: 'end' },
  { id: 'api-reference', title: 'API Reference' },
]

const usageCode = `"use client"

import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuTrigger,
  NavigationMenuContent,
  NavigationMenuLink,
} from '@/components/ui/navigation-menu'

function BasicNavigationMenu() {
  return (
    <NavigationMenu>
      <NavigationMenuList>
        <NavigationMenuItem value="getting-started">
          <NavigationMenuTrigger>Getting Started</NavigationMenuTrigger>
          <NavigationMenuContent className="w-[400px] md:w-[500px]">
            <ul className="grid gap-3 p-4 md:grid-cols-2">
              <li>
                <NavigationMenuLink href="/docs">
                  <div className="text-sm font-medium">Introduction</div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Learn the basics.
                  </p>
                </NavigationMenuLink>
              </li>
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  )
}`

const basicCode = `"use client"

import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuTrigger,
  NavigationMenuContent,
  NavigationMenuLink,
} from '@/components/ui/navigation-menu'

function BasicNavigationMenu() {
  return (
    <NavigationMenu>
      <NavigationMenuList>
        <NavigationMenuItem value="getting-started">
          <NavigationMenuTrigger>Getting Started</NavigationMenuTrigger>
          <NavigationMenuContent className="w-[400px] md:w-[500px]">
            <ul className="grid gap-3 p-4 md:grid-cols-2">
              <li>
                <NavigationMenuLink href="/docs">
                  <div className="text-sm font-medium">Introduction</div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Learn the basics.
                  </p>
                </NavigationMenuLink>
              </li>
              <li>
                <NavigationMenuLink href="/docs/installation">
                  <div className="text-sm font-medium">Installation</div>
                  <p className="text-sm text-muted-foreground mt-1">
                    How to install and configure.
                  </p>
                </NavigationMenuLink>
              </li>
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  )
}`

const withLinksCode = `"use client"

import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuTrigger,
  NavigationMenuContent,
  NavigationMenuLink,
} from '@/components/ui/navigation-menu'

function NavigationWithLinks() {
  return (
    <NavigationMenu>
      <NavigationMenuList>
        <NavigationMenuItem value="docs">
          <NavigationMenuTrigger>Documentation</NavigationMenuTrigger>
          <NavigationMenuContent className="w-[300px]">
            <ul className="grid gap-3 p-4">
              <li>
                <NavigationMenuLink href="/docs/intro">
                  <div className="text-sm font-medium">Introduction</div>
                </NavigationMenuLink>
              </li>
              <li>
                <NavigationMenuLink href="/docs/api" active={true}>
                  <div className="text-sm font-medium">API Reference</div>
                </NavigationMenuLink>
              </li>
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>

        <NavigationMenuItem>
          <NavigationMenuLink href="/blog"
            className="h-9 px-4 py-2 inline-flex items-center text-sm font-medium">
            Blog
          </NavigationMenuLink>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  )
}`

// Props definitions
const navigationMenuProps: PropDefinition[] = [
  {
    name: 'delayDuration',
    type: 'number',
    defaultValue: '200',
    description: 'Delay in ms before opening on hover.',
  },
  {
    name: 'closeDelay',
    type: 'number',
    defaultValue: '300',
    description: 'Delay in ms before closing after mouse leave.',
  },
]

const navigationMenuItemProps: PropDefinition[] = [
  {
    name: 'value',
    type: 'string',
    description: 'Unique identifier for this item. Required when using Trigger + Content.',
  },
]

const navigationMenuTriggerProps: PropDefinition[] = [
  {
    name: 'children',
    type: 'Child',
    description: 'Trigger label text.',
  },
]

const navigationMenuContentProps: PropDefinition[] = [
  {
    name: 'className',
    type: 'string',
    description: 'Additional CSS classes. Use to set width (e.g., "w-[400px]").',
  },
]

const navigationMenuLinkProps: PropDefinition[] = [
  {
    name: 'href',
    type: 'string',
    description: 'Link URL.',
  },
  {
    name: 'active',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Whether this link is the current page. Sets aria-current="page".',
  },
]

export function NavigationMenuRefPage() {
  return (
    <DocPage slug="navigation-menu" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Navigation Menu"
          description="A collection of links for navigating websites, with hover-activated content panels."
          {...getNavLinks('navigation-menu')}
        />

        {/* Props Playground */}
        <NavigationMenuPlayground />

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="barefoot add navigation-menu" />
        </Section>

        {/* Usage */}
        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <NavigationMenuBasicDemo />
          </Example>
        </Section>

        {/* Examples */}
        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="Basic" code={basicCode}>
              <NavigationMenuBasicDemo />
            </Example>
            <Example title="With Links" code={withLinksCode}>
              <NavigationMenuWithLinksDemo />
            </Example>
          </div>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-3">NavigationMenu</h3>
              <PropsTable props={navigationMenuProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-3">NavigationMenuList</h3>
              <p className="text-sm text-muted-foreground">Styled list wrapper. Renders as &lt;ul&gt;.</p>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-3">NavigationMenuItem</h3>
              <PropsTable props={navigationMenuItemProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-3">NavigationMenuTrigger</h3>
              <PropsTable props={navigationMenuTriggerProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-3">NavigationMenuContent</h3>
              <PropsTable props={navigationMenuContentProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-3">NavigationMenuLink</h3>
              <PropsTable props={navigationMenuLinkProps} />
            </div>
          </div>
        </Section>
      </div>
    </DocPage>
  )
}
