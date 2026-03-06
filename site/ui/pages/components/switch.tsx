/**
 * Switch Reference Page (/components/switch)
 *
 * Focused developer reference with interactive Props Playground.
 * Part of the #515 page redesign initiative.
 */

import { Switch } from '@/components/ui/switch'
import { SwitchPlayground } from '@/components/switch-playground'
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
  { id: 'api-reference', title: 'API Reference' },
]

const usageCode = `"use client"

import { createSignal } from "@barefootjs/dom"
import { Switch } from "@/components/ui/switch"

function SwitchDemo() {
  const [enabled, setEnabled] = createSignal(false)

  return (
    <div className="space-y-3">
      <div className="flex items-center space-x-2">
        <Switch />
        <span className="text-sm font-medium leading-none">Airplane Mode</span>
      </div>
      <div className="flex items-center space-x-2">
        <Switch defaultChecked />
        <span className="text-sm font-medium leading-none">Wi-Fi</span>
      </div>
      <div className="flex items-center space-x-2 opacity-50">
        <Switch disabled />
        <span className="text-sm font-medium leading-none">Unavailable option</span>
      </div>
      <div className="flex items-center space-x-2">
        <Switch checked={enabled()} onCheckedChange={setEnabled} />
        <span className="text-sm font-medium leading-none">Controlled switch</span>
      </div>
    </div>
  )
}`

const switchProps: PropDefinition[] = [
  {
    name: 'defaultChecked',
    type: 'boolean',
    defaultValue: 'false',
    description: 'The initial checked state for uncontrolled mode.',
  },
  {
    name: 'checked',
    type: 'boolean',
    description: 'The controlled checked state of the switch. When provided, the component is in controlled mode.',
  },
  {
    name: 'disabled',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Whether the switch is disabled.',
  },
  {
    name: 'onCheckedChange',
    type: '(checked: boolean) => void',
    description: 'Event handler called when the switch state changes.',
  },
]

export function SwitchRefPage() {
  return (
    <DocPage slug="switch" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Switch"
          description="A control that allows the user to toggle between checked and not checked."
          {...getNavLinks('switch')}
        />

        {/* Props Playground */}
        <SwitchPlayground />

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="barefoot add switch" />
        </Section>

        {/* Usage */}
        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Switch />
                <span className="text-sm font-medium leading-none">Airplane Mode</span>
              </div>
              <div className="flex items-center space-x-2">
                <Switch defaultChecked />
                <span className="text-sm font-medium leading-none">Wi-Fi</span>
              </div>
              <div className="flex items-center space-x-2 opacity-50">
                <Switch disabled />
                <span className="text-sm font-medium leading-none">Unavailable option</span>
              </div>
            </div>
          </Example>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <PropsTable props={switchProps} />
        </Section>
      </div>
    </DocPage>
  )
}
