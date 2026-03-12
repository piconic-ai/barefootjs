/**
 * AlertDialog Reference Page (/components/alert-dialog)
 *
 * Focused developer reference with interactive Props Playground.
 * Migrated from /docs/components/alert-dialog.
 */

import { AlertDialogBasicDemo, AlertDialogDestructiveDemo } from '@/components/alert-dialog-demo'
import { AlertDialogPlayground } from '@/components/alert-dialog-playground'
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
  { id: 'destructive', title: 'Destructive', branch: 'end' },
  { id: 'accessibility', title: 'Accessibility' },
  { id: 'api-reference', title: 'API Reference' },
]

const usageCode = `import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogOverlay,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'`

const basicCode = `"use client"

import { createSignal } from '@barefootjs/dom'
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogOverlay,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'

function BasicAlertDialog() {
  const [open, setOpen] = createSignal(false)

  return (
    <AlertDialog open={open()} onOpenChange={setOpen}>
      <AlertDialogTrigger>Show Dialog</AlertDialogTrigger>
      <AlertDialogOverlay />
      <AlertDialogContent
        ariaLabelledby="alert-title"
        ariaDescribedby="alert-description"
      >
        <AlertDialogHeader>
          <AlertDialogTitle id="alert-title">
            Are you absolutely sure?
          </AlertDialogTitle>
          <AlertDialogDescription id="alert-description">
            This action cannot be undone. This will permanently
            delete your account and remove your data from our servers.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction>Continue</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}`

const destructiveCode = `"use client"

import { createSignal } from '@barefootjs/dom'
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogOverlay,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'

function DestructiveAlertDialog() {
  const [open, setOpen] = createSignal(false)

  return (
    <AlertDialog open={open()} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <button class="bg-destructive text-destructive-foreground ...">
          Delete Account
        </button>
      </AlertDialogTrigger>
      <AlertDialogOverlay />
      <AlertDialogContent
        ariaLabelledby="alert-destructive-title"
        ariaDescribedby="alert-destructive-description"
      >
        <AlertDialogHeader>
          <AlertDialogTitle id="alert-destructive-title">
            Delete Account
          </AlertDialogTitle>
          <AlertDialogDescription id="alert-destructive-description">
            Are you sure you want to delete your account? All of
            your data will be permanently removed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction class="bg-destructive text-white hover:bg-destructive/90">
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}`

// Props definitions
const alertDialogProps: PropDefinition[] = [
  {
    name: 'open',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Whether the alert dialog is open.',
  },
  {
    name: 'onOpenChange',
    type: '(open: boolean) => void',
    description: 'Event handler called when the open state should change.',
  },
]

const alertDialogTriggerProps: PropDefinition[] = [
  {
    name: 'disabled',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Whether the trigger is disabled.',
  },
  {
    name: 'asChild',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Render child element as trigger instead of built-in button.',
  },
]

const alertDialogOverlayProps: PropDefinition[] = []

const alertDialogContentProps: PropDefinition[] = [
  {
    name: 'ariaLabelledby',
    type: 'string',
    description: 'ID of the element that labels the alert dialog (typically AlertDialogTitle).',
  },
  {
    name: 'ariaDescribedby',
    type: 'string',
    description: 'ID of the element that describes the alert dialog (typically AlertDialogDescription).',
  },
]

const alertDialogTitleProps: PropDefinition[] = [
  {
    name: 'id',
    type: 'string',
    description: 'ID for aria-labelledby reference.',
  },
]

const alertDialogDescriptionProps: PropDefinition[] = [
  {
    name: 'id',
    type: 'string',
    description: 'ID for aria-describedby reference.',
  },
]

const alertDialogCancelProps: PropDefinition[] = []

const alertDialogActionProps: PropDefinition[] = [
  {
    name: 'onClick',
    type: '() => void',
    description: 'Click handler called when the action is triggered.',
  },
]

export function AlertDialogRefPage() {
  return (
    <DocPage slug="alert-dialog" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Alert Dialog"
          description="A modal dialog that interrupts the user with important content and expects a response. Unlike Dialog, it cannot be dismissed by clicking outside."
          {...getNavLinks('alert-dialog')}
        />

        {/* Props Playground */}
        <AlertDialogPlayground />

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="barefoot add alert-dialog" />
        </Section>

        {/* Usage */}
        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <div className="flex gap-4">
              <AlertDialogBasicDemo />
            </div>
          </Example>
        </Section>

        {/* Examples */}
        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="Destructive" code={destructiveCode}>
              <AlertDialogDestructiveDemo />
            </Example>
          </div>
        </Section>

        {/* Accessibility */}
        <Section id="accessibility" title="Accessibility">
          <ul className="list-disc list-inside space-y-2 text-muted-foreground">
            <li><strong className="text-foreground">ESC key to close</strong> - Press Escape to close the alert dialog</li>
            <li><strong className="text-foreground">No outside click dismiss</strong> - Clicking the overlay does NOT close the dialog</li>
            <li><strong className="text-foreground">Scroll lock</strong> - Body scroll is disabled when alert dialog is open</li>
            <li><strong className="text-foreground">Focus trap</strong> - Tab/Shift+Tab cycles within the alert dialog</li>
            <li><strong className="text-foreground">ARIA</strong> - role="alertdialog", aria-modal="true", aria-labelledby, aria-describedby</li>
            <li><strong className="text-foreground">Portal rendering</strong> - Alert dialog is mounted to document.body via createPortal</li>
          </ul>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">AlertDialog</h3>
              <PropsTable props={alertDialogProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">AlertDialogTrigger</h3>
              <PropsTable props={alertDialogTriggerProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">AlertDialogOverlay</h3>
              <PropsTable props={alertDialogOverlayProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">AlertDialogContent</h3>
              <PropsTable props={alertDialogContentProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">AlertDialogTitle</h3>
              <PropsTable props={alertDialogTitleProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">AlertDialogDescription</h3>
              <PropsTable props={alertDialogDescriptionProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">AlertDialogCancel</h3>
              <PropsTable props={alertDialogCancelProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">AlertDialogAction</h3>
              <PropsTable props={alertDialogActionProps} />
            </div>
          </div>
        </Section>
      </div>
    </DocPage>
  )
}
