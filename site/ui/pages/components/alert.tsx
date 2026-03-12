/**
 * Alert Reference Page (/components/alert)
 *
 * Focused developer reference with interactive Props Playground.
 * Part of the #515 page redesign initiative.
 */

import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { AlertPlayground } from '@/components/alert-playground'
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

// Lucide Terminal icon (inline SVG)
function TerminalIcon() {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m4 17 6-6-6-6" />
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19h8" />
    </svg>
  )
}

// Lucide CircleAlert icon (inline SVG)
function CircleAlertIcon() {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M22 12c0 5.523-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2s10 4.477 10 10z" />
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4" />
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 16h.01" />
    </svg>
  )
}

const tocItems: TocItem[] = [
  { id: 'preview', title: 'Preview' },
  { id: 'installation', title: 'Installation' },
  { id: 'usage', title: 'Usage' },
  { id: 'examples', title: 'Examples' },
  { id: 'default', title: 'Default', branch: 'start' },
  { id: 'destructive', title: 'Destructive', branch: 'end' },
  { id: 'api-reference', title: 'API Reference' },
]

const usageCode = `import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'

function AlertDemo() {
  return (
    <Alert>
      <TerminalIcon />
      <AlertTitle>Heads up!</AlertTitle>
      <AlertDescription>
        You can add components to your app using the CLI.
      </AlertDescription>
    </Alert>
  )
}`

const defaultCode = `<Alert>
  <TerminalIcon />
  <AlertTitle>Heads up!</AlertTitle>
  <AlertDescription>
    You can add components to your app using the CLI.
  </AlertDescription>
</Alert>`

const destructiveCode = `<Alert variant="destructive">
  <CircleAlertIcon />
  <AlertTitle>Error</AlertTitle>
  <AlertDescription>
    Your session has expired. Please log in again.
  </AlertDescription>
</Alert>`

const alertProps: PropDefinition[] = [
  {
    name: 'variant',
    type: "'default' | 'destructive'",
    defaultValue: "'default'",
    description: 'The visual style of the alert.',
  },
  {
    name: 'children',
    type: 'Child',
    description: 'The content of the alert (typically an SVG icon, AlertTitle, and AlertDescription).',
  },
]

const alertTitleProps: PropDefinition[] = [
  {
    name: 'children',
    type: 'Child',
    description: 'The title text of the alert.',
  },
]

const alertDescriptionProps: PropDefinition[] = [
  {
    name: 'children',
    type: 'Child',
    description: 'The description text of the alert.',
  },
]

export function AlertRefPage() {
  return (
    <DocPage slug="alert" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Alert"
          description="Displays a callout for important content."
          {...getNavLinks('alert')}
        />

        {/* Props Playground */}
        <AlertPlayground />

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="barefoot add alert" />
        </Section>

        {/* Usage */}
        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <div className="w-full">
              <Alert>
                <TerminalIcon />
                <AlertTitle>Heads up!</AlertTitle>
                <AlertDescription>
                  You can add components to your app using the CLI.
                </AlertDescription>
              </Alert>
            </div>
          </Example>
        </Section>

        {/* Examples */}
        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="Default" code={defaultCode} showLineNumbers={false}>
              <div className="w-full">
                <Alert>
                  <TerminalIcon />
                  <AlertTitle>Heads up!</AlertTitle>
                  <AlertDescription>
                    You can add components to your app using the CLI.
                  </AlertDescription>
                </Alert>
              </div>
            </Example>

            <Example title="Destructive" code={destructiveCode} showLineNumbers={false}>
              <div className="w-full">
                <Alert variant="destructive">
                  <CircleAlertIcon />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>
                    Your session has expired. Please log in again.
                  </AlertDescription>
                </Alert>
              </div>
            </Example>
          </div>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-3">Alert</h3>
              <PropsTable props={alertProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-3">AlertTitle</h3>
              <PropsTable props={alertTitleProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-3">AlertDescription</h3>
              <PropsTable props={alertDescriptionProps} />
            </div>
          </div>
        </Section>
      </div>
    </DocPage>
  )
}
