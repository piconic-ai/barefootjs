/**
 * Checkbox Reference Page (/components/checkbox)
 *
 * Focused developer reference with interactive Props Playground.
 * Part of the #515 page redesign initiative.
 */

import { Checkbox } from '@/components/ui/checkbox'
import { CheckboxPlayground } from '@/components/checkbox-playground'
import {
  CheckboxBasicDemo,
  CheckboxTermsDemo,
  CheckboxFormDemo,
  CheckboxEmailListDemo,
} from '@/components/checkbox-demo'
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
  { id: 'terms', title: 'Terms', branch: 'child' },
  { id: 'form', title: 'Form', branch: 'child' },
  { id: 'email-list', title: 'Email List', branch: 'end' },
  { id: 'api-reference', title: 'API Reference' },
]

const basicCode = `import { Checkbox } from "@/components/ui/checkbox"

export function CheckboxBasicDemo() {
  return (
    <div className="space-y-3">
      <div className="flex items-center space-x-2">
        <Checkbox />
        <span className="text-sm font-medium leading-none">
          Remember me
        </span>
      </div>
      <div className="flex items-center space-x-2">
        <Checkbox defaultChecked />
        <span className="text-sm font-medium leading-none">
          Subscribe to newsletter
        </span>
      </div>
      <div className="flex items-center space-x-2 opacity-50">
        <Checkbox disabled />
        <span className="text-sm font-medium leading-none">
          Unavailable option
        </span>
      </div>
    </div>
  )
}`

const termsCode = `"use client"

import { createSignal } from "@barefootjs/dom"
import { Checkbox } from "@/components/ui/checkbox"

export function CheckboxTermsDemo() {
  const [accepted, setAccepted] = createSignal(false)

  const handleLabelClick = () => {
    setAccepted(!accepted())
  }

  return (
    <div className="space-y-4">
      <div className="items-top flex space-x-2">
        <Checkbox checked={accepted()} onCheckedChange={setAccepted} />
        <div
          className="grid gap-1.5 leading-none cursor-pointer select-none"
          onClick={handleLabelClick}
        >
          <span className="text-sm font-medium leading-none">
            I agree to the terms and conditions
          </span>
          <p className="text-sm text-muted-foreground">
            By checking this box, you agree to our Terms of Service.
          </p>
        </div>
      </div>
      <button
        className="inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
        disabled={!accepted()}
      >
        Continue
      </button>
    </div>
  )
}`

const formCode = `"use client"

import { createSignal } from "@barefootjs/dom"
import { Checkbox } from "@/components/ui/checkbox"

export function CheckboxFormDemo() {
  const [mobile, setMobile] = createSignal(false)
  const [desktop, setDesktop] = createSignal(true)
  const [email, setEmail] = createSignal(false)

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        <h4 className="text-sm font-medium leading-none">Sidebar</h4>
        <p className="text-sm text-muted-foreground">
          Select the items you want to display in the sidebar.
        </p>
        <div className="flex flex-col space-y-3">
          <div className="flex items-center space-x-2">
            <Checkbox checked={mobile()} onCheckedChange={setMobile} />
            <span className="text-sm font-medium leading-none">Mobile</span>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox checked={desktop()} onCheckedChange={setDesktop} />
            <span className="text-sm font-medium leading-none">Desktop</span>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox checked={email()} onCheckedChange={setEmail} />
            <span className="text-sm font-medium leading-none">Email notifications</span>
          </div>
        </div>
      </div>
      <div className="text-sm text-muted-foreground pt-2 border-t">
        Selected: {[mobile() && 'Mobile', desktop() && 'Desktop', email() && 'Email']
          .filter(Boolean).join(', ') || 'None'}
      </div>
    </div>
  )
}`

