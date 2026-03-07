"use client"
/**
 * Switch Props Playground
 *
 * Interactive playground for the Switch component.
 * Allows tweaking defaultChecked and disabled props with live preview.
 */

import { createSignal, createMemo, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { hlPlain, hlTag, hlAttr } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Checkbox } from '@ui/components/ui/checkbox'
import { Switch } from '@ui/components/ui/switch'

function highlightSwitchJsx(defaultChecked: boolean, disabled: boolean): string {
  const boolProps: string[] = []
  if (defaultChecked) boolProps.push(` ${hlAttr('defaultChecked')}`)
  if (disabled) boolProps.push(` ${hlAttr('disabled')}`)
  return `${hlPlain('&lt;')}${hlTag('Switch')}${boolProps.join('')}${hlPlain(' /&gt;')}`
}

function SwitchPlayground(_props: {}) {
  const [defaultChecked, setDefaultChecked] = createSignal(false)
  const [disabled, setDisabled] = createSignal(false)

  const codeText = createMemo(() => {
    const parts: string[] = []
    if (defaultChecked()) parts.push(' defaultChecked')
    if (disabled()) parts.push(' disabled')
    return `<Switch${parts.join('')} />`
  })

  createEffect(() => {
    const dc = defaultChecked()
    const d = disabled()

    // Update highlighted code
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) {
      codeEl.innerHTML = highlightSwitchJsx(dc, d)
    }
  })

  return (
    <PlaygroundLayout
      previewDataAttr="data-switch-preview"
      previewContent={<Switch checked={defaultChecked()} disabled={disabled()} />}
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

export { SwitchPlayground }
