/**
 * Progress Reference Page (/components/progress)
 *
 * Focused developer reference with interactive Props Playground.
 * Part of the #515 page redesign initiative.
 */

import { Progress } from '@/components/ui/progress'
import { ProgressPlayground } from '@/components/progress-playground'
import {
  ProgressPreviewDemo,
  ProgressBasicDemo,
  ProgressFormDemo,
} from '@/components/progress-demo'
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
  { id: 'simulated-upload', title: 'Simulated Upload', branch: 'start' },
  { id: 'basic', title: 'Basic', branch: 'child' },
  { id: 'form-wizard', title: 'Form Wizard', branch: 'end' },
  { id: 'api-reference', title: 'API Reference' },
]

const usageCode = `import { Progress } from "@/components/ui/progress"

function ProgressDemo() {
  return (
    <div className="space-y-6 w-full max-w-sm">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium leading-none">Empty</span>
          <span className="text-sm text-muted-foreground tabular-nums">0%</span>
        </div>
        <Progress value={0} />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium leading-none">Half</span>
          <span className="text-sm text-muted-foreground tabular-nums">50%</span>
        </div>
        <Progress value={50} />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium leading-none">Complete</span>
          <span className="text-sm text-muted-foreground tabular-nums">100%</span>
        </div>
        <Progress value={100} />
      </div>
    </div>
  )
}`

// Code examples - Preview (Simulated Upload)
const previewCode = `"use client"

import { createSignal, createMemo, createEffect, onCleanup } from "@barefootjs/dom"
import { Progress } from "@/components/ui/progress"

export function ProgressPreviewDemo() {
  const [progress, setProgress] = createSignal(0)

  createEffect(() => {
    const timer = setInterval(() => {
      setProgress((prev: number) => {
        if (prev >= 100) {
          clearInterval(timer)
          return 100
        }
        return prev + 2
      })
    }, 100)
    onCleanup(() => clearInterval(timer))
  })

  const label = createMemo(() =>
    progress() >= 100 ? "Upload complete" : "Uploading..."
  )

  return (
    <div className="space-y-3 w-full max-w-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium leading-none">{label()}</span>
        <span className="text-sm text-muted-foreground tabular-nums">{progress()}%</span>
      </div>
      <Progress value={progress()} />
    </div>
  )
}`

const basicCode = `import { Progress } from "@/components/ui/progress"

export function ProgressBasicDemo() {
  return (
    <div className="space-y-6 w-full max-w-sm">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium leading-none">Empty</span>
          <span className="text-sm text-muted-foreground tabular-nums">0%</span>
        </div>
        <Progress value={0} />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium leading-none">Half</span>
          <span className="text-sm text-muted-foreground tabular-nums">50%</span>
        </div>
        <Progress value={50} />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium leading-none">Complete</span>
          <span className="text-sm text-muted-foreground tabular-nums">100%</span>
        </div>
        <Progress value={100} />
      </div>
    </div>
  )
}`

const formCode = `"use client"

import { createSignal, createMemo } from "@barefootjs/dom"
import { Progress } from "@/components/ui/progress"

export function ProgressFormDemo() {
  const totalSteps = 4
  const [step, setStep] = createSignal(1)

  const progressValue = createMemo(() =>
    Math.round(((step() - 1) / (totalSteps - 1)) * 100)
  )

  const stepLabels = ["Account", "Profile", "Preferences", "Review"]

  const goBack = () => setStep((s: number) => Math.max(1, s - 1))
  const goNext = () => setStep((s: number) => Math.min(totalSteps, s + 1))

  return (
    <div className="space-y-6 w-full max-w-sm">
      <div className="space-y-1">
        <h4 className="text-sm font-medium leading-none">Setup Wizard</h4>
        <p className="text-sm text-muted-foreground">
          Step {step()} of {totalSteps}: {stepLabels[step() - 1]}
        </p>
      </div>
      <Progress value={progressValue()} />
      <div className="flex items-center justify-between">
        <button
          className="... border border-input bg-background ..."
          disabled={step() <= 1}
          onClick={goBack}
        >
          Back
        </button>
        <span className="text-sm text-muted-foreground tabular-nums">
          {progressValue()}%
        </span>
        <button
          className="... bg-primary text-primary-foreground ..."
          disabled={step() >= totalSteps}
          onClick={goNext}
        >
          Next
        </button>
      </div>
    </div>
  )
}`

// Props definition
const progressProps: PropDefinition[] = [
  {
    name: 'value',
    type: 'number',
    defaultValue: '0',
    description: 'The current progress value.',
  },
  {
    name: 'max',
    type: 'number',
    defaultValue: '100',
    description: 'The maximum value of the progress bar.',
  },
  {
    name: 'className',
    type: 'string',
    description: 'Additional CSS classes for the root element.',
  },
  {
    name: 'indicatorClassName',
    type: 'string',
    description: 'Additional CSS classes for the indicator element.',
  },
]

export function ProgressRefPage() {
  return (
    <DocPage slug="progress" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Progress"
          description="Displays an indicator showing the completion progress of a task."
          {...getNavLinks('progress')}
        />

        {/* Props Playground */}
        <ProgressPlayground />

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="barefoot add progress" />
        </Section>

        {/* Usage */}
        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <div className="space-y-6 w-full max-w-sm">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium leading-none">Empty</span>
                  <span className="text-sm text-muted-foreground tabular-nums">0%</span>
                </div>
                <Progress value={0} />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium leading-none">Half</span>
                  <span className="text-sm text-muted-foreground tabular-nums">50%</span>
                </div>
                <Progress value={50} />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium leading-none">Complete</span>
                  <span className="text-sm text-muted-foreground tabular-nums">100%</span>
                </div>
                <Progress value={100} />
              </div>
            </div>
          </Example>
        </Section>

        {/* Examples */}
        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="Simulated Upload" code={previewCode}>
              <ProgressPreviewDemo />
            </Example>

            <Example title="Basic" code={basicCode}>
              <ProgressBasicDemo />
            </Example>

            <Example title="Form Wizard" code={formCode}>
              <ProgressFormDemo />
            </Example>
          </div>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <PropsTable props={progressProps} />
        </Section>
      </div>
    </DocPage>
  )
}
