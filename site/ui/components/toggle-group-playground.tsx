"use client"
/**
 * ToggleGroup Props Playground
 *
 * Interactive playground for the ToggleGroup component.
 * Allows tweaking type, variant, size, and disabled props with live preview.
 */

import { createSignal, createMemo, createEffect } from '@barefootjs/client'
import { CopyButton } from './copy-button'
import { highlightJsxTree, plainJsxTree, type JsxTreeNode } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Checkbox } from '@ui/components/ui/checkbox'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@ui/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@ui/components/ui/toggle-group'

type GroupType = 'single' | 'multiple'
type GroupVariant = 'default' | 'outline'
type GroupSize = 'default' | 'sm' | 'lg'

function ToggleGroupPlayground(_props: {}) {
  const [type, setType] = createSignal<GroupType>('single')
  const [variant, setVariant] = createSignal<GroupVariant>('outline')
  const [size, setSize] = createSignal<GroupSize>('default')
  const [disabled, setDisabled] = createSignal(false)

  const tree = (): JsxTreeNode => ({
    tag: 'ToggleGroup',
    props: [
      { name: 'type', value: type(), defaultValue: '' },
      { name: 'variant', value: variant(), defaultValue: 'default' },
      { name: 'size', value: size(), defaultValue: 'default' },
      { name: 'disabled', value: String(disabled()), defaultValue: 'false', kind: 'boolean' as const },
    ],
    children: [
      { tag: 'ToggleGroupItem', props: [{ name: 'value', value: 'a', defaultValue: '' }], children: 'A' },
      { tag: 'ToggleGroupItem', props: [{ name: 'value', value: 'b', defaultValue: '' }], children: 'B' },
      { tag: 'ToggleGroupItem', props: [{ name: 'value', value: 'c', defaultValue: '' }], children: 'C' },
    ],
  })

  const codeText = createMemo(() => plainJsxTree(tree()))

  createEffect(() => {
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) codeEl.innerHTML = highlightJsxTree(tree())
  })

  return (
    <PlaygroundLayout
      previewDataAttr="data-toggle-group-preview"
      previewContent={
        <ToggleGroup type={type()} variant={variant()} size={size()} disabled={disabled()} defaultValue="a">
          <ToggleGroupItem value="a">A</ToggleGroupItem>
          <ToggleGroupItem value="b">B</ToggleGroupItem>
          <ToggleGroupItem value="c">C</ToggleGroupItem>
        </ToggleGroup>
      }
      controls={<>
        <PlaygroundControl label="type">
          <Select value={type()} onValueChange={(v: string) => setType(v as GroupType)}>
            <SelectTrigger>
              <SelectValue placeholder="Select type..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="single">single</SelectItem>
              <SelectItem value="multiple">multiple</SelectItem>
            </SelectContent>
          </Select>
        </PlaygroundControl>
        <PlaygroundControl label="variant">
          <Select value={variant()} onValueChange={(v: string) => setVariant(v as GroupVariant)}>
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
          <Select value={size()} onValueChange={(v: string) => setSize(v as GroupSize)}>
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

export { ToggleGroupPlayground }
