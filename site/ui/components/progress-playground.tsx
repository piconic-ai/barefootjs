"use client"
/**
 * Progress Props Playground
 *
 * Interactive playground for the Progress component.
 * Allows tweaking value and max props with live preview.
 */

import { createSignal, createMemo, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { hlPlain, hlTag, hlAttr } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Slider } from '@ui/components/ui/slider'
import { Progress } from '@ui/components/ui/progress'

function highlightProgressJsx(value: number, max: number): string {
  const props: string[] = []
  props.push(` ${hlAttr('value')}${hlPlain('={')}${value}${hlPlain('}')}`)
  if (max !== 100) props.push(` ${hlAttr('max')}${hlPlain('={')}${max}${hlPlain('}')}`)
  return `${hlPlain('&lt;')}${hlTag('Progress')}${props.join('')} ${hlPlain('/&gt;')}`
}

function ProgressPlayground(_props: {}) {
  const [value, setValue] = createSignal(50)
  const [max, setMax] = createSignal(100)

  const percentage = createMemo(() =>
    Math.round((value() / max()) * 100)
  )

  const codeText = createMemo(() => {
    const parts: string[] = [`value={${value()}}`]
    if (max() !== 100) parts.push(`max={${max()}}`)
    return `<Progress ${parts.join(' ')} />`
  })

  createEffect(() => {
    const v = value()
    const m = max()
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) {
      codeEl.innerHTML = highlightProgressJsx(v, m)
    }
  })

  return (
    <PlaygroundLayout
      previewDataAttr="data-progress-preview"
      previewContent={
        <div className="w-full max-w-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium leading-none">Progress</span>
            <span className="text-sm text-muted-foreground tabular-nums">{percentage()}%</span>
          </div>
          <Progress value={value()} max={max()} />
        </div>
      }
      controls={<>
        <PlaygroundControl label="value">
          <div className="space-y-1">
            <Slider value={value()} min={0} max={max()} onValueChange={setValue} />
            <span className="text-xs text-muted-foreground tabular-nums">{value()}</span>
          </div>
        </PlaygroundControl>
        <PlaygroundControl label="max">
          <div className="space-y-1">
            <Slider value={max()} min={1} max={200} onValueChange={setMax} />
            <span className="text-xs text-muted-foreground tabular-nums">{max()}</span>
          </div>
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={codeText()} />}
    />
  )
}

export { ProgressPlayground }
