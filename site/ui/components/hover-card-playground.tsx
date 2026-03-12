"use client"
/**
 * Hover Card Props Playground
 *
 * Interactive playground for the HoverCard component.
 * Allows tweaking align and side props with live preview.
 */

import { createSignal, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { highlightJsxTree, plainJsxTree, type HighlightProp, type JsxTreeNode } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@ui/components/ui/select'
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from '@ui/components/ui/hover-card'

function HoverCardPlayground(_props: {}) {
  const [open, setOpen] = createSignal(false)
  const [align, setAlign] = createSignal<'start' | 'center' | 'end'>('center')
  const [side, setSide] = createSignal<'top' | 'bottom'>('bottom')

  const contentProps = (): HighlightProp[] => [
    { name: 'align', value: align(), defaultValue: 'center' },
    { name: 'side', value: side(), defaultValue: 'bottom' },
  ]

  const tree = (): JsxTreeNode => ({
    tag: 'HoverCard',
    children: [
      {
        tag: 'HoverCardTrigger',
        children: '@barefootjs',
      },
      {
        tag: 'HoverCardContent',
        props: contentProps(),
        children: 'Rich content displayed on hover.',
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
      previewDataAttr="data-hover-card-preview"
      previewContent={
        <div className="flex items-center justify-center min-h-[200px]">
          <HoverCard open={open()} onOpenChange={setOpen}>
            <HoverCardTrigger>
              <a
                href="#"
                className="text-sm font-medium underline underline-offset-4 decoration-primary hover:text-primary"
                onClick={(e: MouseEvent) => e.preventDefault()}
              >
                @barefootjs
              </a>
            </HoverCardTrigger>
            <HoverCardContent align={align()} side={side()} className="w-80">
              <div className="flex justify-between space-x-4">
                <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground text-lg font-bold shrink-0">
                  B
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold">@barefootjs</h4>
                  <p className="text-sm text-muted-foreground">
                    JSX to Marked Template + client JS compiler.
                  </p>
                </div>
              </div>
            </HoverCardContent>
          </HoverCard>
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

export { HoverCardPlayground }
