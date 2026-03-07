"use client"
/**
 * Switch Props Playground
 *
 * Interactive playground for the Switch component.
 * Allows tweaking defaultChecked and disabled props with live preview.
 */

import { createSignal, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { highlightJsxSelfClosing, plainJsxSelfClosing, type HighlightProp } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Checkbox } from '@ui/components/ui/checkbox'
import { Switch } from '@ui/components/ui/switch'

function SwitchPlayground(_props: {}) {
  const [defaultChecked, setDefaultChecked] = createSignal(false)
  const [disabled, setDisabled] = createSignal(false)

  const props = (): HighlightProp[] => [
    { name: 'defaultChecked', value: String(defaultChecked()), defaultValue: 'false', kind: 'boolean' },
    { name: 'disabled', value: String(disabled()), defaultValue: 'false', kind: 'boolean' },
  ]

  createEffect(() => {
    const p = props()
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) codeEl.innerHTML = highlightJsxSelfClosing('Switch', p)
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
      copyButton={<CopyButton code={plainJsxSelfClosing('Switch', props())} />}
    />
  )
}

export { SwitchPlayground }
