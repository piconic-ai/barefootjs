"use client"
/**
 * Resizable Props Playground
 *
 * Interactive playground for the Resizable components.
 * Allows tweaking direction and withHandle props with live preview.
 */

import { createSignal, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { type HighlightProp } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@ui/components/ui/select'
import { Checkbox } from '@ui/components/ui/checkbox'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@ui/components/ui/resizable'

type Direction = 'horizontal' | 'vertical'

function ResizablePlayground(_props: {}) {
  const [direction, setDirection] = createSignal<Direction>('horizontal')
  const [withHandle, setWithHandle] = createSignal(false)

  const props = (): HighlightProp[] => [
    { name: 'direction', value: direction(), defaultValue: '' },
  ]

  const handleProps = (): HighlightProp[] => [
    { name: 'withHandle', value: String(withHandle()), defaultValue: 'false', kind: 'boolean' },
  ]

  createEffect(() => {
    const dp = props()
    const hp = handleProps()
    const dirAttr = ` ${dp.map(p => `${p.name}="${p.value}"`).join(' ')}`
    const handleAttr = hp[0].value === 'true' ? ' withHandle' : ''
    const code = `<ResizablePanelGroup${dirAttr}>
  <ResizablePanel defaultSize={50}>One</ResizablePanel>
  <ResizableHandle${handleAttr} />
  <ResizablePanel defaultSize={50}>Two</ResizablePanel>
</ResizablePanelGroup>`
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) codeEl.textContent = code
  })

  return (
    <PlaygroundLayout
      previewDataAttr="data-resizable-preview"
      previewContent={
        <div className="w-full max-w-md">
          <ResizablePanelGroup direction={direction()} class={`${direction() === 'vertical' ? 'min-h-[200px]' : ''} rounded-lg border`}>
            <ResizablePanel defaultSize={50}>
              <div className="flex h-[200px] items-center justify-center p-6">
                <span className="font-semibold">One</span>
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle={withHandle()} />
            <ResizablePanel defaultSize={50}>
              <div className="flex h-[200px] items-center justify-center p-6">
                <span className="font-semibold">Two</span>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      }
      controls={<>
        <PlaygroundControl label="direction">
          <Select value={direction()} onValueChange={(v: string) => setDirection(v as Direction)}>
            <SelectTrigger>
              <SelectValue placeholder="Select direction..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="horizontal">horizontal</SelectItem>
              <SelectItem value="vertical">vertical</SelectItem>
            </SelectContent>
          </Select>
        </PlaygroundControl>
        <PlaygroundControl label="withHandle">
          <Checkbox
            checked={withHandle()}
            onCheckedChange={setWithHandle}
          />
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={`<ResizablePanelGroup direction="${direction()}">
  <ResizablePanel defaultSize={50}>One</ResizablePanel>
  <ResizableHandle${withHandle() ? ' withHandle' : ''} />
  <ResizablePanel defaultSize={50}>Two</ResizablePanel>
</ResizablePanelGroup>`} />}
    />
  )
}

export { ResizablePlayground }
