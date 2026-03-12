"use client"
/**
 * Collapsible Props Playground
 *
 * Interactive playground for the Collapsible component.
 * Allows tweaking open state and disabled props with live preview.
 */

import { createSignal, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { highlightJsxTree, plainJsxTree, type HighlightProp, type JsxTreeNode } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Checkbox } from '@ui/components/ui/checkbox'
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@ui/components/ui/collapsible'
import { Button } from '@ui/components/ui/button'
import { ChevronDownIcon } from '@ui/components/ui/icon'

function CollapsiblePlayground(_props: {}) {
  const [open, setOpen] = createSignal(true)
  const [disabled, setDisabled] = createSignal(false)

  const collapsibleProps = (): HighlightProp[] => [
    { name: 'open', value: String(open()), defaultValue: 'false', kind: 'expression' },
    { name: 'disabled', value: String(disabled()), defaultValue: 'false', kind: 'boolean' },
  ]

  const tree = (): JsxTreeNode => ({
    tag: 'Collapsible',
    props: collapsibleProps(),
    children: [
      { tag: 'CollapsibleTrigger', children: 'Toggle' },
      { tag: 'CollapsibleContent', children: 'Hidden content here' },
    ],
  })

  createEffect(() => {
    const t = tree()
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) codeEl.innerHTML = highlightJsxTree(t)
  })

  return (
    <PlaygroundLayout
      previewDataAttr="data-collapsible-preview"
      previewContent={
        <div className="w-full max-w-sm">
          <Collapsible open={open()} onOpenChange={setOpen} disabled={disabled()} className="space-y-2">
            <div className="flex items-center justify-between space-x-4">
              <h4 className="text-sm font-semibold">
                @barefootjs/dom has 3 repositories
              </h4>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-9 p-0">
                  <ChevronDownIcon size="sm" className="transition-transform duration-normal" />
                  <span className="sr-only">Toggle</span>
                </Button>
              </CollapsibleTrigger>
            </div>
            <div className="rounded-md border border-border px-4 py-2 font-mono text-sm shadow-xs">
              @barefootjs/dom
            </div>
            <CollapsibleContent className="space-y-2">
              <div className="rounded-md border border-border px-4 py-2 font-mono text-sm shadow-xs">
                @barefootjs/jsx
              </div>
              <div className="rounded-md border border-border px-4 py-2 font-mono text-sm shadow-xs">
                @barefootjs/hono
              </div>
            </CollapsibleContent>
          </Collapsible>
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

export { CollapsiblePlayground }
