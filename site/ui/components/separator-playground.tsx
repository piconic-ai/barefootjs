"use client"
/**
 * Separator Props Playground
 *
 * Interactive playground for the Separator component.
 * Allows tweaking orientation and decorative props with live preview.
 */

import { createSignal, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { highlightJsxSelfClosing, plainJsxSelfClosing, type HighlightProp } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@ui/components/ui/select'
import { Separator } from '@ui/components/ui/separator'

type SeparatorOrientation = 'horizontal' | 'vertical'

function SeparatorPlayground(_props: {}) {
  const [orientation, setOrientation] = createSignal<SeparatorOrientation>('horizontal')

  const props = (): HighlightProp[] => [
    { name: 'orientation', value: orientation(), defaultValue: 'horizontal' },
  ]

  createEffect(() => {
    const p = props()
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) codeEl.innerHTML = highlightJsxSelfClosing('Separator', p)
  })

  return (
    <PlaygroundLayout
      previewDataAttr="data-separator-preview"
      previewContent={
        <div className="flex h-32 w-64 items-center justify-center rounded-md border p-4">
          <Separator orientation={orientation()} />
        </div>
      }
      controls={<>
        <PlaygroundControl label="orientation">
          <Select value={orientation()} onValueChange={(v: string) => setOrientation(v as SeparatorOrientation)}>
            <SelectTrigger>
              <SelectValue placeholder="Select orientation..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="horizontal">horizontal</SelectItem>
              <SelectItem value="vertical">vertical</SelectItem>
            </SelectContent>
          </Select>
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={plainJsxSelfClosing('Separator', props())} />}
    />
  )
}

export { SeparatorPlayground }
