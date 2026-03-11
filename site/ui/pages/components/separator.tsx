/**
 * Separator Reference Page (/components/separator)
 *
 * Focused developer reference with interactive Props Playground.
 * Part of the #515 page redesign initiative.
 */

import { Separator } from '@/components/ui/separator'
import { SeparatorPlayground } from '@/components/separator-playground'
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
  { id: 'horizontal', title: 'Horizontal', branch: 'start' },
  { id: 'vertical', title: 'Vertical', branch: 'child' },
  { id: 'menu', title: 'Menu', branch: 'child' },
  { id: 'list', title: 'List', branch: 'end' },
  { id: 'api-reference', title: 'API Reference' },
]

const horizontalCode = `import { Separator } from "@/components/ui/separator"

function SeparatorHorizontal() {
  return (
    <div>
      <div className="space-y-1">
        <h4 className="text-sm font-medium leading-none">BarefootJS</h4>
        <p className="text-sm text-muted-foreground">An open-source UI component library.</p>
      </div>
      <Separator className="my-4" />
      <div className="flex h-5 items-center space-x-4 text-sm">
        <div>Docs</div>
        <Separator orientation="vertical" />
        <div>Source</div>
        <Separator orientation="vertical" />
        <div>Blog</div>
      </div>
    </div>
  )
}`

const verticalCode = `import { Separator } from "@/components/ui/separator"

function SeparatorVertical() {
  return (
    <div className="flex h-5 items-center space-x-4 text-sm">
      <div>Docs</div>
      <Separator orientation="vertical" />
      <div>Source</div>
      <Separator orientation="vertical" />
      <div>Blog</div>
    </div>
  )
}`

const menuCode = `import { Separator } from "@/components/ui/separator"

function SeparatorMenu() {
  return (
    <div className="w-48 rounded-md border border-border p-1">
      <div className="px-2 py-1.5 text-sm font-semibold">My Account</div>
      <Separator className="my-1" />
      <div className="px-2 py-1.5 text-sm">Profile</div>
      <div className="px-2 py-1.5 text-sm">Settings</div>
      <div className="px-2 py-1.5 text-sm">Billing</div>
      <Separator className="my-1" />
      <div className="px-2 py-1.5 text-sm">Log out</div>
    </div>
  )
}`

const listCode = `import { Separator } from "@/components/ui/separator"

function SeparatorList() {
  return (
    <div className="w-full max-w-md">
      <div className="flex items-center justify-between py-3">
        <span className="text-sm font-medium">Notifications</span>
        <span className="text-sm text-muted-foreground">On</span>
      </div>
      <Separator />
      <div className="flex items-center justify-between py-3">
        <span className="text-sm font-medium">Sound</span>
        <span className="text-sm text-muted-foreground">Default</span>
      </div>
      <Separator />
      <div className="flex items-center justify-between py-3">
        <span className="text-sm font-medium">Language</span>
        <span className="text-sm text-muted-foreground">English</span>
      </div>
    </div>
  )
}`

const usageCode = `import { Separator } from "@/components/ui/separator"

function SeparatorDemo() {
  return (
    <div>
      <div className="space-y-1">
        <h4 className="text-sm font-medium leading-none">BarefootJS</h4>
        <p className="text-sm text-muted-foreground">An open-source UI component library.</p>
      </div>
      <Separator className="my-4" />
      <div className="flex h-5 items-center space-x-4 text-sm">
        <div>Docs</div>
        <Separator orientation="vertical" />
        <div>Source</div>
        <Separator orientation="vertical" />
        <div>Blog</div>
      </div>
    </div>
  )
}`

const separatorProps: PropDefinition[] = [
  {
    name: 'orientation',
    type: "'horizontal' | 'vertical'",
    defaultValue: "'horizontal'",
    description: 'The orientation of the separator.',
  },
  {
    name: 'decorative',
    type: 'boolean',
    defaultValue: 'true',
    description: 'When true, renders with role="none" (purely visual). When false, renders with role="separator" for accessibility.',
  },
  {
    name: 'className',
    type: 'string',
    defaultValue: "''",
    description: 'Additional CSS classes to apply.',
  },
]

export function SeparatorRefPage() {
  return (
    <DocPage slug="separator" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Separator"
          description="Visually or semantically separates content."
          {...getNavLinks('separator')}
        />

        {/* Props Playground */}
        <SeparatorPlayground />

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="barefoot add separator" />
        </Section>

        {/* Usage */}
        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <div className="w-full max-w-sm">
              <div className="space-y-1">
                <h4 className="text-sm font-medium leading-none">BarefootJS</h4>
                <p className="text-sm text-muted-foreground">An open-source UI component library.</p>
              </div>
              <Separator className="my-4" />
              <div className="flex h-5 items-center space-x-4 text-sm">
                <div>Docs</div>
                <Separator orientation="vertical" />
                <div>Source</div>
                <Separator orientation="vertical" />
                <div>Blog</div>
              </div>
            </div>
          </Example>
        </Section>

        {/* Examples */}
        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="Horizontal" code={horizontalCode}>
              <div className="w-full max-w-sm">
                <div className="space-y-1">
                  <h4 className="text-sm font-medium leading-none">BarefootJS</h4>
                  <p className="text-sm text-muted-foreground">An open-source UI component library.</p>
                </div>
                <Separator className="my-4" />
                <div className="flex h-5 items-center space-x-4 text-sm">
                  <div>Docs</div>
                  <Separator orientation="vertical" />
                  <div>Source</div>
                  <Separator orientation="vertical" />
                  <div>Blog</div>
                </div>
              </div>
            </Example>

            <Example title="Vertical" code={verticalCode}>
              <div className="flex h-5 items-center space-x-4 text-sm">
                <div>Docs</div>
                <Separator orientation="vertical" />
                <div>Source</div>
                <Separator orientation="vertical" />
                <div>Blog</div>
              </div>
            </Example>

            <Example title="Menu" code={menuCode}>
              <div className="w-48 rounded-md border border-border p-1">
                <div className="px-2 py-1.5 text-sm font-semibold">My Account</div>
                <Separator className="my-1" />
                <div className="px-2 py-1.5 text-sm">Profile</div>
                <div className="px-2 py-1.5 text-sm">Settings</div>
                <div className="px-2 py-1.5 text-sm">Billing</div>
                <Separator className="my-1" />
                <div className="px-2 py-1.5 text-sm">Log out</div>
              </div>
            </Example>

            <Example title="List" code={listCode}>
              <div className="w-full max-w-md">
                <div className="flex items-center justify-between py-3">
                  <span className="text-sm font-medium">Notifications</span>
                  <span className="text-sm text-muted-foreground">On</span>
                </div>
                <Separator />
                <div className="flex items-center justify-between py-3">
                  <span className="text-sm font-medium">Sound</span>
                  <span className="text-sm text-muted-foreground">Default</span>
                </div>
                <Separator />
                <div className="flex items-center justify-between py-3">
                  <span className="text-sm font-medium">Language</span>
                  <span className="text-sm text-muted-foreground">English</span>
                </div>
              </div>
            </Example>
          </div>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <PropsTable props={separatorProps} />
        </Section>
      </div>
    </DocPage>
  )
}