const emailListCode = `"use client"

import { createSignal, createMemo } from "@barefootjs/dom"
import { Checkbox } from "@/components/ui/checkbox"

const emails = [
  { id: 0, from: 'John Smith', subject: 'Meeting tomorrow - Let\\'s discuss the Q4 planning', time: '10:30 AM', unread: true },
  { id: 1, from: 'Dev Team', subject: 'Project update - Sprint review notes attached', time: '9:15 AM', unread: false },
  { id: 2, from: 'Billing Dept', subject: 'Invoice #1234 - Payment due in 30 days', time: 'Yesterday', unread: true },
]

export function CheckboxEmailListDemo() {
  // Array-based state management with immutable updates
  const [checked, setChecked] = createSignal(emails.map(() => false))

  const selectedCount = createMemo(() => checked().filter(Boolean).length)
  const isAllSelected = createMemo(() => selectedCount() === emails.length)
  const selectionLabel = createMemo(() =>
    selectedCount() > 0 ? \\\`\\\${selectedCount()} selected\\\` : 'Select all'
  )

  // Immutable update pattern for toggling individual email
  const toggleEmail = (index: number) => {
    setChecked(prev => prev.map((v, i) => i === index ? !v : v))
  }

  // Immutable update pattern for toggling all emails
  const toggleAll = (value: boolean) => {
    setChecked(prev => prev.map(() => value))
  }

  return (
    <div className="w-full max-w-2xl">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <div className="flex items-center gap-3">
          <Checkbox checked={isAllSelected()} onCheckedChange={toggleAll} />
          <span className="text-sm text-muted-foreground">{selectionLabel()}</span>
        </div>
        {selectedCount() > 0 && (
          <span className="text-sm text-primary cursor-pointer hover:underline">
            Mark as read
          </span>
        )}
      </div>
      <div className="divide-y border-x border-b rounded-b-md">
        {emails.map((email) => (
          <div key={email.id} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer">
            <Checkbox checked={checked()[email.id]} onCheckedChange={() => toggleEmail(email.id)} />
            <span className={\\\`text-sm w-32 truncate \\\${email.unread ? 'font-medium' : ''}\\\`}>{email.from}</span>
            <span className={\\\`text-sm truncate flex-1 \\\${email.unread ? '' : 'text-muted-foreground'}\\\`}>{email.subject}</span>
            <span className="text-xs text-muted-foreground shrink-0">{email.time}</span>
          </div>
        ))}
      </div>
    </div>
  )
}`

const usageCode = `"use client"

import { createSignal } from "@barefootjs/dom"
import { Checkbox } from "@/components/ui/checkbox"

function CheckboxDemo() {
  const [accepted, setAccepted] = createSignal(false)

  return (
    <div className="space-y-3">
      <div className="flex items-center space-x-2">
        <Checkbox />
        <span className="text-sm font-medium leading-none">Remember me</span>
      </div>
      <div className="flex items-center space-x-2">
        <Checkbox defaultChecked />
        <span className="text-sm font-medium leading-none">Subscribe to newsletter</span>
      </div>
      <div className="flex items-center space-x-2 opacity-50">
        <Checkbox disabled />
        <span className="text-sm font-medium leading-none">Unavailable option</span>
      </div>
      <div className="flex items-center space-x-2">
        <Checkbox checked={accepted()} onCheckedChange={setAccepted} />
        <span className="text-sm font-medium leading-none">Controlled checkbox</span>
      </div>
    </div>
  )
}`

const checkboxProps: PropDefinition[] = [
  {
    name: 'defaultChecked',
    type: 'boolean',
    defaultValue: 'false',
    description: 'The initial checked state for uncontrolled mode.',
  },
  {
    name: 'checked',
    type: 'boolean',
    description: 'The controlled checked state of the checkbox. When provided, the component is in controlled mode.',
  },
  {
    name: 'disabled',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Whether the checkbox is disabled.',
  },
  {
    name: 'onCheckedChange',
    type: '(checked: boolean) => void',
    description: 'Event handler called when the checked state changes.',
  },
]

export function CheckboxRefPage() {
  return (
    <DocPage slug="checkbox" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Checkbox"
          description="A control that allows the user to toggle between checked and not checked."
          {...getNavLinks('checkbox')}
        />

        {/* Props Playground */}
        <CheckboxPlayground />

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="barefoot add checkbox" />
        </Section>

        {/* Usage */}
        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox />
                <span className="text-sm font-medium leading-none">Remember me</span>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox defaultChecked />
                <span className="text-sm font-medium leading-none">Subscribe to newsletter</span>
              </div>
              <div className="flex items-center space-x-2 opacity-50">
                <Checkbox disabled />
                <span className="text-sm font-medium leading-none">Unavailable option</span>
              </div>
            </div>
          </Example>
        </Section>

        {/* Examples */}
        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="Basic" code={basicCode}>
              <CheckboxBasicDemo />
            </Example>

            <Example title="Terms" code={termsCode}>
              <CheckboxTermsDemo />
            </Example>

            <Example title="Form" code={formCode}>
              <CheckboxFormDemo />
            </Example>

            <Example title="Email List" code={emailListCode}>
              <CheckboxEmailListDemo />
            </Example>
          </div>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <PropsTable props={checkboxProps} />
        </Section>
      </div>
    </DocPage>
  )
}
