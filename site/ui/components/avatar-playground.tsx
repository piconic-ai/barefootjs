"use client"
/**
 * Avatar Props Playground
 *
 * Interactive playground for the Avatar component.
 * Allows toggling between image and fallback display.
 */

import { createSignal, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { highlightJsxTree, plainJsxTree, type JsxTreeNode } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@ui/components/ui/select'
import { Input } from '@ui/components/ui/input'
import { Avatar, AvatarImage, AvatarFallback } from '@ui/components/ui/avatar'

type AvatarMode = 'image' | 'fallback'

function AvatarPlayground(_props: {}) {
  const [mode, setMode] = createSignal<AvatarMode>('image')
  const [fallback, setFallback] = createSignal('BF')

  const tree = (): JsxTreeNode => {
    const children: JsxTreeNode[] = []
    if (mode() === 'image') {
      children.push({
        tag: 'AvatarImage',
        props: [
          { name: 'src', value: '/avatar.png', defaultValue: '' },
          { name: 'alt', value: 'User', defaultValue: '' },
        ],
      })
    }
    children.push({ tag: 'AvatarFallback', children: fallback() })
    return { tag: 'Avatar', children }
  }

  createEffect(() => {
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) codeEl.innerHTML = highlightJsxTree(tree())
  })

  return (
    <PlaygroundLayout
      previewDataAttr="data-avatar-preview"
      previewContent={
        <Avatar>
          {mode() === 'image' && (
            <AvatarImage src="https://github.com/kfly8.png" alt="@kfly8" />
          )}
          <AvatarFallback>{fallback()}</AvatarFallback>
        </Avatar>
      }
      controls={<>
        <PlaygroundControl label="mode">
          <Select value={mode()} onValueChange={(v: string) => setMode(v as AvatarMode)}>
            <SelectTrigger>
              <SelectValue placeholder="Select mode..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="image">image</SelectItem>
              <SelectItem value="fallback">fallback only</SelectItem>
            </SelectContent>
          </Select>
        </PlaygroundControl>
        <PlaygroundControl label="fallback text">
          <Input
            type="text"
            value={fallback()}
            onInput={(e: Event) => setFallback((e.target as HTMLInputElement).value)}
          />
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={plainJsxTree(tree())} />}
    />
  )
}

export { AvatarPlayground }
