"use client"
/**
 * Context Menu Props Playground
 *
 * Interactive playground for the ContextMenu component.
 * Allows tweaking variant prop on ContextMenuItem with live preview.
 */

import { createSignal, createEffect } from '@barefootjs/client'
import { CopyButton } from './copy-button'
import { highlightJsxTree, plainJsxTree, type JsxTreeNode } from './shared/playground-highlight'
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

function ContextMenuPlayground(_props: {}) {
  const [open, setOpen] = createSignal(false)
  const [variant, setVariant] = createSignal('default')

  const tree = (): JsxTreeNode => ({
    tag: 'ContextMenu',
    children: [
      { tag: 'ContextMenuTrigger', children: '...' },
      {
        tag: 'ContextMenuContent',
        children: [
          { tag: 'ContextMenuItem', props: [{ name: 'variant', value: variant(), defaultValue: 'default' }], children: 'Back' },
          { tag: 'ContextMenuItem', props: [{ name: 'variant', value: variant(), defaultValue: 'default' }], children: 'Forward' },
        ],
      },
    ],
  })

  const codeText = () => plainJsxTree(tree())

  createEffect(() => {
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) codeEl.innerHTML = highlightJsxTree(tree())
  })

  // Update variant classes on live items
  const defaultClasses = 'text-popover-foreground hover:bg-accent/50 focus:bg-accent focus:text-accent-foreground'
  const destructiveClasses = 'text-destructive hover:bg-accent/50 focus:bg-accent focus:text-destructive'
  createEffect(() => {
    const v = variant()
    const container = document.querySelector('[data-context-menu-preview]') as HTMLElement
    if (!container) return
    const items = container.querySelectorAll('[data-slot="context-menu-item"]') as NodeListOf<HTMLElement>
    const removeClasses = v === 'destructive' ? defaultClasses : destructiveClasses
    const addClasses = v === 'destructive' ? destructiveClasses : defaultClasses
    items.forEach(item => {
      removeClasses.split(' ').forEach(c => item.classList.remove(c))
      addClasses.split(' ').forEach(c => item.classList.add(c))
    })
  })

  return (
    <PlaygroundLayout
      previewDataAttr="data-context-menu-preview"
      previewContent={
        <ContextMenu open={open()} onOpenChange={setOpen}>
          <ContextMenuTrigger>
            <div className="flex h-[120px] w-[250px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
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
