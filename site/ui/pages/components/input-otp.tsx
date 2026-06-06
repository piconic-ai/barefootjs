/**
 * InputOTP Reference Page (/components/input-otp)
 *
 * Focused developer reference with interactive Props Playground.
 * Part of the #515 page redesign initiative.
 */

import { InputOTPPlayground } from '@/components/input-otp-playground'
import { InputOTPUsageDemo } from '@/components/input-otp-usage-demo'
import {
  InputOTPBasicDemo,
  InputOTPPatternDemo,
  InputOTPFormDemo,
} from '@/components/input-otp-demo'
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
  { id: 'pattern', title: 'Pattern', branch: 'child' },
  { id: 'form', title: 'Form', branch: 'end' },
  { id: 'api-reference', title: 'API Reference' },
]

const usageCode = `"use client"

import { createSignal } from "@barefootjs/client"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  InputOTPSeparator,
} from "@/components/ui/input-otp"

function InputOTPDemo() {
  const [value, setValue] = createSignal("")

  return (
    <InputOTP
      maxLength={6}
      pattern="digits-and-chars"
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

const basicCode = `import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp"

export function InputOTPBasicDemo() {
  return (
    <InputOTP maxLength={4}>
      <InputOTPGroup>
        <InputOTPSlot index={0} />
        <InputOTPSlot index={1} />
        <InputOTPSlot index={2} />
        <InputOTPSlot index={3} />
      </InputOTPGroup>
    </InputOTP>
  )
}`

const patternCode = `import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  REGEXP_ONLY_DIGITS_AND_CHARS,
} from "@/components/ui/input-otp"

export function InputOTPPatternDemo() {
  return (
    <div className="space-y-2">
      <InputOTP maxLength={6} pattern={REGEXP_ONLY_DIGITS_AND_CHARS}>
        <InputOTPGroup>
          <InputOTPSlot index={0} />
          <InputOTPSlot index={1} />
          <InputOTPSlot index={2} />
          <InputOTPSlot index={3} />
          <InputOTPSlot index={4} />
          <InputOTPSlot index={5} />
        </InputOTPGroup>
      </InputOTP>
      <p className="text-sm text-muted-foreground">
        Accepts letters and numbers.
      </p>
    </div>
  )
}`

const formCode = `"use client"

import { createSignal, createMemo, onCleanup } from "@barefootjs/client"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  InputOTPSeparator,
} from "@/components/ui/input-otp"

export function InputOTPFormDemo() {
  const [value, setValue] = createSignal('')
  const [status, setStatus] = createSignal('idle')
  const [canResend, setCanResend] = createSignal(true)
  const [countdown, setCountdown] = createSignal(0)

  const isComplete = createMemo(() => value().length === 6)

  const handleSubmit = () => {
    if (!isComplete()) return
    setStatus('loading')
    setTimeout(() => {
      if (value() === '123456') {
        setStatus('success')
      } else {
        setStatus('error')
      }
    }, 1500)
  }

  const handleResend = () => {
    if (!canResend()) return
    setCanResend(false)
    setCountdown(30)
    setValue('')
    setStatus('idle')

    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          setCanResend(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    onCleanup(() => clearInterval(timer))
  }

  return (
    <div className="space-y-4">
      <InputOTP maxLength={6} value={value()} onValueChange={setValue}
        disabled={status() === 'loading' || status() === 'success'}>
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
      <div className="flex items-center gap-3">
        <button disabled={!isComplete() || status() === 'loading'}
          onClick={handleSubmit}>
          {status() === 'loading' ? 'Verifying...' : 'Verify'}
        </button>
        <button disabled={!canResend()} onClick={handleResend}>
          {canResend() ? 'Resend code' : \`Resend in \${countdown()}s\`}
        </button>
      </div>
      {status() === 'success' && <p>Code verified successfully!</p>}
      {status() === 'error' && <p>Invalid code. Please try again.</p>}
    </div>
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
    type: "RegExp | 'digits' | 'chars' | 'digits-and-chars'",
    defaultValue: "'digits'",
    description: "Pattern to validate each character. Use a preset name ('digits', 'chars', 'digits-and-chars') or a RegExp.",
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
          <PackageManagerTabs command="@barefootjs/cli add input-otp" />
        </Section>

        {/* Usage */}
        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <InputOTPUsageDemo />
          </Example>
        </Section>

        {/* Examples */}
        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="Basic" code={basicCode}>
              <InputOTPBasicDemo />
            </Example>

            <Example title="Pattern" code={patternCode}>
              <InputOTPPatternDemo />
            </Example>

            <Example title="Form" code={formCode}>
              <InputOTPFormDemo />
            </Example>
          </div>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <PropsTable props={inputOTPProps} />
        </Section>
      </div>
    </DocPage>
  )
}
