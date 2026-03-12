/**
 * Dialog Reference Page (/components/dialog)
 *
 * Focused developer reference with interactive Props Playground.
 * Migrated from /docs/components/dialog.
 */

import { DialogBasicDemo, DialogFormDemo, DialogLongContentDemo } from '@/components/dialog-demo'
import { DialogPlayground } from '@/components/dialog-playground'
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
  { id: 'delete-confirmation', title: 'Delete Confirmation', branch: 'start' },
  { id: 'long-content', title: 'Long Content', branch: 'end' },
  { id: 'accessibility', title: 'Accessibility' },
  { id: 'api-reference', title: 'API Reference' },
]

const usageCode = `import {
  Dialog,
  DialogTrigger,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'`

const basicCode = `"use client"

import { createSignal } from '@barefootjs/dom'
import {
  Dialog,
  DialogTrigger,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'

function CreateTaskDialog() {
  const [open, setOpen] = createSignal(false)

  return (
    <Dialog open={open()} onOpenChange={setOpen}>
      <DialogTrigger>Create Task</DialogTrigger>
      <DialogOverlay />
      <DialogContent
        ariaLabelledby="dialog-title"
        ariaDescribedby="dialog-description"
      >
        <DialogHeader>
          <DialogTitle id="dialog-title">Create New Task</DialogTitle>
          <DialogDescription id="dialog-description">
            Add a new task to your list.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <label for="task-title" className="text-sm font-medium">
              Title
            </label>
            <input
              id="task-title"
              type="text"
              placeholder="Enter task title"
              className="flex h-10 w-full rounded-md border ..."
            />
          </div>
          <div className="grid gap-2">
            <label for="task-description" className="text-sm font-medium">
              Description
            </label>
            <textarea
              id="task-description"
              placeholder="Enter task description (optional)"
              rows={3}
              className="flex w-full rounded-md border ..."
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose>Cancel</DialogClose>
          <DialogClose>Create</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}`

const deleteCode = `"use client"

import { createSignal } from '@barefootjs/dom'
import {
  Dialog,
  DialogTrigger,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'

function DeleteConfirmDialog() {
  const [open, setOpen] = createSignal(false)
  const [confirmText, setConfirmText] = createSignal('')
  const projectName = 'my-project'

  const isConfirmed = () => confirmText() === projectName

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen)
    if (!isOpen) setConfirmText('')
  }

  return (
    <Dialog open={open()} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button class="bg-destructive ...">Delete Project</button>
      </DialogTrigger>
      <DialogOverlay />
      <DialogContent ariaLabelledby="delete-dialog-title" ...>
        <DialogHeader>
          <DialogTitle>Delete Project</DialogTitle>
          <DialogDescription>
            This will permanently delete <strong>{projectName}</strong>.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <label className="text-sm text-muted-foreground">
            Please type <strong>{projectName}</strong> to confirm.
          </label>
          <input
            type="text"
            value={confirmText()}
            onInput={(e) => setConfirmText(e.target.value)}
            placeholder={projectName}
            className="mt-2 flex h-10 w-full rounded-md border ..."
          />
        </div>
        <DialogFooter>
          <DialogClose>Cancel</DialogClose>
          <button
            onClick={() => { setOpen(false); setConfirmText('') }}
            disabled={!isConfirmed()}
            class="bg-destructive ..."
          >
            Delete Project
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}`

