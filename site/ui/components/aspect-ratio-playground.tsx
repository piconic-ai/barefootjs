"use client"
/**
 * Aspect Ratio Props Playground
 *
 * Interactive playground for the AspectRatio component.
 * Allows tweaking ratio prop with live preview.
 */

import { createSignal, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { highlightJsx, plainJsx, type HighlightProp } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@ui/components/ui/select'
import { AspectRatio } from '@ui/components/ui/aspect-ratio'

type RatioOption = '16 / 9' | '4 / 3' | '1' | '21 / 9'

function AspectRatioPlayground(_props: {}) {
  const [ratio, setRatio] = createSignal<RatioOption>('16 / 9')

  const ratioValue = (): number => {
    const r = ratio()
    if (r === '16 / 9') return 16 / 9
    if (r === '4 / 3') return 4 / 3
    if (r === '21 / 9') return 21 / 9
    return 1
  }

  const props = (): HighlightProp[] => [
    { name: 'ratio', value: ratio(), defaultValue: '1', kind: 'expression' },
  ]

  createEffect(() => {
    const p = props()
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) codeEl.innerHTML = highlightJsx('AspectRatio', p, '...')
  })

  return (
    <PlaygroundLayout
      previewDataAttr="data-aspect-ratio-preview"
      previewContent={
        <div className="w-full max-w-xs">
          <AspectRatio ratio={ratioValue()} className="overflow-hidden rounded-lg bg-muted">
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-sm text-muted-foreground">{ratio()}</span>
            </div>
          </AspectRatio>
        </div>
      }
      controls={<>
        <PlaygroundControl label="ratio">
          <Select value={ratio()} onValueChange={(v: string) => setRatio(v as RatioOption)}>
            <SelectTrigger>
              <SelectValue placeholder="Select ratio..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="16 / 9">16 / 9</SelectItem>
              <SelectItem value="4 / 3">4 / 3</SelectItem>
              <SelectItem value="1">1</SelectItem>
              <SelectItem value="21 / 9">21 / 9</SelectItem>
            </SelectContent>
          </Select>
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={plainJsx('AspectRatio', props(), '...')} />}
    />
  )
}

export { AspectRatioPlayground }
