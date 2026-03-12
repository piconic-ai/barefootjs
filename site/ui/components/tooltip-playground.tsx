"use client"
/**
 * Tooltip Props Playground
 *
 * Interactive playground for the Tooltip component.
 * Allows tweaking placement, delayDuration, and closeDelay props with live preview.
 */

import { createSignal, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { highlightJsxTree, plainJsxTree, type HighlightProp, type JsxTreeNode } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@ui/components/ui/select'
import { Tooltip } from '@ui/components/ui/tooltip'
import { Button } from '@ui/components/ui/button'

function TooltipPlayground(_props: {}) {
  const [placement, setPlacement] = createSignal<'top' | 'right' | 'bottom' | 'left'>('top')
  const [delayDuration, setDelayDuration] = createSignal(0)

  const tooltipProps = (): HighlightProp[] => [
    { name: 'content', value: 'Tooltip content', defaultValue: '' },
    { name: 'placement', value: placement(), defaultValue: 'top' },
    { name: 'delayDuration', value: String(delayDuration()), defaultValue: '0', kind: 'expression' },
  ]

  const tree = (): JsxTreeNode => ({
    tag: 'Tooltip',
    props: tooltipProps(),
    children: [
      {
        tag: 'Button',
        props: [{ name: 'variant', value: 'outline', defaultValue: '' }],
        children: 'Hover me',
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
      previewDataAttr="data-tooltip-preview"
      previewContent={
        <div className="flex items-center justify-center min-h-[200px]">
          <Tooltip
            content="Tooltip content"
            placement={placement()}
            delayDuration={delayDuration()}
            id="tooltip-playground"
          >
            <Button variant="outline">Hover me</Button>
          </Tooltip>
        </div>
      }
      controls={<>
        <PlaygroundControl label="placement">
          <Select value={placement()} onValueChange={(v: string) => setPlacement(v as 'top' | 'right' | 'bottom' | 'left')}>
            <SelectTrigger className="w-28 h-8 text-xs">
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
        <PlaygroundControl label="delayDuration">
          <Select value={String(delayDuration())} onValueChange={(v: string) => setDelayDuration(Number(v))}>
            <SelectTrigger className="w-28 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">0</SelectItem>
              <SelectItem value="200">200</SelectItem>
              <SelectItem value="500">500</SelectItem>
              <SelectItem value="700">700</SelectItem>
            </SelectContent>
          </Select>
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={plainJsxTree(tree())} />}
    />
  )
}

export { TooltipPlayground }
