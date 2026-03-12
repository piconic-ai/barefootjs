"use client"
/**
 * Spinner Props Playground
 *
 * Interactive playground for the Spinner component.
 * Allows switching between size presets.
 */

import { createSignal, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { highlightJsxSelfClosing, plainJsxSelfClosing, type HighlightProp } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@ui/components/ui/select'
import { Spinner } from '@ui/components/ui/spinner'

type SpinnerSize = 'default' | 'size-4' | 'size-6' | 'size-8' | 'size-12'

const sizeConfig: Record<SpinnerSize, { className: string; display: string }> = {
  'default': { className: '', display: '(default)' },
  'size-4': { className: 'size-4', display: 'size-4' },
  'size-6': { className: 'size-6', display: 'size-6' },
  'size-8': { className: 'size-8', display: 'size-8' },
  'size-12': { className: 'size-12', display: 'size-12' },
}

function SpinnerPlayground(_props: {}) {
  const [size, setSize] = createSignal<SpinnerSize>('default')

  const props = (): HighlightProp[] => {
    const cfg = sizeConfig[size()]
    return cfg.className
      ? [{ name: 'className', value: cfg.className, defaultValue: '', kind: 'string' }]
      : []
  }

  createEffect(() => {
    const p = props()
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) codeEl.innerHTML = highlightJsxSelfClosing('Spinner', p)
  })

  return (
    <PlaygroundLayout
      previewDataAttr="data-spinner-preview"
      previewContent={<Spinner className={sizeConfig[size()].className} />}
      controls={<>
        <PlaygroundControl label="size">
          <Select value={size()} onValueChange={(v: string) => setSize(v as SpinnerSize)}>
            <SelectTrigger>
              <SelectValue placeholder="Select size..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">default</SelectItem>
              <SelectItem value="size-4">size-4</SelectItem>
              <SelectItem value="size-6">size-6</SelectItem>
              <SelectItem value="size-8">size-8</SelectItem>
              <SelectItem value="size-12">size-12</SelectItem>
            </SelectContent>
          </Select>
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={plainJsxSelfClosing('Spinner', props())} />}
    />
  )
}

export { SpinnerPlayground }
