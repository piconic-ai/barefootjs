"use client"
/**
 * Card Props Playground
 *
 * Interactive playground for the Card component.
 * Allows editing title and description text with live preview.
 */

import { createSignal, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { escapeHtml, hlPlain, hlTag } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@ui/components/ui/select'
import { Input } from '@ui/components/ui/input'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@ui/components/ui/card'

type CardLayout = 'basic' | 'with-footer' | 'with-content'

function CardPlayground(_props: {}) {
  const [title, setTitle] = createSignal('Card Title')
  const [description, setDescription] = createSignal('Card description here.')
  const [layout, setLayout] = createSignal<CardLayout>('basic')

  createEffect(() => {
    const t = escapeHtml(title())
    const d = escapeHtml(description())
    const l = layout()
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (!codeEl) return

    let code =
      `${hlPlain('&lt;')}${hlTag('Card')}${hlPlain('&gt;')}\n` +
      `  ${hlPlain('&lt;')}${hlTag('CardHeader')}${hlPlain('&gt;')}\n` +
      `    ${hlPlain('&lt;')}${hlTag('CardTitle')}${hlPlain('&gt;')}${t}${hlPlain('&lt;/')}${hlTag('CardTitle')}${hlPlain('&gt;')}\n` +
      `    ${hlPlain('&lt;')}${hlTag('CardDescription')}${hlPlain('&gt;')}${d}${hlPlain('&lt;/')}${hlTag('CardDescription')}${hlPlain('&gt;')}\n` +
      `  ${hlPlain('&lt;/')}${hlTag('CardHeader')}${hlPlain('&gt;')}\n`

    if (l === 'with-content' || l === 'with-footer') {
      code +=
        `  ${hlPlain('&lt;')}${hlTag('CardContent')}${hlPlain('&gt;')}\n` +
        `    ${hlPlain('&lt;')}${hlTag('p')}${hlPlain('&gt;')}Content goes here.${hlPlain('&lt;/')}${hlTag('p')}${hlPlain('&gt;')}\n` +
        `  ${hlPlain('&lt;/')}${hlTag('CardContent')}${hlPlain('&gt;')}\n`
    }

    if (l === 'with-footer') {
      code +=
        `  ${hlPlain('&lt;')}${hlTag('CardFooter')}${hlPlain('&gt;')}\n` +
        `    ${hlPlain('&lt;')}${hlTag('Button')}${hlPlain('&gt;')}Save${hlPlain('&lt;/')}${hlTag('Button')}${hlPlain('&gt;')}\n` +
        `  ${hlPlain('&lt;/')}${hlTag('CardFooter')}${hlPlain('&gt;')}\n`
    }

    code += `${hlPlain('&lt;/')}${hlTag('Card')}${hlPlain('&gt;')}`
    codeEl.innerHTML = code
  })

  const plainCode = () => {
    const t = title()
    const d = description()
    const l = layout()
    let code =
      `<Card>\n` +
      `  <CardHeader>\n` +
      `    <CardTitle>${t}</CardTitle>\n` +
      `    <CardDescription>${d}</CardDescription>\n` +
      `  </CardHeader>\n`

    if (l === 'with-content' || l === 'with-footer') {
      code +=
        `  <CardContent>\n` +
        `    <p>Content goes here.</p>\n` +
        `  </CardContent>\n`
    }

    if (l === 'with-footer') {
      code +=
        `  <CardFooter>\n` +
        `    <Button>Save</Button>\n` +
        `  </CardFooter>\n`
    }

    code += `</Card>`
    return code
  }

  return (
    <PlaygroundLayout
      previewDataAttr="data-card-preview"
      previewContent={
        <Card className="w-[320px]">
          <CardHeader>
            <CardTitle>{title()}</CardTitle>
            <CardDescription>{description()}</CardDescription>
          </CardHeader>
          {(layout() === 'with-content' || layout() === 'with-footer') && (
            <CardContent>
              <p className="text-sm">Content goes here.</p>
            </CardContent>
          )}
          {layout() === 'with-footer' && (
            <CardFooter>
              <button className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground h-9 px-4 py-2">Save</button>
            </CardFooter>
          )}
        </Card>
      }
      controls={<>
        <PlaygroundControl label="layout">
          <Select value={layout()} onValueChange={(v: string) => setLayout(v as CardLayout)}>
            <SelectTrigger>
              <SelectValue placeholder="Select layout..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="basic">header only</SelectItem>
              <SelectItem value="with-content">with content</SelectItem>
              <SelectItem value="with-footer">with footer</SelectItem>
            </SelectContent>
          </Select>
        </PlaygroundControl>
        <PlaygroundControl label="title">
          <Input
            type="text"
            value={title()}
            onInput={(e: Event) => setTitle((e.target as HTMLInputElement).value)}
          />
        </PlaygroundControl>
        <PlaygroundControl label="description">
          <Input
            type="text"
            value={description()}
            onInput={(e: Event) => setDescription((e.target as HTMLInputElement).value)}
          />
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={plainCode()} />}
    />
  )
}

export { CardPlayground }
