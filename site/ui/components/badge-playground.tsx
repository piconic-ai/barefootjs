"use client"
/**
 * Badge Props Playground
 *
 * Interactive playground for the Badge component.
 * Allows tweaking variant and children props with live preview.
 */

import { createSignal, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { highlightJsx, plainJsx, type HighlightProp } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@ui/components/ui/select'
import { Input } from '@ui/components/ui/input'
import { Badge } from '@ui/components/ui/badge'

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline'

function BadgePlayground(_props: {}) {
  const [variant, setVariant] = createSignal<BadgeVariant>('default')
  const [text, setText] = createSignal('Badge')

  const props = (): HighlightProp[] => [
    { name: 'variant', value: variant(), defaultValue: 'default' },
  ]

  createEffect(() => {
    const p = props()
    const t = text()
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) codeEl.innerHTML = highlightJsx('Badge', p, t)
  })

  return (
    <PlaygroundLayout
      previewDataAttr="data-badge-preview"
      previewContent={<Badge variant={variant()}>{text()}</Badge>}
      controls={<>
        <PlaygroundControl label="variant">
          <Select value={variant()} onValueChange={(v: string) => setVariant(v as BadgeVariant)}>
            <SelectTrigger>
              <SelectValue placeholder="Select variant..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">default</SelectItem>
              <SelectItem value="secondary">secondary</SelectItem>
              <SelectItem value="destructive">destructive</SelectItem>
              <SelectItem value="outline">outline</SelectItem>
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
      copyButton={<CopyButton code={plainJsx('Badge', props(), text())} />}
    />
  )
}

export { BadgePlayground }
