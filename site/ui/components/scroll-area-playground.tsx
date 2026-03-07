"use client"
/**
 * ScrollArea Props Playground
 *
 * Interactive playground for the ScrollArea component.
 * Allows tweaking type prop with live preview.
 */

import { createSignal, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { highlightJsx, plainJsx, type HighlightProp } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@ui/components/ui/select'
import { ScrollArea } from '@ui/components/ui/scroll-area'
import { Separator } from '@ui/components/ui/separator'

type ScrollAreaType = 'hover' | 'scroll' | 'auto' | 'always'

const tags = Array.from({ length: 20 }).map(
  (_, i, a) => `v1.2.0-beta.${a.length - i}`
)

function ScrollAreaPlayground(_props: {}) {
  const [type, setType] = createSignal<ScrollAreaType>('hover')

  const props = (): HighlightProp[] => [
    { name: 'type', value: type(), defaultValue: 'hover' },
  ]

  createEffect(() => {
    const p = props()
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) codeEl.innerHTML = highlightJsx('ScrollArea', p, '...')
  })

  return (
    <PlaygroundLayout
      previewDataAttr="data-scroll-area-preview"
      previewContent={
        <ScrollArea class="h-48 w-48 rounded-md border" type={type()}>
          <div className="p-4">
            <h4 className="mb-4 text-sm font-medium leading-none">Tags</h4>
            {tags.map((tag) => (
              <div>
                <div className="text-sm">{tag}</div>
                <Separator className="my-2" />
              </div>
            ))}
          </div>
        </ScrollArea>
      }
      controls={<>
        <PlaygroundControl label="type">
          <Select value={type()} onValueChange={(v: string) => setType(v as ScrollAreaType)}>
            <SelectTrigger>
              <SelectValue placeholder="Select type..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hover">hover</SelectItem>
              <SelectItem value="scroll">scroll</SelectItem>
              <SelectItem value="auto">auto</SelectItem>
              <SelectItem value="always">always</SelectItem>
            </SelectContent>
          </Select>
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={plainJsx('ScrollArea', props(), '...')} />}
    />
  )
}

export { ScrollAreaPlayground }
