"use client"
/**
 * Button Props Playground
 *
 * Interactive playground for the Button component.
 * Allows tweaking variant, size, and children props with live preview.
 */

import { createSignal, createMemo, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { highlightJsx } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@ui/components/ui/select'
import { Input } from '@ui/components/ui/input'

type ButtonVariant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
type ButtonSize = 'default' | 'sm' | 'lg' | 'icon' | 'icon-sm' | 'icon-lg'

// Mirror of Button component class definitions (ui/components/ui/button/index.tsx)
const buttonBaseClasses = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive touch-action-manipulation'

const buttonVariantClasses: Record<ButtonVariant, string> = {
  default: 'bg-primary text-primary-foreground hover:bg-primary/90',
  destructive: 'bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60',
  outline: 'border bg-background text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  ghost: 'text-foreground hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50',
  link: 'text-foreground underline-offset-4 hover:underline hover:text-primary',
}

const buttonSizeClasses: Record<ButtonSize, string> = {
  default: 'h-9 px-4 py-2 has-[>svg]:px-3',
  sm: 'h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5',
  lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
  icon: 'size-9',
  'icon-sm': 'size-8',
  'icon-lg': 'size-10',
}

function ButtonPlayground(_props: {}) {
  const [variant, setVariant] = createSignal<ButtonVariant>('default')
  const [size, setSize] = createSignal<ButtonSize>('default')
  const [text, setText] = createSignal('Button')

  const codeText = createMemo(() => {
    const v = variant()
    const s = size()
    const t = text()
    const parts: string[] = []
    if (v !== 'default') parts.push(`variant="${v}"`)
    if (s !== 'default') parts.push(`size="${s}"`)
    const propsStr = parts.length > 0 ? ` ${parts.join(' ')}` : ''
    return `<Button${propsStr}>${t}</Button>`
  })

  createEffect(() => {
    const v = variant()
    const s = size()
    const t = text()

    // Update button preview
    const container = document.querySelector('[data-button-preview]') as HTMLElement
    if (container) {
      const btn = document.createElement('button')
      btn.className = `${buttonBaseClasses} ${buttonVariantClasses[v]} ${buttonSizeClasses[s]}`
      btn.textContent = t
      container.innerHTML = ''
      container.appendChild(btn)
    }

    // Update highlighted code
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) {
      codeEl.innerHTML = highlightJsx(
        'Button',
        [
          { name: 'variant', value: v, defaultValue: 'default' },
          { name: 'size', value: s, defaultValue: 'default' },
        ],
        t,
      )
    }
  })

  return (
    <PlaygroundLayout
      previewDataAttr="data-button-preview"
      controls={<>
        <PlaygroundControl label="variant">
          <Select value={variant()} onValueChange={(v: string) => setVariant(v as ButtonVariant)}>
            <SelectTrigger>
              <SelectValue placeholder="Select variant..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">default</SelectItem>
              <SelectItem value="destructive">destructive</SelectItem>
              <SelectItem value="outline">outline</SelectItem>
              <SelectItem value="secondary">secondary</SelectItem>
              <SelectItem value="ghost">ghost</SelectItem>
              <SelectItem value="link">link</SelectItem>
            </SelectContent>
          </Select>
        </PlaygroundControl>
        <PlaygroundControl label="size">
          <Select value={size()} onValueChange={(v: string) => setSize(v as ButtonSize)}>
            <SelectTrigger>
              <SelectValue placeholder="Select size..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">default</SelectItem>
              <SelectItem value="sm">sm</SelectItem>
              <SelectItem value="lg">lg</SelectItem>
              <SelectItem value="icon">icon</SelectItem>
              <SelectItem value="icon-sm">icon-sm</SelectItem>
              <SelectItem value="icon-lg">icon-lg</SelectItem>
            </SelectContent>
          </Select>
        </PlaygroundControl>
        <PlaygroundControl label="children">
          <Input
            type="text"
            value="Button"
            onInput={(e: Event) => setText((e.target as HTMLInputElement).value)}
          />
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={codeText()} />}
    />
  )
}

export { ButtonPlayground }
