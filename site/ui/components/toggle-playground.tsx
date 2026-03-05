"use client"
/**
 * Toggle Props Playground
 *
 * Interactive playground for the Toggle component.
 * Allows tweaking variant, size, and pressed state with live preview.
 */

import { createSignal, createMemo, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { highlightJsx } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@ui/components/ui/select'

type ToggleVariant = 'default' | 'outline'
type ToggleSize = 'default' | 'sm' | 'lg'

// Mirror of Toggle component class definitions (ui/components/ui/toggle/index.tsx)
const toggleBaseClasses = 'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4 [&_svg]:shrink-0 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive whitespace-nowrap data-[state=on]:bg-accent data-[state=on]:text-accent-foreground hover:bg-muted hover:text-muted-foreground'

const toggleVariantClasses: Record<ToggleVariant, string> = {
  default: 'bg-transparent',
  outline: 'border border-input bg-transparent shadow-xs hover:bg-accent hover:text-accent-foreground',
}

const toggleSizeClasses: Record<ToggleSize, string> = {
  default: 'h-9 px-2 min-w-9',
  sm: 'h-8 px-1.5 min-w-8',
  lg: 'h-10 px-2.5 min-w-10',
}

function TogglePlayground(_props: {}) {
  const [variant, setVariant] = createSignal<ToggleVariant>('default')
  const [size, setSize] = createSignal<ToggleSize>('default')
  const [pressed, setPressed] = createSignal('false')

  const codeText = createMemo(() => {
    const v = variant()
    const s = size()
    const p = pressed()
    const parts: string[] = []
    if (v !== 'default') parts.push(`variant="${v}"`)
    if (s !== 'default') parts.push(`size="${s}"`)
    if (p === 'true') parts.push('defaultPressed')
    const propsStr = parts.length > 0 ? ` ${parts.join(' ')}` : ''
    return `<Toggle${propsStr}>Toggle</Toggle>`
  })

  createEffect(() => {
    const v = variant()
    const s = size()
    const p = pressed()
    const isOn = p === 'true'

    // Update toggle preview
    const container = document.querySelector('[data-toggle-preview]') as HTMLElement
    if (container) {
      const btn = document.createElement('button')
      btn.setAttribute('data-slot', 'toggle')
      btn.setAttribute('data-state', isOn ? 'on' : 'off')
      btn.setAttribute('aria-pressed', String(isOn))
      btn.className = `${toggleBaseClasses} ${toggleVariantClasses[v]} ${toggleSizeClasses[s]}`
      btn.textContent = 'Toggle'
      btn.addEventListener('click', () => {
        setPressed(pressed() === 'true' ? 'false' : 'true')
      })
      container.innerHTML = ''
      container.appendChild(btn)
    }

    // Update highlighted code
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) {
      codeEl.innerHTML = highlightJsx(
        'Toggle',
        [
          { name: 'variant', value: v, defaultValue: 'default' },
          { name: 'size', value: s, defaultValue: 'default' },
        ],
        'Toggle',
      )
    }
  })

  return (
    <PlaygroundLayout
      previewDataAttr="data-toggle-preview"
      controls={<>
        <PlaygroundControl label="variant">
          <Select value={variant()} onValueChange={(v: string) => setVariant(v as ToggleVariant)}>
            <SelectTrigger>
              <SelectValue placeholder="Select variant..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">default</SelectItem>
              <SelectItem value="outline">outline</SelectItem>
            </SelectContent>
          </Select>
        </PlaygroundControl>
        <PlaygroundControl label="size">
          <Select value={size()} onValueChange={(v: string) => setSize(v as ToggleSize)}>
            <SelectTrigger>
              <SelectValue placeholder="Select size..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">default</SelectItem>
              <SelectItem value="sm">sm</SelectItem>
              <SelectItem value="lg">lg</SelectItem>
            </SelectContent>
          </Select>
        </PlaygroundControl>
        <PlaygroundControl label="pressed">
          <Select value={pressed()} onValueChange={(v: string) => setPressed(v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select state..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="false">off</SelectItem>
              <SelectItem value="true">on</SelectItem>
            </SelectContent>
          </Select>
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={codeText()} />}
    />
  )
}

export { TogglePlayground }
