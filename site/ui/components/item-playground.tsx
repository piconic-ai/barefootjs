"use client"
/**
 * Item Props Playground
 *
 * Interactive playground for the Item component.
 * Allows tweaking variant, size, and media variant props with live preview.
 */

import { createSignal, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { highlightJsx, plainJsx, type HighlightProp } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@ui/components/ui/select'
import { Item, ItemContent, ItemTitle, ItemDescription, ItemMedia } from '@ui/components/ui/item'

type ItemVariant = 'default' | 'outline' | 'muted'
type ItemSize = 'default' | 'sm'

function ItemPlayground(_props: {}) {
  const [variant, setVariant] = createSignal<ItemVariant>('default')
  const [size, setSize] = createSignal<ItemSize>('default')

  const props = (): HighlightProp[] => [
    { name: 'variant', value: variant(), defaultValue: 'default' },
    { name: 'size', value: size(), defaultValue: 'default' },
  ]

  createEffect(() => {
    const p = props()
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) codeEl.innerHTML = highlightJsx('Item', p, '...')
  })

  return (
    <PlaygroundLayout
      previewDataAttr="data-item-preview"
      previewContent={
        <div className="w-full max-w-md">
          <Item variant={variant()} size={size()}>
            <ItemMedia variant="icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
            </ItemMedia>
            <ItemContent>
              <ItemTitle>Notification</ItemTitle>
              <ItemDescription>You have a new message from the team.</ItemDescription>
            </ItemContent>
          </Item>
        </div>
      }
      controls={<>
        <PlaygroundControl label="variant">
          <Select value={variant()} onValueChange={(v: string) => setVariant(v as ItemVariant)}>
            <SelectTrigger>
              <SelectValue placeholder="Select variant..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">default</SelectItem>
              <SelectItem value="outline">outline</SelectItem>
              <SelectItem value="muted">muted</SelectItem>
            </SelectContent>
          </Select>
        </PlaygroundControl>
        <PlaygroundControl label="size">
          <Select value={size()} onValueChange={(v: string) => setSize(v as ItemSize)}>
            <SelectTrigger>
              <SelectValue placeholder="Select size..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">default</SelectItem>
              <SelectItem value="sm">sm</SelectItem>
            </SelectContent>
          </Select>
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={plainJsx('Item', props(), '...')} />}
    />
  )
}

export { ItemPlayground }
