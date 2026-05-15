"use client"
/**
 * Slider Props Playground
 *
 * Interactive playground for the Slider component.
 * Allows tweaking defaultValue, min, max, step, and disabled props with live preview.
 */

import { createSignal, createMemo, createEffect } from '@barefootjs/client'
import { CopyButton } from './copy-button'
import { highlightJsxSelfClosing, plainJsxSelfClosing, type HighlightProp } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Checkbox } from '@ui/components/ui/checkbox'
import { Slider } from '@ui/components/ui/slider'

function SliderPlayground(_props: {}) {
  const [value, setValue] = createSignal(50)
  const [disabled, setDisabled] = createSignal(false)

  const sliderProps = (): HighlightProp[] => [
    { name: 'defaultValue', value: String(value()), defaultValue: '50', kind: 'expression' as const },
    { name: 'disabled', value: String(disabled()), defaultValue: 'false', kind: 'boolean' as const },
  ]

  const codeText = createMemo(() => plainJsxSelfClosing('Slider', sliderProps()))

  createEffect(() => {
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) codeEl.innerHTML = highlightJsxSelfClosing('Slider', sliderProps())
  })

  return (
    <PlaygroundLayout
      previewDataAttr="data-slider-preview"
      previewContent={
        <div className="w-full max-w-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium leading-none">Value</span>
            <span className="text-sm text-muted-foreground tabular-nums">{value()}</span>
          </div>
          <Slider value={value()} onValueChange={setValue} disabled={disabled()} />
        </div>
      }
      controls={<>
        <PlaygroundControl label="disabled">
          <Checkbox
            checked={disabled()}
            onCheckedChange={setDisabled}
          />
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={codeText()} />}
    />
  )
}

export { SliderPlayground }
