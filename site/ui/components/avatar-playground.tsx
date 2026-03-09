"use client"
/**
 * Avatar Props Playground
 *
 * Interactive playground for the Avatar component.
 * Allows toggling between image and fallback display.
 */

import { createSignal, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { escapeHtml, hlPlain, hlTag, hlAttr, hlStr } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@ui/components/ui/select'
import { Input } from '@ui/components/ui/input'
import { Avatar, AvatarImage, AvatarFallback } from '@ui/components/ui/avatar'

type AvatarMode = 'image' | 'fallback'

function AvatarPlayground(_props: {}) {
  const [mode, setMode] = createSignal<AvatarMode>('image')
  const [fallback, setFallback] = createSignal('BF')

  createEffect(() => {
    const m = mode()
    const f = escapeHtml(fallback())
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (!codeEl) return

    if (m === 'image') {
      codeEl.innerHTML =
        `${hlPlain('&lt;')}${hlTag('Avatar')}${hlPlain('&gt;')}\n` +
        `  ${hlPlain('&lt;')}${hlTag('AvatarImage')} ${hlAttr('src')}${hlPlain('=')}${hlStr('&quot;/avatar.png&quot;')} ${hlAttr('alt')}${hlPlain('=')}${hlStr('&quot;User&quot;')} ${hlPlain('/&gt;')}\n` +
        `  ${hlPlain('&lt;')}${hlTag('AvatarFallback')}${hlPlain('&gt;')}${f}${hlPlain('&lt;/')}${hlTag('AvatarFallback')}${hlPlain('&gt;')}\n` +
        `${hlPlain('&lt;/')}${hlTag('Avatar')}${hlPlain('&gt;')}`
    } else {
      codeEl.innerHTML =
        `${hlPlain('&lt;')}${hlTag('Avatar')}${hlPlain('&gt;')}\n` +
        `  ${hlPlain('&lt;')}${hlTag('AvatarFallback')}${hlPlain('&gt;')}${f}${hlPlain('&lt;/')}${hlTag('AvatarFallback')}${hlPlain('&gt;')}\n` +
        `${hlPlain('&lt;/')}${hlTag('Avatar')}${hlPlain('&gt;')}`
    }
  })

  const plainCode = () => {
    const m = mode()
    const f = fallback()
    if (m === 'image') {
      return `<Avatar>\n  <AvatarImage src="/avatar.png" alt="User" />\n  <AvatarFallback>${f}</AvatarFallback>\n</Avatar>`
    }
    return `<Avatar>\n  <AvatarFallback>${f}</AvatarFallback>\n</Avatar>`
  }

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
      copyButton={<CopyButton code={plainCode()} />}
    />
  )
}

export { AvatarPlayground }
