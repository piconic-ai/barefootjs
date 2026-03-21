"use client"
/**
 * ButtonGroup Props Playground
 *
 * Interactive playground for the ButtonGroup component.
 * Allows tweaking orientation prop with live preview.
 */

import { createSignal, createMemo, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { hlPlain, hlTag, hlAttr, hlStr } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@ui/components/ui/select'
import { Button } from '@ui/components/ui/button'
import { ButtonGroup } from '@ui/components/ui/button-group'

type Orientation = 'horizontal' | 'vertical'

function highlightButtonGroupJsx(orientation: string): string {
  const props: string[] = []
  if (orientation !== 'horizontal') props.push(` ${hlAttr('orientation')}${hlPlain('=')}${hlStr(`&quot;${orientation}&quot;`)}`)

  return [
    `${hlPlain('&lt;')}${hlTag('ButtonGroup')}${props.join('')}${hlPlain('&gt;')}`,
    `  ${hlPlain('&lt;')}${hlTag('Button')} ${hlAttr('variant')}${hlPlain('=')}${hlStr('&quot;outline&quot;')}${hlPlain('&gt;')}First${hlPlain('&lt;/')}${hlTag('Button')}${hlPlain('&gt;')}`,
    `  ${hlPlain('&lt;')}${hlTag('Button')} ${hlAttr('variant')}${hlPlain('=')}${hlStr('&quot;outline&quot;')}${hlPlain('&gt;')}Second${hlPlain('&lt;/')}${hlTag('Button')}${hlPlain('&gt;')}`,
    `  ${hlPlain('&lt;')}${hlTag('Button')} ${hlAttr('variant')}${hlPlain('=')}${hlStr('&quot;outline&quot;')}${hlPlain('&gt;')}Third${hlPlain('&lt;/')}${hlTag('Button')}${hlPlain('&gt;')}`,
    `${hlPlain('&lt;/')}${hlTag('ButtonGroup')}${hlPlain('&gt;')}`,
  ].join('\n')
}

function ButtonGroupPlayground(_props: {}) {
  const [orientation, setOrientation] = createSignal<Orientation>('horizontal')

  const codeText = createMemo(() => {
    const parts: string[] = []
    if (orientation() !== 'horizontal') parts.push(`orientation="${orientation()}"`)
    const propsStr = parts.length > 0 ? ` ${parts.join(' ')}` : ''
    return `<ButtonGroup${propsStr}>\n  <Button variant="outline">First</Button>\n  <Button variant="outline">Second</Button>\n  <Button variant="outline">Third</Button>\n</ButtonGroup>`
  })

  createEffect(() => {
    const o = orientation()
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) {
      codeEl.innerHTML = highlightButtonGroupJsx(o)
    }
  })

  return (
    <PlaygroundLayout
      previewDataAttr="data-button-group-preview"
      previewContent={
        <ButtonGroup orientation={orientation()}>
          <Button variant="outline">First</Button>
          <Button variant="outline">Second</Button>
          <Button variant="outline">Third</Button>
        </ButtonGroup>
      }
      controls={<>
        <PlaygroundControl label="orientation">
          <Select value={orientation()} onValueChange={(v: string) => setOrientation(v as Orientation)}>
            <SelectTrigger>
              <SelectValue placeholder="Select orientation..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="horizontal">horizontal</SelectItem>
              <SelectItem value="vertical">vertical</SelectItem>
            </SelectContent>
          </Select>
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={codeText()} />}
    />
  )
}

export { ButtonGroupPlayground }
