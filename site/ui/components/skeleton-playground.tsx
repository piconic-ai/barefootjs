"use client"
/**
 * Skeleton Props Playground
 *
 * Interactive playground for the Skeleton component.
 * Allows switching between shape presets.
 */

import { createSignal, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { highlightJsxSelfClosing, plainJsxSelfClosing, type HighlightProp } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@ui/components/ui/select'
import { Skeleton } from '@ui/components/ui/skeleton'

type SkeletonShape = 'line' | 'circle' | 'card'

const shapeConfig: Record<SkeletonShape, { className: string; display: string }> = {
  line: { className: 'h-4 w-[200px]', display: 'h-4 w-[200px]' },
  circle: { className: 'h-12 w-12 rounded-full', display: 'h-12 w-12 rounded-full' },
  card: { className: 'h-[125px] w-[250px] rounded-xl', display: 'h-[125px] w-[250px] rounded-xl' },
}

function SkeletonPlayground(_props: {}) {
  const [shape, setShape] = createSignal<SkeletonShape>('line')

  const props = (): HighlightProp[] => [
    { name: 'className', value: shapeConfig[shape()].className, defaultValue: '', kind: 'string' },
  ]

  createEffect(() => {
    const p = props()
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) codeEl.innerHTML = highlightJsxSelfClosing('Skeleton', p)
  })

  return (
    <PlaygroundLayout
      previewDataAttr="data-skeleton-preview"
      previewContent={<Skeleton className={shapeConfig[shape()].className} />}
      controls={<>
        <PlaygroundControl label="shape">
          <Select value={shape()} onValueChange={(v: string) => setShape(v as SkeletonShape)}>
            <SelectTrigger>
              <SelectValue placeholder="Select shape..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="line">line</SelectItem>
              <SelectItem value="circle">circle</SelectItem>
              <SelectItem value="card">card</SelectItem>
            </SelectContent>
          </Select>
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={plainJsxSelfClosing('Skeleton', props())} />}
    />
  )
}

export { SkeletonPlayground }
