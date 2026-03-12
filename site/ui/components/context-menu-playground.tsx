"use client"
/**
 * Context Menu Props Playground
 *
 * Interactive playground for the ContextMenu component.
 * Allows tweaking variant prop on ContextMenuItem with live preview.
 */

import { createSignal, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { hlPlain, hlTag, hlAttr, hlStr } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
} from '@ui/components/ui/context-menu'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@ui/components/ui/select'

function highlightContextMenuJsx(variant: string): string {
  const variantAttr = variant !== 'default'
    ? ` ${hlAttr('variant')}${hlPlain('=')}${hlStr(`&quot;${variant}&quot;`)}`
    : ''

  const lines = [
    `${hlPlain('&lt;')}${hlTag('ContextMenu')}${hlPlain('&gt;')}`,
    `  ${hlPlain('&lt;')}${hlTag('ContextMenuTrigger')}${hlPlain('&gt;')}...${hlPlain('&lt;/')}${hlTag('ContextMenuTrigger')}${hlPlain('&gt;')}`,
    `  ${hlPlain('&lt;')}${hlTag('ContextMenuContent')}${hlPlain('&gt;')}`,
    `    ${hlPlain('&lt;')}${hlTag('ContextMenuItem')}${variantAttr}${hlPlain('&gt;')}Back${hlPlain('&lt;/')}${hlTag('ContextMenuItem')}${hlPlain('&gt;')}`,
    `    ${hlPlain('&lt;')}${hlTag('ContextMenuItem')}${variantAttr}${hlPlain('&gt;')}Forward${hlPlain('&lt;/')}${hlTag('ContextMenuItem')}${hlPlain('&gt;')}`,
    `  ${hlPlain('&lt;/')}${hlTag('ContextMenuContent')}${hlPlain('&gt;')}`,
    `${hlPlain('&lt;/')}${hlTag('ContextMenu')}${hlPlain('&gt;')}`,
  ]
  return lines.join('\n')
}

function ContextMenuPlayground(_props: {}) {
  const [open, setOpen] = createSignal(false)
  const [variant, setVariant] = createSignal('default')

  const codeText = () => {
    const v = variant()
    const variantProp = v !== 'default' ? ` variant="${v}"` : ''
    return `<ContextMenu>\n  <ContextMenuTrigger>...</ContextMenuTrigger>\n  <ContextMenuContent>\n    <ContextMenuItem${variantProp}>Back</ContextMenuItem>\n    <ContextMenuItem${variantProp}>Forward</ContextMenuItem>\n  </ContextMenuContent>\n</ContextMenu>`
  }

  createEffect(() => {
    const v = variant()
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) codeEl.innerHTML = highlightContextMenuJsx(v)
  })

  // Update variant on live items
  createEffect(() => {
    const v = variant()
    const container = document.querySelector('[data-context-menu-preview]') as HTMLElement
    if (!container) return
    const items = container.querySelectorAll('[data-slot="context-menu-item"]') as NodeListOf<HTMLElement>
    items.forEach(item => {
      item.dataset.variant = v
    })
  })

  return (
    <PlaygroundLayout
      previewDataAttr="data-context-menu-preview"
      previewContent={
        <ContextMenu open={open()} onOpenChange={setOpen}>
          <ContextMenuTrigger>
            <div className="flex h-[120px] w-[250px] items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
              Right-click here
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem variant={variant() as 'default' | 'destructive'}>
              <span>Back</span>
              <ContextMenuShortcut>⌘[</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem variant={variant() as 'default' | 'destructive'}>
              <span>Forward</span>
              <ContextMenuShortcut>⌘]</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem variant={variant() as 'default' | 'destructive'}>
              <span>Reload</span>
              <ContextMenuShortcut>⌘R</ContextMenuShortcut>
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      }
      controls={<>
        <PlaygroundControl label="variant">
          <Select value={variant()} onValueChange={setVariant}>
            <SelectTrigger>
              <SelectValue placeholder="default" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">default</SelectItem>
              <SelectItem value="destructive">destructive</SelectItem>
            </SelectContent>
          </Select>
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={codeText()} />}
    />
  )
}

export { ContextMenuPlayground }
