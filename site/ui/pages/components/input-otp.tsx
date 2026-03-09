/**
 * InputOTP Reference Page (/components/input-otp)
 *
 * Focused developer reference with interactive Props Playground.
 * Part of the #515 page redesign initiative.
 */

import { InputOTPPlayground } from '@/components/input-otp-playground'
import { InputOTPUsageDemo } from '@/components/input-otp-usage-demo'
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
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  InputOTPSeparator,
  REGEXP_ONLY_DIGITS_AND_CHARS,
} from "@/components/ui/input-otp"

function InputOTPDemo() {
  const [value, setValue] = createSignal("")

  return (
    <InputOTP
      maxLength={6}
      pattern={REGEXP_ONLY_DIGITS_AND_CHARS}
      value={value()}
      onValueChange={setValue}
    >
      <InputOTPGroup>
        <InputOTPSlot index={0} />
        <InputOTPSlot index={1} />
        <InputOTPSlot index={2} />
      </InputOTPGroup>
      <InputOTPSeparator />
      <InputOTPGroup>
        <InputOTPSlot index={3} />
        <InputOTPSlot index={4} />
        <InputOTPSlot index={5} />
      </InputOTPGroup>
    </InputOTP>
  )
}`

const inputOTPProps: PropDefinition[] = [
  {
    name: 'maxLength',
    type: 'number',
    description: 'The maximum number of characters. Determines how many slots to fill.',
  },
  {
    name: 'value',
    type: 'string',
    description: 'The controlled value of the OTP input.',
  },
  {
    name: 'defaultValue',
    type: 'string',
    defaultValue: "''",
    description: 'The default value for uncontrolled mode.',
  },
  {
    name: 'onValueChange',
    type: '(value: string) => void',
    description: 'Event handler called when the value changes.',
  },
  {
    name: 'onComplete',
    type: '(value: string) => void',
    description: 'Event handler called when all slots are filled.',
  },
  {
    name: 'pattern',
    type: 'RegExp',
    defaultValue: 'REGEXP_ONLY_DIGITS',
    description: 'Regular expression to validate each character. Use REGEXP_ONLY_DIGITS, REGEXP_ONLY_CHARS, or REGEXP_ONLY_DIGITS_AND_CHARS.',
  },
  {
    name: 'disabled',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Whether the input is disabled.',
  },
]

export function InputOTPRefPage() {
  return (
    <DocPage slug="input-otp" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Input OTP"
          description="An accessible one-time password input component with copy-paste support."
          {...getNavLinks('input-otp')}
        />

        {/* Props Playground */}
        <InputOTPPlayground />

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="barefoot add input-otp" />
        </Section>

        {/* Usage */}
        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <InputOTPUsageDemo />
          </Example>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <PropsTable props={inputOTPProps} />
        </Section>
      </div>
    </DocPage>
  )
}
