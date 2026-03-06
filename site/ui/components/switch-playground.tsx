"use client"
/**
 * Switch Props Playground
 *
 * Interactive playground for the Switch component.
 * Allows tweaking defaultChecked and disabled props with live preview.
 */

import { createSignal, createMemo, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { hlPlain, hlTag, hlAttr } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Checkbox } from '@ui/components/ui/checkbox'

// Mirror of Switch component class definitions (ui/components/ui/switch/index.tsx)
const trackBaseClasses = 'peer inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent p-0 shadow-xs transition-all outline-none disabled:cursor-not-allowed disabled:opacity-50'
const trackFocusClasses = 'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]'
const trackStateClasses = [
  '[&[data-state=unchecked]]:bg-input',
  'dark:[&[data-state=unchecked]]:bg-input/80',
  '[&[data-state=checked]]:bg-primary',
].join(' ')

const thumbBaseClasses = 'pointer-events-none block size-4 rounded-full bg-background ring-0 transition-transform dark:[&[data-state=unchecked]]:bg-foreground dark:[&[data-state=checked]]:bg-primary-foreground'
const thumbStateClasses = [
  '[&[data-state=unchecked]]:translate-x-0',
  '[&[data-state=checked]]:translate-x-[calc(100%-2px)]',
].join(' ')

function highlightSwitchJsx(defaultChecked: boolean, disabled: boolean): string {
  const boolProps: string[] = []
  if (defaultChecked) boolProps.push(` ${hlAttr('defaultChecked')}`)
  if (disabled) boolProps.push(` ${hlAttr('disabled')}`)
  return `${hlPlain('&lt;')}${hlTag('Switch')}${boolProps.join('')}${hlPlain(' /&gt;')}`
}

function SwitchPlayground(_props: {}) {
  const [defaultChecked, setDefaultChecked] = createSignal(false)
  const [disabled, setDisabled] = createSignal(false)

  const codeText = createMemo(() => {
    const parts: string[] = []
    if (defaultChecked()) parts.push(' defaultChecked')
    if (disabled()) parts.push(' disabled')
    return `<Switch${parts.join('')} />`
  })

  createEffect(() => {
    const dc = defaultChecked()
    const d = disabled()

    // Update switch preview
    const container = document.querySelector('[data-switch-preview]') as HTMLElement
    if (container) {
      const state = dc ? 'checked' : 'unchecked'
      const trackClasses = `${trackBaseClasses} ${trackFocusClasses} ${trackStateClasses}`
      const thumbClasses = `${thumbBaseClasses} ${thumbStateClasses}`

      const btn = document.createElement('button')
      btn.setAttribute('data-slot', 'switch')
      btn.setAttribute('data-state', state)
      btn.setAttribute('role', 'switch')
      btn.setAttribute('aria-checked', String(dc))
      btn.className = trackClasses
      if (d) {
        btn.disabled = true
      }

      const thumb = document.createElement('span')
      thumb.setAttribute('data-slot', 'switch-thumb')
      thumb.setAttribute('data-state', state)
      thumb.className = thumbClasses
      btn.appendChild(thumb)

      // Add click handler for interactive preview
      btn.addEventListener('click', () => {
        const current = btn.getAttribute('aria-checked') === 'true'
        const next = !current
        const nextState = next ? 'checked' : 'unchecked'
        btn.setAttribute('aria-checked', String(next))
        btn.setAttribute('data-state', nextState)
        thumb.setAttribute('data-state', nextState)
      })

      container.innerHTML = ''
      container.appendChild(btn)
    }

    // Update highlighted code
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) {
      codeEl.innerHTML = highlightSwitchJsx(dc, d)
    }
  })

  return (
    <PlaygroundLayout
      previewDataAttr="data-switch-preview"
      controls={<>
        <PlaygroundControl label="defaultChecked">
          <Checkbox
            checked={defaultChecked()}
            onCheckedChange={setDefaultChecked}
          />
        </PlaygroundControl>
        <PlaygroundControl label="disabled">
          <Checkbox
            checked={disabled()}
            onCheckedChange={setDisabled}
          />
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={codeText()} />}
    />
  )
}

export { SwitchPlayground }
