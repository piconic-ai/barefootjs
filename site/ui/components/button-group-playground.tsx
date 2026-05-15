"use client"
/**
 * ButtonGroup Props Playground
 *
 * Interactive playground for the ButtonGroup component.
 * Allows tweaking orientation prop with live preview.
 */

import { createSignal, createMemo, createEffect } from '@barefootjs/client'
import { CopyButton } from './copy-button'
import { highlightJsxTree, plainJsxTree, type JsxTreeNode } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@ui/components/ui/select'
import { Button } from '@ui/components/ui/button'
import { ButtonGroup } from '@ui/components/ui/button-group'

type Orientation = 'horizontal' | 'vertical'

function ButtonGroupPlayground(_props: {}) {
  const [orientation, setOrientation] = createSignal<Orientation>('horizontal')

  const tree = (): JsxTreeNode => ({
    tag: 'ButtonGroup',
    props: [{ name: 'orientation', value: orientation(), defaultValue: 'horizontal' }],
    children: [
      { tag: 'Button', props: [{ name: 'variant', value: 'outline', defaultValue: '' }], children: 'First' },
      { tag: 'Button', props: [{ name: 'variant', value: 'outline', defaultValue: '' }], children: 'Second' },
      { tag: 'Button', props: [{ name: 'variant', value: 'outline', defaultValue: '' }], children: 'Third' },
    ],
  })

  const codeText = createMemo(() => plainJsxTree(tree()))

  createEffect(() => {
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) codeEl.innerHTML = highlightJsxTree(tree())
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
