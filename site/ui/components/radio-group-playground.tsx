"use client"
/**
 * RadioGroup Props Playground
 *
 * Interactive playground for the RadioGroup component.
 * Allows tweaking disabled prop with live preview.
 */

import { createSignal, createMemo, createEffect } from '@barefootjs/client'
import { CopyButton } from './copy-button'
import { highlightJsxTree, plainJsxTree, type JsxTreeNode } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Checkbox } from '@ui/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@ui/components/ui/radio-group'

function RadioGroupPlayground(_props: {}) {
  const [disabled, setDisabled] = createSignal(false)

  const tree = (): JsxTreeNode => ({
    tag: 'RadioGroup',
    props: [
      { name: 'defaultValue', value: 'option-1', defaultValue: '' },
      { name: 'disabled', value: String(disabled()), defaultValue: 'false', kind: 'boolean' as const },
    ],
    children: [
      { tag: 'RadioGroupItem', props: [{ name: 'value', value: 'option-1', defaultValue: '' }] },
      { tag: 'RadioGroupItem', props: [{ name: 'value', value: 'option-2', defaultValue: '' }] },
    ],
  })

  const codeText = createMemo(() => plainJsxTree(tree()))

  createEffect(() => {
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) codeEl.innerHTML = highlightJsxTree(tree())
  })

  return (
    <PlaygroundLayout
      previewDataAttr="data-radio-group-preview"
      previewContent={
        <RadioGroup defaultValue="option-1" disabled={disabled()}>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="option-1" />
            <span className="text-sm font-medium leading-none">Option 1</span>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="option-2" />
            <span className="text-sm font-medium leading-none">Option 2</span>
          </div>
        </RadioGroup>
      }
      controls={<>
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

export { RadioGroupPlayground }
