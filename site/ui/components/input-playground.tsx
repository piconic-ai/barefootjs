"use client"
/**
 * Input Props Playground
 *
 * Interactive playground for the Input component.
 * Allows tweaking type, placeholder, and disabled props with live preview.
 */

import { createSignal, createMemo, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { highlightJsxSelfClosing } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@ui/components/ui/select'
import { Input } from '@ui/components/ui/input'

type InputType = 'text' | 'email' | 'password' | 'number'

function InputPlayground(_props: {}) {
  const [type, setType] = createSignal<InputType>('text')
  const [placeholder, setPlaceholder] = createSignal('Enter text...')
  const [disabled, setDisabled] = createSignal('false')

  const codeText = createMemo(() => {
    const t = type()
    const p = placeholder()
    const d = disabled()
    const parts: string[] = []
    if (t !== 'text') parts.push(`type="${t}"`)
    if (p) parts.push(`placeholder="${p}"`)
    if (d === 'true') parts.push('disabled')
    const propsStr = parts.length > 0 ? ` ${parts.join(' ')}` : ''
    return `<Input${propsStr} />`
  })

  createEffect(() => {
    const t = type()
    const p = placeholder()
    const d = disabled()

    // Update highlighted code
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) {
      const props = [
        { name: 'type', value: t, defaultValue: 'text' },
        { name: 'placeholder', value: p, defaultValue: '' },
        { name: 'disabled', value: d, defaultValue: 'false' },
      ]
      codeEl.innerHTML = highlightJsxSelfClosing('Input', props)
    }
  })

  return (
    <PlaygroundLayout
      previewDataAttr="data-input-preview"
      previewContent={
        <Input
          type={type()}
          placeholder={placeholder()}
          disabled={disabled() === 'true'}
          className="max-w-sm"
        />
      }
      controls={<>
        <PlaygroundControl label="type">
          <Select value={type()} onValueChange={(v: string) => setType(v as InputType)}>
            <SelectTrigger>
              <SelectValue placeholder="Select type..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="text">text</SelectItem>
              <SelectItem value="email">email</SelectItem>
              <SelectItem value="password">password</SelectItem>
              <SelectItem value="number">number</SelectItem>
            </SelectContent>
          </Select>
        </PlaygroundControl>
        <PlaygroundControl label="placeholder">
          <Input
            type="text"
            value="Enter text..."
            onInput={(e: Event) => setPlaceholder((e.target as HTMLInputElement).value)}
          />
        </PlaygroundControl>
        <PlaygroundControl label="disabled">
          <Select value={disabled()} onValueChange={(v: string) => setDisabled(v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="false">false</SelectItem>
              <SelectItem value="true">true</SelectItem>
            </SelectContent>
          </Select>
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={codeText()} />}
    />
  )
}

export { InputPlayground }
