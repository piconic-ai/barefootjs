"use client"
/**
 * Label Props Playground
 *
 * Interactive playground for the Label component.
 * Allows tweaking children and for props with live preview.
 */

import { createSignal, createMemo, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { hlPlain, hlTag, hlAttr, hlStr } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Input } from '@ui/components/ui/input'

// Mirror of Label component class definitions (ui/components/ui/label/index.tsx)
const labelClasses = 'flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50'

function LabelPlayground(_props: {}) {
  const [text, setText] = createSignal('Email')
  const [htmlFor, setHtmlFor] = createSignal('email')

  const codeText = createMemo(() => {
    const t = text()
    const f = htmlFor()
    const forProp = f ? ` for="${f}"` : ''
    return `<Label${forProp}>${t}</Label>`
  })

  createEffect(() => {
    const t = text()
    const f = htmlFor()

    // Update label preview
    const container = document.querySelector('[data-label-preview]') as HTMLElement
    if (container) {
      const label = document.createElement('label')
      label.setAttribute('data-slot', 'label')
      label.className = labelClasses
      if (f) label.setAttribute('for', f)
      label.textContent = t
      container.innerHTML = ''
      container.appendChild(label)
    }

    // Update highlighted code
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) {
      const forMarkup = f
        ? ` ${hlAttr('for')}${hlPlain('=')}${hlStr(`&quot;${f}&quot;`)}`
        : ''
      codeEl.innerHTML = `${hlPlain('&lt;')}${hlTag('Label')}${forMarkup}${hlPlain('&gt;')}${t}${hlPlain('&lt;/')}${hlTag('Label')}${hlPlain('&gt;')}`
    }
  })

  return (
    <PlaygroundLayout
      previewDataAttr="data-label-preview"
      controls={<>
        <PlaygroundControl label="children">
          <Input
            type="text"
            value="Email"
            onInput={(e: Event) => setText((e.target as HTMLInputElement).value)}
          />
        </PlaygroundControl>
        <PlaygroundControl label="for">
          <Input
            type="text"
            value="email"
            onInput={(e: Event) => setHtmlFor((e.target as HTMLInputElement).value)}
          />
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={codeText()} />}
    />
  )
}

export { LabelPlayground }
