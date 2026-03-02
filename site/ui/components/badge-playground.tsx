"use client"
/**
 * Badge Props Playground
 *
 * Interactive playground for the Badge component.
 * Allows tweaking variant and children props with live preview.
 *
 * Strategy: SSR renders hidden Badge elements for each variant as templates.
 * The createEffect clones the matching template and updates its text content,
 * avoiding the need for client-side template registration (which render() requires
 * but the compiler doesn't provide for SSR-compiled components).
 */

import { createSignal, createMemo, createEffect } from '@barefootjs/dom'
import { Badge } from '@ui/components/ui/badge'
import { CheckIcon, CopyIcon } from '@ui/components/ui/icon'

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline'

function BadgePlayground(props: {}) {
  const [variant, setVariant] = createSignal<BadgeVariant>('default')
  const [text, setText] = createSignal('Badge')
  const [copied, setCopied] = createSignal(false)

  const generatedCode = createMemo(() => {
    const v = variant()
    const t = text()
    const variantProp = v === 'default' ? '' : ` variant="${v}"`
    return `import { Badge } from "@/components/ui/badge"\n\n<Badge${variantProp}>${t}</Badge>`
  })

  createEffect(() => {
    const v = variant()
    const t = text()
    const container = document.querySelector('[data-badge-preview]') as HTMLElement
    const templates = document.querySelector('[data-badge-templates]') as HTMLElement
    if (!container || !templates) return

    const template = templates.querySelector(`[data-variant="${v}"]`) as HTMLElement
    if (!template) return

    const clone = template.cloneNode(true) as HTMLElement
    clone.textContent = t
    clone.removeAttribute('data-variant')

    container.innerHTML = ''
    container.appendChild(clone)
  })

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedCode()).then(() => {
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
          <code>{generatedCode()}</code>
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

      {/* Hidden templates: SSR renders real Badge elements for each variant.
          The createEffect clones the matching one into the preview area. */}
      <div className="hidden" data-badge-templates>
        <Badge variant="default" data-variant="default">Badge</Badge>
        <Badge variant="secondary" data-variant="secondary">Badge</Badge>
        <Badge variant="destructive" data-variant="destructive">Badge</Badge>
        <Badge variant="outline" data-variant="outline">Badge</Badge>
      </div>
    </div>
  )
}

export { BadgePlayground }
