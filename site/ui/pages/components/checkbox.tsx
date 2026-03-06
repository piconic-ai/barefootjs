/**
 * Checkbox Reference Page (/components/checkbox)
 *
 * Focused developer reference with interactive Props Playground.
 * Part of the #515 page redesign initiative.
 */

import { Checkbox } from '@/components/ui/checkbox'
import { CheckboxPlayground } from '@/components/checkbox-playground'
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

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <PropsTable props={checkboxProps} />
        </Section>
      </div>
    </DocPage>
  )
}
