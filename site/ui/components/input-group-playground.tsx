"use client"
/**
 * InputGroup Props Playground
 *
 * Interactive playground for the InputGroup component.
 * Allows tweaking addon alignment and content with live preview.
 */

import { createSignal, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { highlightJsx, plainJsx, type HighlightProp } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@ui/components/ui/select'
import { Input } from '@ui/components/ui/input'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupText,
  InputGroupInput,
} from '@ui/components/ui/input-group'

type AddonAlign = 'inline-start' | 'inline-end' | 'none'

function InputGroupPlayground(_props: {}) {
  const [align, setAlign] = createSignal<AddonAlign>('inline-start')
  const [addonText, setAddonText] = createSignal('https://')
  const [placeholder, setPlaceholder] = createSignal('example.com')

  const props = (): HighlightProp[] => {
    const items: HighlightProp[] = []
    if (align() !== 'none') {
      items.push({ name: 'align', value: align(), defaultValue: 'inline-start' })
    }
    return items
  }

  createEffect(() => {
    const a = align()
    const t = addonText()
    const p = placeholder()
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (!codeEl) return

    if (a === 'none') {
      codeEl.innerHTML = highlightJsx('InputGroup', [], `\n  ${highlightJsx('InputGroupInput', [{ name: 'placeholder', value: p, defaultValue: '' }], '')}\n`)
    } else {
      const addonProps = a === 'inline-start'
        ? []
        : [{ name: 'align', value: a, defaultValue: 'inline-start' }]
      const addonJsx = highlightJsx('InputGroupAddon', addonProps, `\n    ${highlightJsx('InputGroupText', [], t)}\n  `)
      const inputJsx = highlightJsx('InputGroupInput', [{ name: 'placeholder', value: p, defaultValue: '' }], '')

      if (a === 'inline-start') {
        codeEl.innerHTML = highlightJsx('InputGroup', [], `\n  ${addonJsx}\n  ${inputJsx}\n`)
      } else {
        codeEl.innerHTML = highlightJsx('InputGroup', [], `\n  ${inputJsx}\n  ${addonJsx}\n`)
      }
    }
  })

  return (
    <PlaygroundLayout
      previewDataAttr="data-input-group-preview"
      previewContent={
        <div className="w-64">
          <InputGroup>
            {align() === 'inline-start' && (
              <InputGroupAddon align="inline-start">
                <InputGroupText>{addonText()}</InputGroupText>
              </InputGroupAddon>
            )}
            <InputGroupInput placeholder={placeholder()} />
            {align() === 'inline-end' && (
              <InputGroupAddon align="inline-end">
                <InputGroupText>{addonText()}</InputGroupText>
              </InputGroupAddon>
            )}
          </InputGroup>
        </div>
      }
      controls={<>
        <PlaygroundControl label="addon position">
          <Select value={align()} onValueChange={(v: string) => setAlign(v as AddonAlign)}>
            <SelectTrigger>
              <SelectValue placeholder="Select position..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="inline-start">inline-start</SelectItem>
              <SelectItem value="inline-end">inline-end</SelectItem>
              <SelectItem value="none">none</SelectItem>
            </SelectContent>
          </Select>
        </PlaygroundControl>
        <PlaygroundControl label="addon text">
          <Input
            type="text"
            value={addonText()}
            onInput={(e: Event) => setAddonText((e.target as HTMLInputElement).value)}
          />
        </PlaygroundControl>
        <PlaygroundControl label="placeholder">
          <Input
            type="text"
            value={placeholder()}
            onInput={(e: Event) => setPlaceholder((e.target as HTMLInputElement).value)}
          />
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={plainJsx('InputGroup', props(), '')} />}
    />
  )
}

export { InputGroupPlayground }
