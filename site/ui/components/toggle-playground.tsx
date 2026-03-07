"use client"
/**
 * Toggle Props Playground
 *
 * Interactive playground for the Toggle component.
 * Allows tweaking variant, size, and pressed state with live preview.
 */

import { createSignal, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { highlightJsx, plainJsx, type HighlightProp } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@ui/components/ui/select'
import { Checkbox } from '@ui/components/ui/checkbox'
import { Toggle } from '@ui/components/ui/toggle'

type ToggleVariant = 'default' | 'outline'
type ToggleSize = 'default' | 'sm' | 'lg'

function TogglePlayground(_props: {}) {
  const [variant, setVariant] = createSignal<ToggleVariant>('default')
  const [size, setSize] = createSignal<ToggleSize>('default')
  const [pressed, setPressed] = createSignal(false)

  const props = (): HighlightProp[] => [
    { name: 'variant', value: variant(), defaultValue: 'default' },
    { name: 'size', value: size(), defaultValue: 'default' },
    { name: 'defaultPressed', value: String(pressed()), defaultValue: 'false', kind: 'boolean' },
  ]

  createEffect(() => {
    const p = props()
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) codeEl.innerHTML = highlightJsx('Toggle', p, 'Toggle')
  })

  return (
    <PlaygroundLayout
      previewDataAttr="data-toggle-preview"
      previewContent={
        <Toggle
          variant={variant()}
          size={size()}
          pressed={pressed()}
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
          <Checkbox
            checked={pressed()}
            onCheckedChange={setPressed}
          />
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={plainJsx('Toggle', props(), 'Toggle')} />}
    />
  )
}

export { TogglePlayground }
