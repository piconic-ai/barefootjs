"use client"
/**
 * Dropdown Menu Props Playground
 *
 * Interactive playground for the DropdownMenu component.
 * Allows tweaking align prop with live preview.
 */

import { createSignal, createMemo, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { hlPlain, hlTag, hlAttr, hlStr } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@ui/components/ui/dropdown-menu'
import { Checkbox } from '@ui/components/ui/checkbox'

function highlightDropdownMenuJsx(align: string): string {
  const alignAttr = align !== 'start'
    ? ` ${hlAttr('align')}${hlPlain('=')}${hlStr(`&quot;${align}&quot;`)}`
    : ''

  const lines = [
    `${hlPlain('&lt;')}${hlTag('DropdownMenu')} ${hlAttr('open')}${hlPlain('={open()} ')}${hlAttr('onOpenChange')}${hlPlain('={setOpen}&gt;')}`,
    `  ${hlPlain('&lt;')}${hlTag('DropdownMenuTrigger')}${hlPlain('&gt;')}`,
    `    ${hlPlain('&lt;')}${hlTag('span')}${hlPlain('&gt;')}Open Menu${hlPlain('&lt;/')}${hlTag('span')}${hlPlain('&gt;')}`,
    `  ${hlPlain('&lt;/')}${hlTag('DropdownMenuTrigger')}${hlPlain('&gt;')}`,
    `  ${hlPlain('&lt;')}${hlTag('DropdownMenuContent')}${alignAttr}${hlPlain('&gt;')}`,
    `    ${hlPlain('&lt;')}${hlTag('DropdownMenuLabel')}${hlPlain('&gt;')}Actions${hlPlain('&lt;/')}${hlTag('DropdownMenuLabel')}${hlPlain('&gt;')}`,
    `    ${hlPlain('&lt;')}${hlTag('DropdownMenuSeparator')} ${hlPlain('/&gt;')}`,
    `    ${hlPlain('&lt;')}${hlTag('DropdownMenuItem')}${hlPlain('&gt;')}Copy${hlPlain('&lt;/')}${hlTag('DropdownMenuItem')}${hlPlain('&gt;')}`,
    `    ${hlPlain('&lt;')}${hlTag('DropdownMenuItem')}${hlPlain('&gt;')}Paste${hlPlain('&lt;/')}${hlTag('DropdownMenuItem')}${hlPlain('&gt;')}`,
    `  ${hlPlain('&lt;/')}${hlTag('DropdownMenuContent')}${hlPlain('&gt;')}`,
    `${hlPlain('&lt;/')}${hlTag('DropdownMenu')}${hlPlain('&gt;')}`,
  ]
  return lines.join('\n')
}

function DropdownMenuPlayground(_props: {}) {
  const [open, setOpen] = createSignal(false)
  const [alignEnd, setAlignEnd] = createSignal(false)

  const align = createMemo(() => alignEnd() ? 'end' : 'start')

  const codeText = createMemo(() => {
    const a = align()
    const alignProp = a !== 'start' ? ` align="${a}"` : ''
    return `<DropdownMenu open={open()} onOpenChange={setOpen}>\n  <DropdownMenuTrigger>\n    <span>Open Menu</span>\n  </DropdownMenuTrigger>\n  <DropdownMenuContent${alignProp}>\n    <DropdownMenuLabel>Actions</DropdownMenuLabel>\n    <DropdownMenuSeparator />\n    <DropdownMenuItem>Copy</DropdownMenuItem>\n    <DropdownMenuItem>Paste</DropdownMenuItem>\n  </DropdownMenuContent>\n</DropdownMenu>`
  })

  // Update highlighted code
  createEffect(() => {
    const a = align()
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) {
      codeEl.innerHTML = highlightDropdownMenuJsx(a)
    }
  })

  // Update align attribute on real content element
  createEffect(() => {
    const a = align()
    const container = document.querySelector('[data-dropdown-menu-preview]') as HTMLElement
    if (!container) return
    const content = container.querySelector('[data-slot="dropdown-menu-content"]') as HTMLElement
    if (content) {
      content.setAttribute('data-align', a)
    }
  })

  return (
    <PlaygroundLayout
      previewDataAttr="data-dropdown-menu-preview"
      previewContent={
        <DropdownMenu open={open()} onOpenChange={setOpen}>
          <DropdownMenuTrigger>
            <span
              className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-accent"
            >
              Open Menu
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align={align()}>
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <span>Copy</span>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <span>Paste</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      }
      controls={<>
        <PlaygroundControl label="align=&quot;end&quot;">
          <Checkbox
            defaultChecked={false}
            onCheckedChange={(v: boolean) => setAlignEnd(v)}
          />
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={codeText()} />}
    />
  )
}

export { DropdownMenuPlayground }
