"use client"
/**
 * Toggle Props Playground
 *
 * Interactive playground for the Toggle component.
 * Allows tweaking variant, size, and pressed state with live preview.
 */

import { createSignal, createMemo, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { highlightJsx } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@ui/components/ui/select'
import { Toggle } from '@ui/components/ui/toggle'

type ToggleVariant = 'default' | 'outline'
type ToggleSize = 'default' | 'sm' | 'lg'

function TogglePlayground(_props: {}) {
  const [variant, setVariant] = createSignal<ToggleVariant>('default')
  const [size, setSize] = createSignal<ToggleSize>('default')
  const [pressed, setPressed] = createSignal('false')

  const codeText = createMemo(() => {
    const v = variant()
    const s = size()
    const p = pressed()
    const parts: string[] = []
    if (v !== 'default') parts.push(`variant="${v}"`)
    if (s !== 'default') parts.push(`size="${s}"`)
    if (p === 'true') parts.push('defaultPressed')
    const propsStr = parts.length > 0 ? ` ${parts.join(' ')}` : ''
    return `<Toggle${propsStr}>Toggle</Toggle>`
  })

  createEffect(() => {
    const v = variant()
    const s = size()
    // Update highlighted code
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) {
      codeEl.innerHTML = highlightJsx(
        'Toggle',
        [
          { name: 'variant', value: v, defaultValue: 'default' },
          { name: 'size', value: s, defaultValue: 'default' },
        ],
        'Toggle',
      )
    }
  })

  return (
    <PlaygroundLayout
      previewDataAttr="data-toggle-preview"
      previewContent={
        <Toggle
          variant={variant()}
          size={size()}
          defaultPressed={pressed() === 'true'}
        >
          Toggle
        </Toggle>
      }
      controls={<>
        <PlaygroundControl label="variant">
          <Select value={variant()} onValueChange={(v: string) => setVariant(v as ToggleVariant)}>
            <SelectTrigger>
              <SelectValue placeholder="Select variant..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">default</SelectItem>
              <SelectItem value="outline">outline</SelectItem>
            </SelectContent>
          </Select>
        </PlaygroundControl>
        <PlaygroundControl label="size">
          <Select value={size()} onValueChange={(v: string) => setSize(v as ToggleSize)}>
            <SelectTrigger>
              <SelectValue placeholder="Select size..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">default</SelectItem>
              <SelectItem value="sm">sm</SelectItem>
              <SelectItem value="lg">lg</SelectItem>
            </SelectContent>
          </Select>
        </PlaygroundControl>
        <PlaygroundControl label="pressed">
          <Select value={pressed()} onValueChange={(v: string) => setPressed(v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select state..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="false">off</SelectItem>
              <SelectItem value="true">on</SelectItem>
            </SelectContent>
          </Select>
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={codeText()} />}
    />
  )
}

export { TogglePlayground }
