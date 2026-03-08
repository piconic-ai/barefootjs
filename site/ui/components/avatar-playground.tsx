"use client"
/**
 * Avatar Props Playground
 *
 * Interactive playground for the Avatar component.
 * Allows toggling between image and fallback display.
 */

import { createSignal, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { hlPlain, hlTag } from './shared/playground-highlight'
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
    const f = fallback()
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (!codeEl) return

    if (m === 'image') {
      codeEl.innerHTML =
        `<span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">&lt;</span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D">Avatar</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">&gt;</span>\n` +
        `  <span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">&lt;</span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D">AvatarImage</span> <span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0">src</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">&quot;/avatar.png&quot;</span> <span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0">alt</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">&quot;User&quot;</span> <span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">/&gt;</span>\n` +
        `  <span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">&lt;</span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D">AvatarFallback</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">&gt;</span>${f}<span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">&lt;/</span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D">AvatarFallback</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">&gt;</span>\n` +
        `<span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">&lt;/</span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D">Avatar</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">&gt;</span>`
    } else {
      codeEl.innerHTML =
        `<span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">&lt;</span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D">Avatar</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">&gt;</span>\n` +
        `  <span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">&lt;</span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D">AvatarFallback</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">&gt;</span>${f}<span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">&lt;/</span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D">AvatarFallback</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">&gt;</span>\n` +
        `<span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">&lt;/</span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D">Avatar</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">&gt;</span>`
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
