"use client"
/**
 * Checkbox Props Playground
 *
 * Interactive playground for the Checkbox component.
 * Allows tweaking defaultChecked and disabled props with live preview.
 */

import { createSignal, createMemo, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { hlPlain, hlTag, hlAttr } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Checkbox } from '@ui/components/ui/checkbox'

function highlightCheckboxJsx(defaultChecked: boolean, disabled: boolean): string {
  const boolProps: string[] = []
  if (defaultChecked) boolProps.push(` ${hlAttr('defaultChecked')}`)
  if (disabled) boolProps.push(` ${hlAttr('disabled')}`)
  return `${hlPlain('&lt;')}${hlTag('Checkbox')}${boolProps.join('')}${hlPlain(' /&gt;')}`
}

function CheckboxPlayground(_props: {}) {
  const [defaultChecked, setDefaultChecked] = createSignal(false)
  const [disabled, setDisabled] = createSignal(false)

  const codeText = createMemo(() => {
    const parts: string[] = []
    if (defaultChecked()) parts.push(' defaultChecked')
    if (disabled()) parts.push(' disabled')
    return `<Checkbox${parts.join('')} />`
  })

  createEffect(() => {
    const dc = defaultChecked()
    const d = disabled()

    // Update highlighted code
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) {
      codeEl.innerHTML = highlightCheckboxJsx(dc, d)
    }
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
      copyButton={<CopyButton code={codeText()} />}
    />
  )
}

export { CheckboxPlayground }
