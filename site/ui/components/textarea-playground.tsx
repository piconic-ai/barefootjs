"use client"
/**
 * Textarea Props Playground
 *
 * Interactive playground for the Textarea component.
 * Allows tweaking placeholder, disabled, error, and rows props with live preview.
 */

import { createSignal, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { highlightJsxSelfClosing, plainJsxSelfClosing, type HighlightProp } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Input } from '@ui/components/ui/input'
import { Checkbox } from '@ui/components/ui/checkbox'
import { Textarea } from '@ui/components/ui/textarea'

function TextareaPlayground(_props: {}) {
  const [placeholder, setPlaceholder] = createSignal('Type your message here.')
  const [disabled, setDisabled] = createSignal(false)
  const [error, setError] = createSignal(false)
  const [rows, setRows] = createSignal('')

  const props = (): HighlightProp[] => [
    { name: 'placeholder', value: placeholder(), defaultValue: '' },
    { name: 'disabled', value: String(disabled()), defaultValue: 'false', kind: 'boolean' },
    { name: 'error', value: String(error()), defaultValue: 'false', kind: 'boolean' },
    { name: 'rows', value: rows(), defaultValue: '', kind: 'expression' },
  ]

  createEffect(() => {
    const p = props()
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) codeEl.innerHTML = highlightJsxSelfClosing('Textarea', p)
  })

  return (
    <PlaygroundLayout
      previewDataAttr="data-textarea-preview"
      previewContent={
        <Textarea
          placeholder={placeholder()}
          disabled={disabled()}
          error={error()}
          rows={rows() ? parseInt(rows(), 10) : undefined}
        />
      }
      controls={<>
        <PlaygroundControl label="placeholder">
          <Input
            type="text"
            value={placeholder()}
            onInput={(e: Event) => setPlaceholder((e.target as HTMLInputElement).value)}
          />
        </PlaygroundControl>
        <PlaygroundControl label="disabled">
          <Checkbox
            checked={disabled()}
            onCheckedChange={(checked: boolean) => setDisabled(checked)}
          />
        </PlaygroundControl>
        <PlaygroundControl label="error">
          <Checkbox
            checked={error()}
            onCheckedChange={(checked: boolean) => setError(checked)}
          />
        </PlaygroundControl>
        <PlaygroundControl label="rows">
          <Input
            type="number"
            placeholder="unset"
            onInput={(e: Event) => setRows((e.target as HTMLInputElement).value)}
          />
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={plainJsxSelfClosing('Textarea', props())} />}
    />
  )
}

export { TextareaPlayground }
