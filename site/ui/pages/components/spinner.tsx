/**
 * Spinner Reference Page (/components/spinner)
 *
 * Focused developer reference with interactive Props Playground.
 */

import { Spinner } from '@/components/ui/spinner'
import { SpinnerPlayground } from '@/components/spinner-playground'
import { SpinnerSizesDemo, SpinnerButtonDemo } from '@/components/spinner-demo'
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
  { id: 'sizes', title: 'Sizes', branch: 'start' },
  { id: 'button-loading', title: 'Button Loading', branch: 'end' },
  { id: 'api-reference', title: 'API Reference' },
]

const usageCode = `import { Spinner } from "@/components/ui/spinner"

function SpinnerDemo() {
  return <Spinner />
}`

const sizesCode = `import { Spinner } from '@/components/ui/spinner'

function SpinnerSizes() {
  return (
    <div className="flex items-center gap-4">
      <Spinner className="size-4" />
      <Spinner className="size-6" />
      <Spinner className="size-8" />
      <Spinner className="size-12" />
    </div>
  )
}`

const buttonLoadingCode = `"use client"

import { createSignal } from '@barefootjs/dom'
import { Spinner } from '@/components/ui/spinner'
import { Button } from '@/components/ui/button'

function SpinnerButton() {
  const [loading, setLoading] = createSignal(false)

  const handleClick = (e: Event) => {
    e.preventDefault()
    if (loading()) return
    setLoading(true)
    setTimeout(() => setLoading(false), 2000)
  }

  return (
    <Button disabled={loading()} onClick={handleClick}>
      <Spinner className={\`size-4 \${loading() ? '' : 'hidden'}\`} />
      <span>{loading() ? 'Processing...' : 'Submit'}</span>
    </Button>
  )
}`

const spinnerProps: PropDefinition[] = [
  {
    name: 'className',
    type: 'string',
    defaultValue: "''",
    description: 'Additional CSS classes. Use size utilities like "size-4" or "size-6" to change the spinner size.',
  },
  {
    name: 'aria-label',
    type: 'string',
    defaultValue: "'Loading'",
    description: 'Accessible label for the spinner.',
  },
]

export function SpinnerRefPage() {
  return (
    <DocPage slug="spinner" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Spinner"
          description="An animated loading indicator for async operations."
          {...getNavLinks('spinner')}
        />

        {/* Props Playground */}
        <SpinnerPlayground />

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="barefoot add spinner" />
        </Section>

        {/* Usage */}
        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <Spinner />
          </Example>
        </Section>

        {/* Examples */}
        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="Sizes" code={sizesCode}>
              <SpinnerSizesDemo />
            </Example>

            <Example title="Button Loading" code={buttonLoadingCode}>
              <SpinnerButtonDemo />
            </Example>
          </div>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <PropsTable props={spinnerProps} />
        </Section>
      </div>
    </DocPage>
  )
}
