"use client"
/**
 * Calendar Props Playground
 *
 * Interactive playground for the Calendar component.
 * Allows switching between single and range selection modes.
 */

import { createSignal, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { highlightJsxSelfClosing, plainJsxSelfClosing, type HighlightProp } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@ui/components/ui/select'
import { Calendar } from '@ui/components/ui/calendar'

type CalendarMode = 'single' | 'range'

function CalendarPlayground(_props: {}) {
  const [mode, setMode] = createSignal<CalendarMode>('single')

  const props = (): HighlightProp[] => [
    { name: 'mode', value: mode(), defaultValue: 'single' },
  ]

  createEffect(() => {
    const p = props()
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) codeEl.innerHTML = highlightJsxSelfClosing('Calendar', p)
  })

  return (
    <PlaygroundLayout
      previewDataAttr="data-calendar-preview"
      previewContent={<Calendar mode={mode()} />}
      controls={<>
        <PlaygroundControl label="mode">
          <Select value={mode()} onValueChange={(v: string) => setMode(v as CalendarMode)}>
            <SelectTrigger>
              <SelectValue placeholder="Select mode..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="single">single</SelectItem>
              <SelectItem value="range">range</SelectItem>
            </SelectContent>
          </Select>
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={plainJsxSelfClosing('Calendar', props())} />}
    />
  )
}

export { CalendarPlayground }
