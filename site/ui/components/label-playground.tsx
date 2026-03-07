"use client"
/**
 * Label Props Playground
 *
 * Interactive playground for the Label component.
 * Allows tweaking children and for props with live preview.
 */

import { createSignal, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { highlightJsx, plainJsx, type HighlightProp } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Input } from '@ui/components/ui/input'
import { Label } from '@ui/components/ui/label'

function LabelPlayground(_props: {}) {
  const [text, setText] = createSignal('Email')
  const [htmlFor, setHtmlFor] = createSignal('email')

  const props = (): HighlightProp[] => [
    { name: 'for', value: htmlFor(), defaultValue: '' },
  ]

  createEffect(() => {
    const p = props()
    const t = text()
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) codeEl.innerHTML = highlightJsx('Label', p, t)
  })

  return (
    <PlaygroundLayout
      previewDataAttr="data-label-preview"
      previewContent={<Label for={htmlFor()}>{text()}</Label>}
      controls={<>
        <PlaygroundControl label="children">
          <Input
            type="text"
            value={text()}
            onInput={(e: Event) => setText((e.target as HTMLInputElement).value)}
          />
        </PlaygroundControl>
        <PlaygroundControl label="for">
          <Input
            type="text"
            value={htmlFor()}
            onInput={(e: Event) => setHtmlFor((e.target as HTMLInputElement).value)}
          />
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={plainJsx('Label', props(), text())} />}
    />
  )
}

export { LabelPlayground }
