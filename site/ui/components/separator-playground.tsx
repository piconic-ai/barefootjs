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
import { Checkbox } from '@ui/components/ui/checkbox'
import { Separator } from '@ui/components/ui/separator'

type SeparatorOrientation = 'horizontal' | 'vertical'

function SeparatorPlayground(_props: {}) {
  const [orientation, setOrientation] = createSignal<SeparatorOrientation>('horizontal')
  const [decorative, setDecorative] = createSignal(true)

  const props = (): HighlightProp[] => [
    { name: 'orientation', value: orientation(), defaultValue: 'horizontal' },
    { name: 'decorative', value: String(decorative()), defaultValue: 'true', kind: 'boolean' },
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
        <div className={orientation() === 'horizontal' ? 'w-full max-w-xs' : 'flex h-16 items-center'}>
          {orientation() === 'horizontal' ? (
            <div>
              <div className="text-sm font-medium">Above</div>
              <Separator orientation={orientation()} decorative={decorative()} className="my-4" />
              <div className="text-sm font-medium">Below</div>
            </div>
          ) : (
            <div className="flex h-5 items-center space-x-4 text-sm">
              <div>Left</div>
              <Separator orientation={orientation()} decorative={decorative()} />
              <div>Right</div>
            </div>
          )}
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
        <PlaygroundControl label="decorative">
          <Checkbox
            checked={decorative()}
            onCheckedChange={setDecorative}
          />
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={plainJsxSelfClosing('Separator', props())} />}
    />
  )
}

export { SeparatorPlayground }
