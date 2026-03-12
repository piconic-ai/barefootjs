"use client"
/**
 * Dialog Props Playground
 *
 * Interactive playground for the Dialog component.
 * Allows toggling open state with live preview.
 */

import { createSignal, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { highlightJsxTree, plainJsxTree, type HighlightProp, type JsxTreeNode } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Checkbox } from '@ui/components/ui/checkbox'
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
} from '@ui/components/ui/dialog'

function DialogPlayground(_props: {}) {
  const [open, setOpen] = createSignal(false)

  const dialogProps = (): HighlightProp[] => [
    { name: 'open', value: String(open()), defaultValue: 'false', kind: 'expression' },
    { name: 'onOpenChange', value: 'setOpen', defaultValue: '', kind: 'expression' },
  ]

  const tree = (): JsxTreeNode => ({
    tag: 'Dialog',
    props: dialogProps(),
    children: [
      { tag: 'DialogTrigger', children: 'Open Dialog' },
      { tag: 'DialogOverlay' },
      {
        tag: 'DialogContent',
        children: [
          {
            tag: 'DialogHeader',
            children: [
              { tag: 'DialogTitle', children: 'Dialog Title' },
              { tag: 'DialogDescription', children: 'Dialog description text.' },
            ],
          },
          {
            tag: 'DialogFooter',
            children: [
              { tag: 'DialogClose', children: 'Close' },
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
      previewDataAttr="data-dialog-preview"
      previewContent={
        <div>
          <Dialog open={open()} onOpenChange={setOpen}>
            <DialogTrigger>Open Dialog</DialogTrigger>
            <DialogOverlay />
            <DialogContent
              ariaLabelledby="playground-dialog-title"
              ariaDescribedby="playground-dialog-description"
            >
              <DialogHeader>
                <DialogTitle id="playground-dialog-title">Dialog Title</DialogTitle>
                <DialogDescription id="playground-dialog-description">
                  Dialog description text.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose>Close</DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      }
      controls={<>
        <PlaygroundControl label="open">
          <Checkbox
            checked={open()}
            onCheckedChange={setOpen}
          />
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={plainJsxTree(tree())} />}
    />
  )
}

export { DialogPlayground }
