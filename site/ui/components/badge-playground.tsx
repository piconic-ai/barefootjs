"use client"
/**
 * Badge Props Playground
 *
 * Interactive playground for the Badge component.
 * Allows tweaking variant and children props with live preview.
 */

import { createSignal, createMemo, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { highlightJsx } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@ui/components/ui/select'
import { Input } from '@ui/components/ui/input'

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline'

// Mirror of Badge component class definitions (ui/components/ui/badge/index.tsx)
const badgeBaseClasses = 'inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden'

const badgeVariantClasses: Record<string, string> = {
  default: 'border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90',
  secondary: 'border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90',
  destructive: 'border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60',
  outline: 'text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
}

function BadgePlayground(_props: {}) {
  const [variant, setVariant] = createSignal<BadgeVariant>('default')
  const [text, setText] = createSignal('Badge')

  const codeText = createMemo(() => {
    const v = variant()
    const t = text()
    const variantProp = v === 'default' ? '' : ` variant="${v}"`
    return `<Badge${variantProp}>${t}</Badge>`
  })

  createEffect(() => {
    const v = variant()
    const t = text()

    // Update badge preview
    const container = document.querySelector('[data-badge-preview]') as HTMLElement
    if (container) {
      const span = document.createElement('span')
      span.setAttribute('data-slot', 'badge')
      span.className = `${badgeBaseClasses} ${badgeVariantClasses[v]}`
      span.textContent = t
      container.innerHTML = ''
      container.appendChild(span)
    }

    // Update highlighted code
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) {
      codeEl.innerHTML = highlightJsx(
        'Badge',
        [{ name: 'variant', value: v, defaultValue: 'default' }],
        t,
      )
    }
  })

  return (
    <PlaygroundLayout
      previewDataAttr="data-badge-preview"
      controls={<>
        <PlaygroundControl label="variant">
          <Select value={variant()} onValueChange={(v: string) => setVariant(v as BadgeVariant)}>
            <SelectTrigger>
              <SelectValue placeholder="Select variant..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">default</SelectItem>
              <SelectItem value="secondary">secondary</SelectItem>
              <SelectItem value="destructive">destructive</SelectItem>
              <SelectItem value="outline">outline</SelectItem>
            </SelectContent>
          </Select>
        </PlaygroundControl>
        <PlaygroundControl label="children">
          <Input
            type="text"
            value="Badge"
            onInput={(e: Event) => setText((e.target as HTMLInputElement).value)}
          />
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={codeText()} />}
    />
  )
}

export { BadgePlayground }
