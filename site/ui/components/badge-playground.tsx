"use client"
/**
 * Badge Props Playground
 *
 * Interactive playground for the Badge component.
 * Allows tweaking variant and children props with live preview.
 *
 * Pure CSR approach: constructs Badge DOM directly using the same
 * class strings as the Badge source component. Code display uses
 * lightweight client-side JSX highlighting matching shiki's dual-theme
 * CSS variable pattern for light/dark mode support.
 */

import { createSignal, createMemo, createEffect } from '@barefootjs/dom'
import { CheckIcon, CopyIcon } from '@ui/components/ui/icon'

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline'

// Mirror of Badge component class definitions (ui/components/ui/badge/index.tsx)
const badgeBaseClasses = 'inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden'

const badgeVariantClasses: Record<string, string> = {
  default: 'border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90',
  secondary: 'border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90',
  destructive: 'border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60',
  outline: 'text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
}

// Lightweight JSX syntax highlighter using shiki's dual-theme CSS variable pattern.
// Only handles the Badge JSX pattern — not a general-purpose highlighter.
function highlightBadgeJsx(v: string, text: string): string {
  const p = (s: string) => `<span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">${s}</span>`
  const tag = (s: string) => `<span style="--shiki-light:#22863A;--shiki-dark:#85E89D">${s}</span>`
  const attr = (s: string) => `<span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0">${s}</span>`
  const str = (s: string) => `<span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">${s}</span>`

  const t = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  if (v === 'default') {
    return `${p('&lt;')}${tag('Badge')}${p('&gt;')}${t}${p('&lt;/')}${tag('Badge')}${p('&gt;')}`
  }
  return `${p('&lt;')}${tag('Badge')} ${attr('variant')}${p('=')}${str(`&quot;${v}&quot;`)}${p('&gt;')}${t}${p('&lt;/')}${tag('Badge')}${p('&gt;')}`
}

function BadgePlayground(props: {}) {
  const [variant, setVariant] = createSignal<BadgeVariant>('default')
  const [text, setText] = createSignal('Badge')
  const [copied, setCopied] = createSignal(false)

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
      codeEl.innerHTML = highlightBadgeJsx(v, t)
    }
  })

  const handleCopy = () => {
    navigator.clipboard.writeText(codeText()).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div id="playground" className="border border-border rounded-lg overflow-hidden scroll-mt-16">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px]">
        {/* Preview */}
        <div className="flex items-center justify-center min-h-[140px] p-8 bg-card relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle,hsl(var(--muted)/0.5)_1px,transparent_1px)] bg-[length:16px_16px] pointer-events-none" />
          <div className="relative z-10" data-badge-preview />
        </div>

        {/* Controls */}
        <div className="border-t lg:border-t-0 lg:border-l border-border p-6 space-y-4 bg-background">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground block">variant</label>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              onChange={(e: Event) => setVariant((e.target as HTMLSelectElement).value as BadgeVariant)}
            >
              <option value="default">default</option>
              <option value="secondary">secondary</option>
              <option value="destructive">destructive</option>
              <option value="outline">outline</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground block">children</label>
            <input
              type="text"
              value="Badge"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              onInput={(e: Event) => setText((e.target as HTMLInputElement).value)}
            />
          </div>
        </div>
      </div>

      {/* Generated code */}
      <div className="border-t border-border relative group">
        <pre className="m-0 p-4 pr-12 bg-muted overflow-x-auto text-sm font-mono">
          <code data-playground-code />
        </pre>
        <button
          type="button"
          className="absolute top-2 right-2 p-2 rounded-md bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label="Copy code"
          onClick={handleCopy}
        >
          {copied() ? <CheckIcon size="sm" /> : <CopyIcon size="sm" />}
        </button>
      </div>
    </div>
  )
}

export { BadgePlayground }
