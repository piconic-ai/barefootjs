"use client"
/**
 * Checkbox Props Playground
 *
 * Interactive playground for the Checkbox component.
 * Allows tweaking defaultChecked and disabled props with live preview.
 */

import { createSignal, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { highlightJsxSelfClosing, plainJsxSelfClosing, type HighlightProp } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Checkbox } from '@ui/components/ui/checkbox'

function CheckboxPlayground(_props: {}) {
  const [defaultChecked, setDefaultChecked] = createSignal(false)
  const [disabled, setDisabled] = createSignal(false)

  const props = (): HighlightProp[] => [
    { name: 'defaultChecked', value: String(defaultChecked()), defaultValue: 'false', kind: 'boolean' },
    { name: 'disabled', value: String(disabled()), defaultValue: 'false', kind: 'boolean' },
  ]

  createEffect(() => {
    const p = props()
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) codeEl.innerHTML = highlightJsxSelfClosing('Checkbox', p)
  })

  return (
    <PlaygroundLayout
      previewDataAttr="data-checkbox-preview"
      previewContent={
        <div className="flex items-center space-x-2">
          <Checkbox checked={defaultChecked()} disabled={disabled()} />
          <span className="text-sm font-medium leading-none">Accept terms</span>
        </div>
      }
      controls={<>
        <PlaygroundControl label="defaultChecked">
          <Checkbox
            checked={defaultChecked()}
            onCheckedChange={setDefaultChecked}
          />
        </PlaygroundControl>
        <PlaygroundControl label="disabled">
          <Checkbox
            checked={disabled()}
            onCheckedChange={setDisabled}
          />
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={plainJsxSelfClosing('Checkbox', props())} />}
    />
  )
}

export { CheckboxPlayground }
