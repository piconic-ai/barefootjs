"use client"
/**
 * Input Props Playground
 *
 * Interactive playground for the Input component.
 * Allows tweaking type, placeholder, and disabled props with live preview.
 */

import { createSignal, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { highlightJsxSelfClosing, plainJsxSelfClosing, type HighlightProp } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@ui/components/ui/select'
import { Input } from '@ui/components/ui/input'
import { Checkbox } from '@ui/components/ui/checkbox'

type InputType = 'text' | 'email' | 'password' | 'number'

function InputPlayground(_props: {}) {
  const [type, setType] = createSignal<InputType>('text')
  const [placeholder, setPlaceholder] = createSignal('Enter text...')
  const [disabled, setDisabled] = createSignal(false)

  const props = (): HighlightProp[] => [
    { name: 'type', value: type(), defaultValue: 'text' },
    { name: 'placeholder', value: placeholder(), defaultValue: '' },
    { name: 'disabled', value: String(disabled()), defaultValue: 'false', kind: 'boolean' },
  ]

  createEffect(() => {
    const p = props()
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) codeEl.innerHTML = highlightJsxSelfClosing('Input', p)
  })

  return (
    <PlaygroundLayout
      previewDataAttr="data-input-preview"
      previewContent={
        <Input
          type={type()}
          placeholder={placeholder()}
          disabled={disabled()}
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
            value={placeholder()}
            onInput={(e: Event) => setPlaceholder((e.target as HTMLInputElement).value)}
          />
        </PlaygroundControl>
        <PlaygroundControl label="disabled">
          <Checkbox
            checked={disabled()}
            onCheckedChange={setDisabled}
          />
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={plainJsxSelfClosing('Input', props())} />}
    />
  )
}

export { InputPlayground }
