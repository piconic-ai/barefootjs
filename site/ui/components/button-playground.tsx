"use client"
/**
 * Button Props Playground
 *
 * Interactive playground for the Button component.
 * Allows tweaking variant, size, and children props with live preview.
 */

import { createSignal, createMemo, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { highlightJsx } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@ui/components/ui/select'
import { Input } from '@ui/components/ui/input'
import { Button } from '@ui/components/ui/button'

type ButtonVariant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
type ButtonSize = 'default' | 'sm' | 'lg' | 'icon' | 'icon-sm' | 'icon-lg'

function ButtonPlayground(_props: {}) {
  const [variant, setVariant] = createSignal<ButtonVariant>('default')
  const [size, setSize] = createSignal<ButtonSize>('default')
  const [text, setText] = createSignal('Button')

  const codeText = createMemo(() => {
    const v = variant()
    const s = size()
    const t = text()
    const parts: string[] = []
    if (v !== 'default') parts.push(`variant="${v}"`)
    if (s !== 'default') parts.push(`size="${s}"`)
    const propsStr = parts.length > 0 ? ` ${parts.join(' ')}` : ''
    return `<Button${propsStr}>${t}</Button>`
  })

  createEffect(() => {
    const v = variant()
    const s = size()
    const t = text()

    // Update highlighted code
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) {
      codeEl.innerHTML = highlightJsx(
        'Button',
        [
          { name: 'variant', value: v, defaultValue: 'default' },
          { name: 'size', value: s, defaultValue: 'default' },
        ],
        t,
      )
    }
  })

  return (
    <PlaygroundLayout
      previewDataAttr="data-button-preview"
      previewContent={<Button variant={variant()} size={size()}>{text()}</Button>}
      controls={<>
        <PlaygroundControl label="variant">
          <Select value={variant()} onValueChange={(v: string) => setVariant(v as ButtonVariant)}>
            <SelectTrigger>
              <SelectValue placeholder="Select variant..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">default</SelectItem>
              <SelectItem value="destructive">destructive</SelectItem>
              <SelectItem value="outline">outline</SelectItem>
              <SelectItem value="secondary">secondary</SelectItem>
              <SelectItem value="ghost">ghost</SelectItem>
              <SelectItem value="link">link</SelectItem>
            </SelectContent>
          </Select>
        </PlaygroundControl>
        <PlaygroundControl label="size">
          <Select value={size()} onValueChange={(v: string) => setSize(v as ButtonSize)}>
            <SelectTrigger>
              <SelectValue placeholder="Select size..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">default</SelectItem>
              <SelectItem value="sm">sm</SelectItem>
              <SelectItem value="lg">lg</SelectItem>
              <SelectItem value="icon">icon</SelectItem>
              <SelectItem value="icon-sm">icon-sm</SelectItem>
              <SelectItem value="icon-lg">icon-lg</SelectItem>
            </SelectContent>
          </Select>
        </PlaygroundControl>
        <PlaygroundControl label="children">
          <Input
            type="text"
            value={text()}
            onInput={(e: Event) => setText((e.target as HTMLInputElement).value)}
          />
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={codeText()} />}
    />
  )
}

export { ButtonPlayground }
