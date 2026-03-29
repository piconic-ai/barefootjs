/**
 * Multi-Step Form Reference Page (/components/multi-step-form)
 *
 * Block-level composition pattern: multi-step wizard with per-step
 * validation, shared signals across branches, and step indicator.
 * Compiler stress test for multi-branch conditionals and cross-step state.
 */

import { MultiStepFormDemo } from '@/components/multi-step-form-demo'
import {
  DocPage,
  PageHeader,
  Section,
  Example,
  type TocItem,
} from '../../components/shared/docs'
import { getNavLinks } from '../../components/shared/PageNavigation'

const tocItems: TocItem[] = [
  { id: 'preview', title: 'Preview' },
  { id: 'features', title: 'Features' },
]

const previewCode = `"use client"

import { createSignal, createMemo } from '@barefootjs/dom'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

function MultiStepForm() {
  const [step, setStep] = createSignal(1)
  const [email, setEmail] = createSignal('')
  const [name, setName] = createSignal('')

  const canProceed = createMemo(() => {
    if (step() === 1) return email().includes('@')
    if (step() === 2) return name().length > 0
    return false
  })

  return (
    <div>
      {step() === 1 ? (
        <Input value={email()} onInput={e => setEmail(e.target.value)} />
      ) : step() === 2 ? (
        <Input value={name()} onInput={e => setName(e.target.value)} />
      ) : (
        <div>Review: {email()} / {name()}</div>
      )}
      <Button onClick={() => setStep(s => s + 1)} disabled={!canProceed()}>
        Next
      </Button>
    </div>
  )
}`

export function MultiStepFormRefPage() {
  return (
    <DocPage slug="multi-step-form" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Multi-Step Form"
          description="A wizard-style form with step navigation, per-step validation, and a review step."
          {...getNavLinks('multi-step-form')}
        />

        <Section id="preview" title="Preview">
          <Example title="" code={previewCode}>
            <MultiStepFormDemo />
          </Example>
        </Section>

        <Section id="features" title="Features">
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-medium text-foreground mb-2">Multi-Branch Conditional (4 Steps)</h3>
              <p className="text-sm text-muted-foreground">
                Four steps rendered via nested ternary operators. Each branch contains
                different form fields. Tests the compiler's handling of deep conditional
                trees with distinct component compositions per branch.
              </p>
            </div>
            <div>
              <h3 className="text-base font-medium text-foreground mb-2">Cross-Step Signal Sharing</h3>
              <p className="text-sm text-muted-foreground">
                Form values (email, password, name, etc.) are shared across all steps
                via signals declared once at the component root. Switching steps preserves
                input values — the signals outlive individual branch renders.
              </p>
            </div>
            <div>
              <h3 className="text-base font-medium text-foreground mb-2">Per-Step Validation Memos</h3>
              <p className="text-sm text-muted-foreground">
                step1Valid, step2Valid, step3Valid are createMemo chains that derive from
                field-level error memos (emailError, passwordError, etc.). canProceed
                selects the right validation based on currentStep.
              </p>
            </div>
            <div>
              <h3 className="text-base font-medium text-foreground mb-2">Step Indicator with Loop + Conditional</h3>
              <p className="text-sm text-muted-foreground">
                Step indicator bar uses .map() with per-item conditional styling
                (active, completed, pending). Tests loop + conditional coexistence
                with reactive class updates.
              </p>
            </div>
          </div>
        </Section>
      </div>
    </DocPage>
  )
}
