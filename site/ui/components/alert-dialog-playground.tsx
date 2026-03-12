"use client"
/**
 * AlertDialog Props Playground
 *
 * Interactive playground for the AlertDialog component.
 * Allows toggling open state with live preview.
 */

import { createSignal, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { highlightJsxTree, plainJsxTree, type JsxTreeNode } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Checkbox } from '@ui/components/ui/checkbox'
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
} from '@ui/components/ui/alert-dialog'

function AlertDialogPlayground(_props: {}) {
  const [open, setOpen] = createSignal(false)
  const [destructive, setDestructive] = createSignal(false)

  const tree = (): JsxTreeNode => ({
    tag: 'AlertDialog',
    children: [
      { tag: 'AlertDialogTrigger', children: destructive() ? 'Delete Account' : 'Show Dialog' },
      { tag: 'AlertDialogOverlay' },
      {
        tag: 'AlertDialogContent',
        children: [
          {
            tag: 'AlertDialogHeader',
            children: [
              { tag: 'AlertDialogTitle', children: destructive() ? 'Delete Account' : 'Are you absolutely sure?' },
              { tag: 'AlertDialogDescription', children: destructive()
                ? 'All of your data will be permanently removed.'
                : 'This action cannot be undone.' },
            ],
          },
          {
            tag: 'AlertDialogFooter',
            children: [
              { tag: 'AlertDialogCancel', children: 'Cancel' },
              {
                tag: 'AlertDialogAction',
                props: destructive() ? [{ name: 'className', value: 'bg-destructive text-white hover:bg-destructive/90', defaultValue: '' }] : undefined,
                children: destructive() ? 'Delete' : 'Continue',
              },
            ],
          },
        ],
      },
    ],
  })

  createEffect(() => {
    const t = tree()
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) codeEl.innerHTML = highlightJsxTree(t)
  })

  return (
    <PlaygroundLayout
      previewDataAttr="data-alert-dialog-preview"
      previewContent={
        <div className="flex items-center justify-center">
          <AlertDialog open={open()} onOpenChange={setOpen}>
            <AlertDialogTrigger asChild={destructive()}>
              {destructive()
                ? <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 h-10 px-4 py-2 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete Account
                  </button>
                : <>Show Dialog</>
              }
            </AlertDialogTrigger>
            <AlertDialogOverlay />
            <AlertDialogContent
              ariaLabelledby="playground-alert-title"
              ariaDescribedby="playground-alert-desc"
            >
              <AlertDialogHeader>
                <AlertDialogTitle id="playground-alert-title">
                  {destructive() ? 'Delete Account' : 'Are you absolutely sure?'}
                </AlertDialogTitle>
                <AlertDialogDescription id="playground-alert-desc">
                  {destructive()
                    ? 'Are you sure you want to delete your account? All of your data will be permanently removed.'
                    : 'This action cannot be undone. This will permanently delete your account and remove your data from our servers.'}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction className={destructive() ? 'bg-destructive text-white hover:bg-destructive/90' : ''}>
                  {destructive() ? 'Delete' : 'Continue'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      }
      controls={<>
        <PlaygroundControl label="destructive">
          <Checkbox
            checked={destructive()}
            onCheckedChange={setDestructive}
          />
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={plainJsxTree(tree())} />}
    />
  )
}

export { AlertDialogPlayground }
