"use client"
/**
 * Alert Props Playground
 *
 * Interactive playground for the Alert component.
 * Allows tweaking variant prop with live preview.
 */

import { createSignal, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { highlightJsxTree, plainJsxTree, type JsxTreeNode, type HighlightProp } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@ui/components/ui/select'
import { Alert, AlertTitle, AlertDescription } from '@ui/components/ui/alert'

type AlertVariant = 'default' | 'destructive'

function AlertPlayground(_props: {}) {
  const [variant, setVariant] = createSignal<AlertVariant>('default')

  const variantProp = (): HighlightProp => ({
    name: 'variant',
    value: variant(),
    defaultValue: 'default',
  })

  const tree = (): JsxTreeNode => ({
    tag: 'Alert',
    props: [variantProp()],
    children: [
      { tag: 'AlertTitle', children: 'Heads up!' },
      { tag: 'AlertDescription', children: 'You can add components to your app using the CLI.' },
    ],
  })

  createEffect(() => {
    const t = tree()
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) codeEl.innerHTML = highlightJsxTree(t)
  })

  return (
    <PlaygroundLayout
      previewDataAttr="data-alert-preview"
      previewContent={
        <div className="w-full max-w-md">
          <Alert variant={variant()}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="size-4">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m4 17 6-6-6-6" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19h8" />
            </svg>
            <AlertTitle>Heads up!</AlertTitle>
            <AlertDescription>
              You can add components to your app using the CLI.
            </AlertDescription>
          </Alert>
        </div>
      }
      controls={<>
        <PlaygroundControl label="variant">
          <Select value={variant()} onValueChange={(v: string) => setVariant(v as AlertVariant)}>
            <SelectTrigger>
              <SelectValue placeholder="Select variant..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">default</SelectItem>
              <SelectItem value="destructive">destructive</SelectItem>
            </SelectContent>
          </Select>
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={plainJsxTree(tree())} />}
    />
  )
}

export { AlertPlayground }
