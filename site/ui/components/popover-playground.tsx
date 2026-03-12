"use client"
/**
 * Popover Props Playground
 *
 * Interactive playground for the Popover component.
 * Allows tweaking align and side props with live preview.
 */

import { createSignal, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { highlightJsxTree, plainJsxTree, type HighlightProp, type JsxTreeNode } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@ui/components/ui/select'
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@ui/components/ui/popover'

function PopoverPlayground(_props: {}) {
  const [open, setOpen] = createSignal(false)
  const [align, setAlign] = createSignal<'start' | 'center' | 'end'>('center')
  const [side, setSide] = createSignal<'top' | 'bottom'>('bottom')

  const contentProps = (): HighlightProp[] => [
    { name: 'align', value: align(), defaultValue: 'center' },
    { name: 'side', value: side(), defaultValue: 'bottom' },
  ]

  const tree = (): JsxTreeNode => ({
    tag: 'Popover',
    children: [
      {
        tag: 'PopoverTrigger',
        children: 'Open popover',
      },
      {
        tag: 'PopoverContent',
        props: contentProps(),
        children: 'Place content for the popover here.',
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
      previewDataAttr="data-popover-preview"
      previewContent={
        <div className="flex items-center justify-center min-h-[200px]">
          <Popover open={open()} onOpenChange={setOpen}>
            <PopoverTrigger>
              <span
                className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
              >
                Open popover
              </span>
            </PopoverTrigger>
            <PopoverContent align={align()} side={side()} className="w-80">
              <div className="grid gap-4">
                <div className="space-y-2">
                  <h4 className="font-medium leading-none">Dimensions</h4>
                  <p className="text-sm text-muted-foreground">
                    Set the dimensions for the layer.
                  </p>
                </div>
                <div className="grid gap-2">
                  <div className="grid grid-cols-3 items-center gap-4">
                    <span className="text-sm">Width</span>
                    <input
                      className="col-span-2 h-8 rounded-md border border-border bg-background px-3 text-sm"
                      value="100%"
                    />
                  </div>
                  <div className="grid grid-cols-3 items-center gap-4">
                    <span className="text-sm">Height</span>
                    <input
                      className="col-span-2 h-8 rounded-md border border-border bg-background px-3 text-sm"
                      value="25px"
                    />
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      }
      controls={<>
        <PlaygroundControl label="align">
          <Select value={align()} onValueChange={(v: string) => setAlign(v as 'start' | 'center' | 'end')}>
            <SelectTrigger className="w-28 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="start">start</SelectItem>
              <SelectItem value="center">center</SelectItem>
              <SelectItem value="end">end</SelectItem>
            </SelectContent>
          </Select>
        </PlaygroundControl>
        <PlaygroundControl label="side">
          <Select value={side()} onValueChange={(v: string) => setSide(v as 'top' | 'bottom')}>
            <SelectTrigger className="w-28 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="top">top</SelectItem>
              <SelectItem value="bottom">bottom</SelectItem>
            </SelectContent>
          </Select>
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={plainJsxTree(tree())} />}
    />
  )
}

export { PopoverPlayground }
