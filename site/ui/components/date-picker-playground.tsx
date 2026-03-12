"use client"
/**
 * DatePicker Props Playground
 *
 * Interactive playground for the DatePicker component.
 * Allows tweaking placeholder and disabled props with live preview.
 */

import { createSignal, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { highlightJsxSelfClosing, plainJsxSelfClosing, type HighlightProp } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Checkbox } from '@ui/components/ui/checkbox'
import { DatePicker } from '@ui/components/ui/date-picker'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@ui/components/ui/select'

type AlignValue = 'start' | 'center' | 'end'

function DatePickerPlayground(_props: {}) {
  const [selected, setSelected] = createSignal<Date | undefined>(undefined)
  const [disabled, setDisabled] = createSignal(false)
  const [align, setAlign] = createSignal<AlignValue>('start')

  const props = (): HighlightProp[] => [
    { name: 'disabled', value: String(disabled()), defaultValue: 'false', kind: 'boolean' },
    { name: 'align', value: align(), defaultValue: 'start' },
  ]

  createEffect(() => {
    const p = props()
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) codeEl.innerHTML = highlightJsxSelfClosing('DatePicker', p)
  })

  return (
    <PlaygroundLayout
      previewDataAttr="data-date-picker-preview"
      previewContent={
        <DatePicker
          selected={selected()}
          onSelect={setSelected}
          disabled={disabled()}
          align={align()}
        />
      }
      controls={<>
        <PlaygroundControl label="disabled">
          <Checkbox
            checked={disabled()}
            onCheckedChange={setDisabled}
          />
        </PlaygroundControl>
        <PlaygroundControl label="align">
          <Select value={align()} onValueChange={(v: string) => setAlign(v as AlignValue)}>
            <SelectTrigger>
              <SelectValue placeholder="Select align..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="start">start</SelectItem>
              <SelectItem value="center">center</SelectItem>
              <SelectItem value="end">end</SelectItem>
            </SelectContent>
          </Select>
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={plainJsxSelfClosing('DatePicker', props())} />}
    />
  )
}

export { DatePickerPlayground }
