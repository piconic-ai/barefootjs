"use client"
/**
 * Textarea Props Playground
 *
 * Interactive playground for the Textarea component.
 * Allows tweaking placeholder, disabled, error, and rows props with live preview.
 */

import { createSignal, createMemo, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { hlPlain, hlTag, hlAttr, hlStr, escapeHtml } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Input } from '@ui/components/ui/input'
import { Checkbox } from '@ui/components/ui/checkbox'
import { Textarea } from '@ui/components/ui/textarea'

function TextareaPlayground(_props: {}) {
  const [placeholder, setPlaceholder] = createSignal('Type your message here.')
  const [disabled, setDisabled] = createSignal(false)
  const [error, setError] = createSignal(false)
  const [rows, setRows] = createSignal('')

  const codeText = createMemo(() => {
    const parts: string[] = []
    const p = placeholder()
    if (p) parts.push(`placeholder="${p}"`)
    if (disabled()) parts.push('disabled')
    if (error()) parts.push('error')
    const r = rows()
    if (r) parts.push(`rows={${r}}`)
    const propsStr = parts.length > 0 ? ` ${parts.join(' ')}` : ''
    return `<Textarea${propsStr} />`
  })

  createEffect(() => {
    const p = placeholder()
    const d = disabled()
    const e = error()
    const r = rows()

    // Update highlighted code
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) {
      const propParts: string[] = []
      if (p) {
        propParts.push(` ${hlAttr('placeholder')}${hlPlain('=')}${hlStr(`&quot;${escapeHtml(p)}&quot;`)}`)
      }
      if (d) propParts.push(` ${hlAttr('disabled')}`)
      if (e) propParts.push(` ${hlAttr('error')}`)
      if (r) {
        propParts.push(` ${hlAttr('rows')}${hlPlain('={')}${hlPlain(r)}${hlPlain('}')}`)
      }
      codeEl.innerHTML = `${hlPlain('&lt;')}${hlTag('Textarea')}${propParts.join('')}${hlPlain(' /&gt;')}`
    }
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
            value="Type your message here."
            onInput={(e: Event) => setPlaceholder((e.target as HTMLInputElement).value)}
          />
        </PlaygroundControl>
        <PlaygroundControl label="disabled">
          <Checkbox
            defaultChecked={false}
            onCheckedChange={(checked: boolean) => setDisabled(checked)}
          />
        </PlaygroundControl>
        <PlaygroundControl label="error">
          <Checkbox
            defaultChecked={false}
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
      copyButton={<CopyButton code={codeText()} />}
    />
  )
}

export { TextareaPlayground }
