/**
 * Toast Reference Page (/components/toast)
 *
 * Focused developer reference with interactive Props Playground.
 */

import {
  ToastDefaultDemo,
  ToastSuccessDemo,
  ToastErrorDemo,
  ToastWarningDemo,
  ToastInfoDemo,
  ToastWithActionDemo,
  ToastPositionDemo,
} from '@/components/toast-demo'
import { ToastPlayground } from '@/components/toast-playground'
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
  { id: 'default', title: 'Default', branch: 'start' },
  { id: 'success', title: 'Success', branch: 'child' },
  { id: 'error', title: 'Error', branch: 'child' },
  { id: 'warning', title: 'Warning', branch: 'child' },
  { id: 'info', title: 'Info', branch: 'child' },
  { id: 'with-action', title: 'With Action', branch: 'child' },
  { id: 'position', title: 'Position', branch: 'end' },
  { id: 'api-reference', title: 'API Reference' },
]

const usageCode = `import {
  ToastProvider,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
} from "@/components/ui/toast"

function ToastDemo() {
  const [open, setOpen] = createSignal(false)

  return (
    <ToastProvider position="bottom-right">
      <Button onClick={() => setOpen(true)}>Show Toast</Button>
      <Toast open={open()} onOpenChange={setOpen}>
        <div className="flex-1">
          <ToastTitle>Event created</ToastTitle>
          <ToastDescription>Sunday, December 03, 2023 at 9:00 AM</ToastDescription>
        </div>
        <ToastClose />
      </Toast>
    </ToastProvider>
  )
}`

const defaultCode = `<Toast open={open()} onOpenChange={setOpen}>
  <div className="flex-1">
    <ToastTitle>Event created</ToastTitle>
    <ToastDescription>Sunday, December 03, 2023 at 9:00 AM</ToastDescription>
  </div>
  <ToastClose />
</Toast>`

const successCode = `<Toast variant="success" open={open()} onOpenChange={setOpen}>
  <div className="flex-1">
    <ToastTitle>Changes saved</ToastTitle>
    <ToastDescription>Your changes have been saved successfully.</ToastDescription>
  </div>
  <ToastClose />
</Toast>`

const errorCode = `<Toast variant="error" open={open()} onOpenChange={setOpen}>
  <div className="flex-1">
    <ToastTitle>Something went wrong</ToastTitle>
    <ToastDescription>There was a problem with your request.</ToastDescription>
  </div>
  <ToastAction altText="Try again">Try again</ToastAction>
</Toast>`

const warningCode = `<Toast variant="warning" open={open()} onOpenChange={setOpen}>
  <div className="flex-1">
    <ToastTitle>Heads up</ToastTitle>
    <ToastDescription>You are about to exceed your storage limit.</ToastDescription>
  </div>
  <ToastClose />
</Toast>`

const infoCode = `<Toast variant="info" open={open()} onOpenChange={setOpen}>
  <div className="flex-1">
    <ToastTitle>New update available</ToastTitle>
    <ToastDescription>A new version has been released.</ToastDescription>
  </div>
  <ToastClose />
</Toast>`

const withActionCode = `<Toast open={open()} onOpenChange={setOpen} duration={10000}>
  <div className="flex-1">
    <ToastTitle>Item deleted</ToastTitle>
    <ToastDescription>The item has been removed from your list.</ToastDescription>
  </div>
  <div className="flex gap-2">
    <ToastAction altText="Undo deletion">Undo</ToastAction>
    <ToastClose />
  </div>
</Toast>`

const positionCode = `<ToastProvider position="top-center">
  <Toast open={open()} onOpenChange={setOpen}>
    <div className="flex-1">
      <ToastDescription>Top Center</ToastDescription>
    </div>
    <ToastClose />
  </Toast>
</ToastProvider>`

// Props definitions
const toastProviderProps: PropDefinition[] = [
  {
    name: 'position',
    type: "'top-right' | 'top-center' | 'top-left' | 'bottom-right' | 'bottom-center' | 'bottom-left'",
    defaultValue: "'bottom-right'",
    description: 'Position of the toast container on the viewport.',
  },
]

const toastProps: PropDefinition[] = [
  {
    name: 'variant',
    type: "'default' | 'success' | 'error' | 'warning' | 'info'",
    defaultValue: "'default'",
    description: 'Visual variant of the toast.',
  },
  {
    name: 'open',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Whether the toast is visible.',
  },
  {
    name: 'onOpenChange',
    type: '(open: boolean) => void',
    description: 'Callback when the open state changes (e.g., on auto-dismiss or close).',
  },
  {
    name: 'duration',
    type: 'number',
    defaultValue: '5000',
    description: 'Auto-dismiss duration in milliseconds. Set to 0 to disable auto-dismiss.',
  },
]

const toastTitleProps: PropDefinition[] = [
  {
    name: 'children',
    type: 'Child',
    description: 'The title text to display.',
  },
]

const toastDescriptionProps: PropDefinition[] = [
  {
    name: 'children',
    type: 'Child',
    description: 'The description text to display.',
  },
]

const toastCloseProps: PropDefinition[] = []

const toastActionProps: PropDefinition[] = [
  {
    name: 'altText',
    type: 'string',
    description: 'Alternative text for accessibility.',
  },
  {
    name: 'onClick',
    type: '() => void',
    description: 'Click handler called before auto-dismiss.',
  },
]

export function ToastRefPage() {
  return (
    <DocPage slug="toast" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Toast"
          description="A non-blocking notification that displays brief messages to users. Supports auto-dismiss, multiple variants, and action buttons."
          {...getNavLinks('toast')}
        />

        {/* Props Playground */}
        <ToastPlayground />

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="barefoot add toast" />
        </Section>

        {/* Usage */}
        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <ToastDefaultDemo />
          </Example>
        </Section>

        {/* Examples */}
        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="Default" code={defaultCode} showLineNumbers={false}>
              <ToastDefaultDemo />
            </Example>

            <Example title="Success" code={successCode} showLineNumbers={false}>
              <ToastSuccessDemo />
            </Example>

            <Example title="Error" code={errorCode} showLineNumbers={false}>
              <ToastErrorDemo />
            </Example>

            <Example title="Warning" code={warningCode} showLineNumbers={false}>
              <ToastWarningDemo />
            </Example>

            <Example title="Info" code={infoCode} showLineNumbers={false}>
              <ToastInfoDemo />
            </Example>

            <Example title="With Action" code={withActionCode} showLineNumbers={false}>
              <ToastWithActionDemo />
            </Example>

            <Example title="Position" code={positionCode} showLineNumbers={false}>
              <ToastPositionDemo />
            </Example>
          </div>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">ToastProvider</h3>
              <PropsTable props={toastProviderProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">Toast</h3>
              <PropsTable props={toastProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">ToastTitle</h3>
              <PropsTable props={toastTitleProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">ToastDescription</h3>
              <PropsTable props={toastDescriptionProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">ToastClose</h3>
              <PropsTable props={toastCloseProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">ToastAction</h3>
              <PropsTable props={toastActionProps} />
            </div>
          </div>
        </Section>
      </div>
    </DocPage>
  )
}