const longContentCode = `"use client"

import { createSignal } from '@barefootjs/dom'
import {
  Dialog,
  DialogTrigger,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'

function DialogLongContent() {
  const [open, setOpen] = createSignal(false)

  return (
    <Dialog open={open()} onOpenChange={setOpen}>
      <DialogTrigger>Open Long Content Dialog</DialogTrigger>
      <DialogOverlay />
      <DialogContent
        ariaLabelledby="long-dialog-title"
        ariaDescribedby="long-dialog-description"
        class="max-h-[66vh]"
      >
        <DialogHeader class="flex-shrink-0">
          <DialogTitle id="long-dialog-title">Terms of Service</DialogTitle>
          <DialogDescription id="long-dialog-description">
            Please read the following terms carefully.
          </DialogDescription>
        </DialogHeader>
        <div className="text-sm text-muted-foreground space-y-4 overflow-y-auto flex-1 min-h-0">
          <p>Lorem ipsum dolor sit amet...</p>
          {/* Multiple paragraphs - only this area scrolls */}
        </div>
        <DialogFooter class="flex-shrink-0">
          <DialogClose>Decline</DialogClose>
          <DialogClose>Accept</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}`

// Props definitions
const dialogProps: PropDefinition[] = [
  {
    name: 'open',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Whether the dialog is open.',
  },
  {
    name: 'onOpenChange',
    type: '(open: boolean) => void',
    description: 'Event handler called when the open state should change.',
  },
]

const dialogTriggerProps: PropDefinition[] = [
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

const dialogOverlayProps: PropDefinition[] = []

const dialogContentProps: PropDefinition[] = [
  {
    name: 'ariaLabelledby',
    type: 'string',
    description: 'ID of the element that labels the dialog (typically DialogTitle).',
  },
  {
    name: 'ariaDescribedby',
    type: 'string',
    description: 'ID of the element that describes the dialog (typically DialogDescription).',
  },
]

const dialogTitleProps: PropDefinition[] = [
  {
    name: 'id',
    type: 'string',
    description: 'ID for aria-labelledby reference.',
  },
]

const dialogDescriptionProps: PropDefinition[] = [
  {
    name: 'id',
    type: 'string',
    description: 'ID for aria-describedby reference.',
  },
]

const dialogCloseProps: PropDefinition[] = []

export function DialogRefPage() {
  return (
    <DocPage slug="dialog" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Dialog"
          description="A modal dialog that displays content in a layer above the page. Supports ESC key, overlay click, focus trap, and scroll lock."
          {...getNavLinks('dialog')}
        />

        {/* Props Playground */}
        <DialogPlayground />

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="barefoot add dialog" />
        </Section>

        {/* Usage */}
        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <div className="flex gap-4">
              <DialogBasicDemo />
            </div>
          </Example>
        </Section>

        {/* Examples */}
        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="Delete Confirmation" code={deleteCode}>
              <DialogFormDemo />
            </Example>

            <Example title="Long Content" code={longContentCode}>
              <DialogLongContentDemo />
            </Example>
          </div>
        </Section>

        {/* Accessibility */}
        <Section id="accessibility" title="Accessibility">
          <ul className="list-disc list-inside space-y-2 text-muted-foreground">
            <li><strong className="text-foreground">ESC key to close</strong> - Press Escape to close the dialog</li>
            <li><strong className="text-foreground">Click outside to close</strong> - Click the overlay to close</li>
            <li><strong className="text-foreground">Scroll lock</strong> - Body scroll is disabled when dialog is open</li>
            <li><strong className="text-foreground">Focus trap</strong> - Tab/Shift+Tab cycles within the dialog</li>
            <li><strong className="text-foreground">ARIA attributes</strong> - role="dialog", aria-modal="true", aria-labelledby, aria-describedby</li>
            <li><strong className="text-foreground">Portal rendering</strong> - Dialog is mounted to document.body via createPortal</li>
          </ul>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">Dialog</h3>
              <PropsTable props={dialogProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">DialogTrigger</h3>
              <PropsTable props={dialogTriggerProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">DialogOverlay</h3>
              <PropsTable props={dialogOverlayProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">DialogContent</h3>
              <PropsTable props={dialogContentProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">DialogTitle</h3>
              <PropsTable props={dialogTitleProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">DialogDescription</h3>
              <PropsTable props={dialogDescriptionProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">DialogClose</h3>
              <PropsTable props={dialogCloseProps} />
            </div>
          </div>
        </Section>
      </div>
    </DocPage>
  )
}
