"use client"
/**
 * Select Props Playground
 *
 * Interactive playground for the Select component.
 * Allows tweaking placeholder and disabled props with live preview.
 *
 * Unlike badge/button playgrounds, the preview uses a real Select component
 * (not DOM manipulation) because Select requires hydration for interactivity.
 */

import { createSignal, createMemo, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { hlPlain, hlTag, hlAttr, hlStr, escapeHtml } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@ui/components/ui/select'
import { Input } from '@ui/components/ui/input'
import { Checkbox } from '@ui/components/ui/checkbox'

/**
 * Generate syntax-highlighted JSX for the Select compound component.
 */
function highlightSelectJsx(placeholder: string, disabled: boolean): string {
  const disabledAttr = disabled ? ` ${hlAttr('disabled')}` : ''
  const placeholderAttr = placeholder !== 'Select a fruit...'
    ? ` ${hlAttr('placeholder')}${hlPlain('=')}${hlStr(`&quot;${escapeHtml(placeholder)}&quot;`)}`
    : ` ${hlAttr('placeholder')}${hlPlain('=')}${hlStr('&quot;Select a fruit...&quot;')}`

  const lines = [
    `${hlPlain('&lt;')}${hlTag('Select')}${disabledAttr}${hlPlain('&gt;')}`,
    `  ${hlPlain('&lt;')}${hlTag('SelectTrigger')}${hlPlain('&gt;')}`,
    `    ${hlPlain('&lt;')}${hlTag('SelectValue')}${placeholderAttr} ${hlPlain('/&gt;')}`,
    `  ${hlPlain('&lt;/')}${hlTag('SelectTrigger')}${hlPlain('&gt;')}`,
    `  ${hlPlain('&lt;')}${hlTag('SelectContent')}${hlPlain('&gt;')}`,
    `    ${hlPlain('&lt;')}${hlTag('SelectItem')} ${hlAttr('value')}${hlPlain('=')}${hlStr('&quot;apple&quot;')}${hlPlain('&gt;')}Apple${hlPlain('&lt;/')}${hlTag('SelectItem')}${hlPlain('&gt;')}`,
    `    ${hlPlain('&lt;')}${hlTag('SelectItem')} ${hlAttr('value')}${hlPlain('=')}${hlStr('&quot;banana&quot;')}${hlPlain('&gt;')}Banana${hlPlain('&lt;/')}${hlTag('SelectItem')}${hlPlain('&gt;')}`,
    `    ${hlPlain('&lt;')}${hlTag('SelectItem')} ${hlAttr('value')}${hlPlain('=')}${hlStr('&quot;orange&quot;')}${hlPlain('&gt;')}Orange${hlPlain('&lt;/')}${hlTag('SelectItem')}${hlPlain('&gt;')}`,
    `  ${hlPlain('&lt;/')}${hlTag('SelectContent')}${hlPlain('&gt;')}`,
    `${hlPlain('&lt;/')}${hlTag('Select')}${hlPlain('&gt;')}`,
  ]
  return lines.join('\n')
}

function SelectPlayground(_props: {}) {
  const [placeholder, setPlaceholder] = createSignal('Select a fruit...')
  const [disabled, setDisabled] = createSignal(false)
  const [value, setValue] = createSignal('')

  const codeText = createMemo(() => {
    const p = placeholder()
    const d = disabled()
    const disabledProp = d ? ' disabled' : ''
    return `<Select${disabledProp}>\n  <SelectTrigger>\n    <SelectValue placeholder="${p}" />\n  </SelectTrigger>\n  <SelectContent>\n    <SelectItem value="apple">Apple</SelectItem>\n    <SelectItem value="banana">Banana</SelectItem>\n    <SelectItem value="orange">Orange</SelectItem>\n  </SelectContent>\n</Select>`
  })

  // Update placeholder text on the real Select when control changes
  createEffect(() => {
    const p = placeholder()
    const v = value()
    const container = document.querySelector('[data-select-preview]') as HTMLElement
    if (!container) return
    const valueEl = container.querySelector('[data-slot="select-value"]') as HTMLElement
    if (valueEl && !v) {
      valueEl.textContent = p
    }
    // Update trigger's data-placeholder attribute
    const trigger = container.querySelector('[data-slot="select-trigger"]') as HTMLElement
    if (trigger) {
      if (!v) {
        trigger.setAttribute('data-placeholder', '')
      } else {
        trigger.removeAttribute('data-placeholder')
      }
    }
  })

  // Update disabled state on the real Select when control changes
  createEffect(() => {
    const d = disabled()
    const container = document.querySelector('[data-select-preview]') as HTMLElement
    if (!container) return
    const trigger = container.querySelector('[data-slot="select-trigger"]') as HTMLButtonElement
    if (trigger) {
      trigger.disabled = d
    }
  })

  // Update highlighted code
  createEffect(() => {
    const p = placeholder()
    const d = disabled()
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) {
      codeEl.innerHTML = highlightSelectJsx(p, d)
    }
  })

  return (
    <PlaygroundLayout
      previewDataAttr="data-select-preview"
      previewContent={
        <Select value={value()} onValueChange={setValue} disabled={disabled()}>
          <SelectTrigger>
            <SelectValue placeholder={placeholder()} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="apple">Apple</SelectItem>
            <SelectItem value="banana">Banana</SelectItem>
            <SelectItem value="orange">Orange</SelectItem>
          </SelectContent>
        </Select>
      }
      controls={<>
        <PlaygroundControl label="placeholder">
          <Input
            type="text"
            value="Select a fruit..."
            onInput={(e: Event) => setPlaceholder((e.target as HTMLInputElement).value)}
          />
        </PlaygroundControl>
        <PlaygroundControl label="disabled">
          <Checkbox
            defaultChecked={false}
            onCheckedChange={(v: boolean) => setDisabled(v)}
          />
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={codeText()} />}
    />
  )
}

export { SelectPlayground }
