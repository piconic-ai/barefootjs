"use client"
/**
 * Accordion Props Playground
 *
 * Interactive playground for the Accordion component.
 * Allows tweaking open state and disabled props with live preview.
 */

import { createSignal, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { highlightJsxTree, plainJsxTree, type HighlightProp, type JsxTreeNode } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Checkbox } from '@ui/components/ui/checkbox'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@ui/components/ui/accordion'

function AccordionPlayground(_props: {}) {
  const [open, setOpen] = createSignal(true)
  const [disabled, setDisabled] = createSignal(false)

  const itemProps = (): HighlightProp[] => [
    { name: 'open', value: String(open()), defaultValue: 'false', kind: 'expression' },
    { name: 'disabled', value: String(disabled()), defaultValue: 'false', kind: 'boolean' },
  ]

  const tree = (): JsxTreeNode => ({
    tag: 'Accordion',
    children: [{
      tag: 'AccordionItem',
      props: [
        { name: 'value', value: 'item-1', defaultValue: '' },
        ...itemProps(),
      ],
      children: [
        { tag: 'AccordionTrigger', children: 'Is it accessible?' },
        { tag: 'AccordionContent', children: 'Yes. It adheres to the WAI-ARIA design pattern.' },
      ],
    }],
  })

  createEffect(() => {
    const t = tree()
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) codeEl.innerHTML = highlightJsxTree(t)
  })

  return (
    <PlaygroundLayout
      previewDataAttr="data-accordion-preview"
      previewContent={
        <div className="w-full max-w-sm">
          <Accordion>
            <AccordionItem value="item-1" open={open()} onOpenChange={setOpen} disabled={disabled()}>
              <AccordionTrigger disabled={disabled()}>Is it accessible?</AccordionTrigger>
              <AccordionContent>
                Yes. It adheres to the WAI-ARIA design pattern.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      }
      controls={<>
        <PlaygroundControl label="open">
          <Checkbox
            checked={open()}
            onCheckedChange={setOpen}
          />
        </PlaygroundControl>
        <PlaygroundControl label="disabled">
          <Checkbox
            checked={disabled()}
            onCheckedChange={setDisabled}
          />
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={plainJsxTree(tree())} />}
    />
  )
}

export { AccordionPlayground }
