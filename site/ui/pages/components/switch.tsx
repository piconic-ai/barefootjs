/**
 * Switch Reference Page (/components/switch)
 *
 * Focused developer reference with interactive Props Playground.
 * Part of the #515 page redesign initiative.
 */

import { Switch } from '@/components/ui/switch'
import { SwitchPlayground } from '@/components/switch-playground'
import {
  SwitchConsentDemo,
  SwitchFormDemo,
  SwitchNotificationDemo,
} from '@/components/switch-demo'
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
  { id: 'consent', title: 'Consent', branch: 'start' },
  { id: 'form', title: 'Form', branch: 'child' },
  { id: 'notification-preferences', title: 'Notification Preferences', branch: 'end' },
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

const consentCode = `"use client"

import { createSignal } from "@barefootjs/dom"
import { Switch } from "@/components/ui/switch"

export function SwitchConsentDemo() {
  const [accepted, setAccepted] = createSignal(false)

  const handleLabelClick = () => {
    setAccepted(!accepted())
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start space-x-2">
        <Switch checked={accepted()} onCheckedChange={setAccepted} class="mt-px" />
        <div
          className="grid gap-1.5 leading-none cursor-pointer select-none"
          onClick={handleLabelClick}
        >
          <span className="text-sm font-medium leading-none">
            Accept analytics cookies
          </span>
          <p className="text-sm text-muted-foreground">
            Help us improve by allowing anonymous usage data collection.
          </p>
        </div>
      </div>
      <button
        className="inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
        disabled={!accepted()}
      >
        Save preferences
      </button>
    </div>
  )
}`

const formCode = `"use client"

import { createSignal } from "@barefootjs/dom"
import { Switch } from "@/components/ui/switch"

export function SwitchFormDemo() {
  const [push, setPush] = createSignal(true)
  const [emailDigest, setEmailDigest] = createSignal(false)
  const [marketing, setMarketing] = createSignal(false)

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        <h4 className="text-sm font-medium leading-none">Notifications</h4>
        <p className="text-sm text-muted-foreground">
          Configure how you receive notifications.
        </p>
        <div className="flex flex-col space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium leading-none">Push notifications</span>
            <Switch checked={push()} onCheckedChange={setPush} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium leading-none">Email digest</span>
            <Switch checked={emailDigest()} onCheckedChange={setEmailDigest} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium leading-none">Marketing emails</span>
            <Switch checked={marketing()} onCheckedChange={setMarketing} />
          </div>
        </div>
      </div>
      <div className="text-sm text-muted-foreground pt-2 border-t">
        Enabled: {[push() && 'Push notifications', emailDigest() && 'Email digest', marketing() && 'Marketing emails']
          .filter(Boolean).join(', ') || 'None'}
      </div>
    </div>
  )
}`

const notificationCode = `"use client"

import { createSignal, createMemo } from "@barefootjs/dom"
import { Switch } from "@/components/ui/switch"

const channels = [
  { id: 0, name: 'Email', description: 'Receive notifications via email' },
  { id: 1, name: 'Push', description: 'Browser push notifications' },
  { id: 2, name: 'SMS', description: 'Text message alerts' },
]

export function SwitchNotificationDemo() {
  const [enabled, setEnabled] = createSignal(channels.map(() => false))

  const enabledCount = createMemo(() => enabled().filter(Boolean).length)
  const isAllEnabled = createMemo(() => enabledCount() === channels.length)
  const selectionLabel = createMemo(() =>
    enabledCount() > 0 ? \`\${enabledCount()} enabled\` : 'Enable all'
  )

  const toggleChannel = (index: number) => {
    setEnabled(prev => prev.map((v, i) => i === index ? !v : v))
  }

  const toggleAll = (value: boolean) => {
    setEnabled(prev => prev.map(() => value))
  }

  return (
    <div className="w-full max-w-md">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <div className="flex items-center gap-3">
          <Switch checked={isAllEnabled()} onCheckedChange={toggleAll} />
          <span className="text-sm text-muted-foreground">{selectionLabel()}</span>
        </div>
      </div>
      <div className="divide-y border-x border-b rounded-b-md">
        {channels.map((channel) => (
          <div key={channel.id} className="flex items-center justify-between px-3 py-3">
            <div className="space-y-0.5">
              <span className="text-sm font-medium">{channel.name}</span>
              <p className="text-xs text-muted-foreground">{channel.description}</p>
            </div>
            <Switch checked={enabled()[channel.id]} onCheckedChange={() => toggleChannel(channel.id)} />
          </div>
        ))}
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

        {/* Examples */}
        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="Consent" code={consentCode}>
              <SwitchConsentDemo />
            </Example>

            <Example title="Form" code={formCode}>
              <SwitchFormDemo />
            </Example>

            <Example title="Notification Preferences" code={notificationCode}>
              <SwitchNotificationDemo />
            </Example>
          </div>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <PropsTable props={switchProps} />
        </Section>
      </div>
    </DocPage>
  )
}
