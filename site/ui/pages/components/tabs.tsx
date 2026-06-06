/**
 * Tabs Reference Page (/components/tabs)
 *
 * Focused developer reference with interactive Props Playground.
 * Part of the #515 page redesign initiative.
 */

import { TabsBasicDemo, TabsMultipleDemo, TabsDisabledDemo } from '@/components/tabs-demo'
import { TabsPlayground } from '@/components/tabs-playground'
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
  { id: 'multiple-tabs', title: 'Multiple Tabs', branch: 'child' },
  { id: 'disabled-tab', title: 'Disabled Tab', branch: 'end' },
  { id: 'api-reference', title: 'API Reference' },
]

const usageCode = `"use client"

import { createSignal, createMemo } from '@barefootjs/client'
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui/tabs'

function TabsDemo() {
  const [activeTab, setActiveTab] = createSignal('account')

  const isAccountSelected = createMemo(() => activeTab() === 'account')
  const isPasswordSelected = createMemo(() => activeTab() === 'password')

  return (
    <Tabs value={activeTab()}>
      <TabsList>
        <TabsTrigger
          value="account"
          selected={isAccountSelected()}
          onClick={() => setActiveTab('account')}
        >
          Account
        </TabsTrigger>
        <TabsTrigger
          value="password"
          selected={isPasswordSelected()}
          onClick={() => setActiveTab('password')}
        >
          Password
        </TabsTrigger>
      </TabsList>
      <TabsContent value="account" selected={isAccountSelected()}>
        Make changes to your account here.
      </TabsContent>
      <TabsContent value="password" selected={isPasswordSelected()}>
        Change your password here.
      </TabsContent>
    </Tabs>
  )
}`

const basicCode = `"use client"

import { createSignal, createMemo } from '@barefootjs/client'
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui/tabs'

function TabsBasic() {
  const [activeTab, setActiveTab] = createSignal('account')

  const isAccountSelected = createMemo(() => activeTab() === 'account')
  const isPasswordSelected = createMemo(() => activeTab() === 'password')

  return (
    <Tabs value={activeTab()}>
      <TabsList>
        <TabsTrigger
          value="account"
          selected={isAccountSelected()}
          onClick={() => setActiveTab('account')}
        >
          Account
        </TabsTrigger>
        <TabsTrigger
          value="password"
          selected={isPasswordSelected()}
          onClick={() => setActiveTab('password')}
        >
          Password
        </TabsTrigger>
      </TabsList>
      <TabsContent value="account" selected={isAccountSelected()}>
        Make changes to your account here.
      </TabsContent>
      <TabsContent value="password" selected={isPasswordSelected()}>
        Change your password here.
      </TabsContent>
    </Tabs>
  )
}`

const multipleTabsCode = `"use client"

import { createSignal, createMemo } from '@barefootjs/client'
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui/tabs'

function TabsMultiple() {
  const [activeTab, setActiveTab] = createSignal('overview')

  const isOverviewSelected = createMemo(() => activeTab() === 'overview')
  const isAnalyticsSelected = createMemo(() => activeTab() === 'analytics')
  const isReportsSelected = createMemo(() => activeTab() === 'reports')
  const isNotificationsSelected = createMemo(() => activeTab() === 'notifications')

  return (
    <Tabs value={activeTab()}>
      <TabsList>
        <TabsTrigger value="overview" selected={isOverviewSelected()} onClick={() => setActiveTab('overview')}>
          Overview
        </TabsTrigger>
        <TabsTrigger value="analytics" selected={isAnalyticsSelected()} onClick={() => setActiveTab('analytics')}>
          Analytics
        </TabsTrigger>
        <TabsTrigger value="reports" selected={isReportsSelected()} onClick={() => setActiveTab('reports')}>
          Reports
        </TabsTrigger>
        <TabsTrigger value="notifications" selected={isNotificationsSelected()} onClick={() => setActiveTab('notifications')}>
          Notifications
        </TabsTrigger>
      </TabsList>
      {/* TabsContent for each tab... */}
    </Tabs>
  )
}`

const disabledCode = `"use client"

import {
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'

function TabsDisabled() {
  return (
    <Tabs>
      <TabsList>
        <TabsTrigger value="enabled" selected>
          Enabled Tab
        </TabsTrigger>
        <TabsTrigger value="disabled" disabled>
          Disabled Tab
        </TabsTrigger>
      </TabsList>
    </Tabs>
  )
}`

const tabsProps: PropDefinition[] = [
  {
    name: 'value',
    type: 'string',
    description: 'The currently selected tab value.',
  },
  {
    name: 'defaultValue',
    type: 'string',
    description: 'The initial tab value when uncontrolled.',
  },
  {
    name: 'onValueChange',
    type: '(value: string) => void',
    description: 'Event handler called when the selected tab changes.',
  },
]

const tabsTriggerProps: PropDefinition[] = [
  {
    name: 'value',
    type: 'string',
    description: 'A unique value for the tab.',
  },
  {
    name: 'selected',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Whether the tab is currently selected.',
  },
  {
    name: 'disabled',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Whether the tab is disabled.',
  },
  {
    name: 'onClick',
    type: '() => void',
    description: 'Event handler called when the tab is clicked.',
  },
]

const tabsContentProps: PropDefinition[] = [
  {
    name: 'value',
    type: 'string',
    description: 'The value that associates the content with a trigger.',
  },
  {
    name: 'selected',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Whether the content is visible.',
  },
]

export function TabsRefPage() {
  return (
    <DocPage slug="tabs" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Tabs"
          description="A set of layered sections of content—known as tab panels—that are displayed one at a time."
          {...getNavLinks('tabs')}
        />

        {/* Props Playground */}
        <TabsPlayground />

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="@barefootjs/cli add tabs" />
        </Section>

        {/* Usage */}
        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <div className="w-full max-w-md">
              <TabsBasicDemo />
            </div>
          </Example>
        </Section>

        {/* Examples */}
        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="Basic" code={basicCode}>
              <div className="w-full max-w-md">
                <TabsBasicDemo />
              </div>
            </Example>

            <Example title="Multiple Tabs" code={multipleTabsCode}>
              <div className="w-full max-w-lg">
                <TabsMultipleDemo />
              </div>
            </Example>

            <Example title="Disabled Tab" code={disabledCode}>
              <div className="w-full max-w-md">
                <TabsDisabledDemo />
              </div>
            </Example>
          </div>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">Tabs</h3>
              <PropsTable props={tabsProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">TabsTrigger</h3>
              <PropsTable props={tabsTriggerProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">TabsContent</h3>
              <PropsTable props={tabsContentProps} />
            </div>
          </div>
        </Section>
      </div>
    </DocPage>
  )
}
