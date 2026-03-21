"use client"
/**
 * Kbd Props Playground
 *
 * Interactive playground for the Kbd component.
 * Allows tweaking the children prop with live preview.
 */

import { createSignal, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { highlightJsx, plainJsx, type HighlightProp } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Input } from '@ui/components/ui/input'
import { Kbd } from '@ui/components/ui/kbd'

function KbdPlayground(_props: {}) {
  const [text, setText] = createSignal('⌘')

  const props = (): HighlightProp[] => []

  createEffect(() => {
    const p = props()
    const t = text()
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) codeEl.innerHTML = highlightJsx('Kbd', p, t)
  })

  return (
    <PlaygroundLayout
      previewDataAttr="data-kbd-preview"
      previewContent={<Kbd>{text()}</Kbd>}
      controls={<>
        <PlaygroundControl label="children">
          <Input
            type="text"
            value={text()}
            onInput={(e: Event) => setText((e.target as HTMLInputElement).value)}
          />
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={plainJsx('Kbd', props(), text())} />}
    />
  )
}

export { KbdPlayground }
