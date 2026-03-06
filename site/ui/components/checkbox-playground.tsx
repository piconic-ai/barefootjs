"use client"
/**
 * Checkbox Props Playground
 *
 * Interactive playground for the Checkbox component.
 * Allows tweaking defaultChecked and disabled props with live preview.
 */

import { createSignal, createMemo, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { hlPlain, hlTag, hlAttr } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Checkbox } from '@ui/components/ui/checkbox'

// Mirror of Checkbox component class definitions (ui/components/ui/checkbox/index.tsx)
const checkboxBaseClasses = 'peer size-4 shrink-0 rounded-[4px] border shadow-xs transition-shadow outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50'
const checkboxFocusClasses = 'focus-visible:border-ring focus-visible:ring-ring/50'
const checkboxErrorClasses = 'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive'
const checkboxStateClasses = [
  '[&[data-state=unchecked]]:border-input',
  'dark:[&[data-state=unchecked]]:bg-input/30',
  '[&[data-state=unchecked]]:bg-background',
  '[&[data-state=checked]]:bg-primary',
  '[&[data-state=checked]]:text-primary-foreground',
  '[&[data-state=checked]]:border-primary',
].join(' ')

function highlightCheckboxJsx(defaultChecked: boolean, disabled: boolean): string {
  const boolProps: string[] = []
  if (defaultChecked) boolProps.push(` ${hlAttr('defaultChecked')}`)
  if (disabled) boolProps.push(` ${hlAttr('disabled')}`)
  return `${hlPlain('&lt;')}${hlTag('Checkbox')}${boolProps.join('')}${hlPlain(' /&gt;')}`
}

function CheckboxPlayground(_props: {}) {
  const [defaultChecked, setDefaultChecked] = createSignal(false)
  const [disabled, setDisabled] = createSignal(false)

  const codeText = createMemo(() => {
    const parts: string[] = []
    if (defaultChecked()) parts.push(' defaultChecked')
    if (disabled()) parts.push(' disabled')
    return `<Checkbox${parts.join('')} />`
  })

  createEffect(() => {
    const dc = defaultChecked()
    const d = disabled()

    // Update checkbox preview
    const container = document.querySelector('[data-checkbox-preview]') as HTMLElement
    if (container) {
      const state = dc ? 'checked' : 'unchecked'
      const allClasses = `${checkboxBaseClasses} ${checkboxFocusClasses} ${checkboxErrorClasses} ${checkboxStateClasses} grid place-content-center`

      const btn = document.createElement('button')
      btn.setAttribute('data-slot', 'checkbox')
      btn.setAttribute('data-state', state)
      btn.setAttribute('role', 'checkbox')
      btn.setAttribute('aria-checked', String(dc))
      btn.className = allClasses
      if (d) {
        btn.disabled = true
      }

      if (dc) {
        btn.innerHTML = '<svg data-slot="checkbox-indicator" class="size-3.5 text-current" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>'
      }

      // Add click handler for interactive preview
      btn.addEventListener('click', () => {
        const current = btn.getAttribute('aria-checked') === 'true'
        const next = !current
        btn.setAttribute('aria-checked', String(next))
        btn.setAttribute('data-state', next ? 'checked' : 'unchecked')
        if (next) {
          btn.innerHTML = '<svg data-slot="checkbox-indicator" class="size-3.5 text-current" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>'
        } else {
          btn.innerHTML = ''
        }
      })

      // Add label next to checkbox
      const wrapper = document.createElement('div')
      wrapper.className = 'flex items-center space-x-2'
      const label = document.createElement('span')
      label.className = 'text-sm font-medium leading-none'
      label.textContent = 'Accept terms'
      wrapper.appendChild(btn)
      wrapper.appendChild(label)

      container.innerHTML = ''
      container.appendChild(wrapper)
    }

    // Update highlighted code
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) {
      codeEl.innerHTML = highlightCheckboxJsx(dc, d)
    }
  })

  return (
    <PlaygroundLayout
      previewDataAttr="data-checkbox-preview"
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

export { CheckboxPlayground }
