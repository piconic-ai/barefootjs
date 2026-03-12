"use client"
/**
 * Sheet Props Playground
 *
 * Interactive playground for the Sheet component.
 * Allows toggling side variants with live preview.
 */

import { createSignal, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { highlightJsxTree, plainJsxTree, type HighlightProp, type JsxTreeNode } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Checkbox } from '@ui/components/ui/checkbox'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@ui/components/ui/select'
import {
  Sheet,
  SheetTrigger,
  SheetOverlay,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from '@ui/components/ui/sheet'

function SheetPlayground(_props: {}) {
  const [open, setOpen] = createSignal(false)
  const [side, setSide] = createSignal<'top' | 'right' | 'bottom' | 'left'>('right')
  const [showCloseButton, setShowCloseButton] = createSignal(true)

  const contentProps = (): HighlightProp[] => {
    const props: HighlightProp[] = [
      { name: 'side', value: `"${side()}"`, defaultValue: '"right"', kind: 'string' },
    ]
    if (!showCloseButton()) {
      props.push({ name: 'showCloseButton', value: 'false', defaultValue: 'true', kind: 'expression' })
    }
    return props
  }

  const tree = (): JsxTreeNode => ({
    tag: 'Sheet',
    props: [
      { name: 'open', value: String(open()), defaultValue: 'false', kind: 'expression' },
      { name: 'onOpenChange', value: 'setOpen', defaultValue: '', kind: 'expression' },
    ],
    children: [
      { tag: 'SheetTrigger', children: 'Open Sheet' },
      { tag: 'SheetOverlay' },
      {
        tag: 'SheetContent',
        props: contentProps(),
        children: [
          {
            tag: 'SheetHeader',
            children: [
              { tag: 'SheetTitle', children: 'Sheet Title' },
              { tag: 'SheetDescription', children: 'Sheet description text.' },
            ],
          },
          {
            tag: 'SheetFooter',
            children: [
              { tag: 'SheetClose', children: 'Close' },
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
      previewDataAttr="data-sheet-preview"
      previewContent={
        <div>
          <Sheet open={open()} onOpenChange={setOpen}>
            <SheetTrigger>Open Sheet</SheetTrigger>
            <SheetOverlay />
            <SheetContent
              side={side()}
              showCloseButton={showCloseButton()}
              ariaLabelledby="playground-sheet-title"
              ariaDescribedby="playground-sheet-description"
            >
              <SheetHeader>
                <SheetTitle id="playground-sheet-title">Sheet Title</SheetTitle>
                <SheetDescription id="playground-sheet-description">
                  Sheet description text.
                </SheetDescription>
              </SheetHeader>
              <SheetFooter>
                <SheetClose>Close</SheetClose>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </div>
      }
      controls={<>
        <PlaygroundControl label="side">
          <Select value={side()} onValueChange={(v: string) => setSide(v as 'top' | 'right' | 'bottom' | 'left')}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="top">top</SelectItem>
              <SelectItem value="right">right</SelectItem>
              <SelectItem value="bottom">bottom</SelectItem>
              <SelectItem value="left">left</SelectItem>
            </SelectContent>
          </Select>
        </PlaygroundControl>
        <PlaygroundControl label="showCloseButton">
          <Checkbox
            checked={showCloseButton()}
            onCheckedChange={setShowCloseButton}
          />
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={plainJsxTree(tree())} />}
    />
  )
}

export { SheetPlayground }
