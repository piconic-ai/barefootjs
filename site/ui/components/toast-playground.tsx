"use client"
/**
 * Toast Props Playground
 *
 * Interactive playground for the Toast component.
 * Allows tweaking variant and position props with live preview.
 */

import { createSignal, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { highlightJsx, plainJsx, type HighlightProp } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@ui/components/ui/select'
import { Button } from '@ui/components/ui/button'
import {
  ToastProvider,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
} from '@ui/components/ui/toast'

type ToastVariant = 'default' | 'success' | 'error' | 'warning' | 'info'
type ToastPosition = 'top-right' | 'top-center' | 'top-left' | 'bottom-right' | 'bottom-center' | 'bottom-left'

function ToastPlayground(_props: {}) {
  const [variant, setVariant] = createSignal<ToastVariant>('default')
  const [position, setPosition] = createSignal<ToastPosition>('bottom-right')
  const [open, setOpen] = createSignal(false)

  const props = (): HighlightProp[] => [
    { name: 'variant', value: variant(), defaultValue: 'default' },
  ]

  createEffect(() => {
    const p = props()
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) codeEl.innerHTML = highlightJsx('Toast', p, `
  <div className="flex-1">
    <ToastTitle>Notification</ToastTitle>
    <ToastDescription>This is a toast message.</ToastDescription>
  </div>
  <ToastClose />`)
  })

  return (
    <PlaygroundLayout
      previewDataAttr="data-toast-preview"
      previewContent={
        <div>
          <Button variant="outline" onClick={() => setOpen(true)}>Show Toast</Button>
          <ToastProvider position={position()}>
            <Toast variant={variant()} open={open()} onOpenChange={setOpen}>
              <div className="flex-1">
                <ToastTitle>Notification</ToastTitle>
                <ToastDescription>This is a toast message.</ToastDescription>
              </div>
              <ToastClose />
            </Toast>
          </ToastProvider>
        </div>
      }
      controls={<>
        <PlaygroundControl label="variant">
          <Select value={variant()} onValueChange={(v: string) => setVariant(v as ToastVariant)}>
            <SelectTrigger>
              <SelectValue placeholder="Select variant..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">default</SelectItem>
              <SelectItem value="success">success</SelectItem>
              <SelectItem value="error">error</SelectItem>
              <SelectItem value="warning">warning</SelectItem>
              <SelectItem value="info">info</SelectItem>
            </SelectContent>
          </Select>
        </PlaygroundControl>
        <PlaygroundControl label="position">
          <Select value={position()} onValueChange={(v: string) => setPosition(v as ToastPosition)}>
            <SelectTrigger>
              <SelectValue placeholder="Select position..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bottom-right">bottom-right</SelectItem>
              <SelectItem value="bottom-center">bottom-center</SelectItem>
              <SelectItem value="bottom-left">bottom-left</SelectItem>
              <SelectItem value="top-right">top-right</SelectItem>
              <SelectItem value="top-center">top-center</SelectItem>
              <SelectItem value="top-left">top-left</SelectItem>
            </SelectContent>
          </Select>
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={plainJsx('Toast', props(), `
  <div className="flex-1">
    <ToastTitle>Notification</ToastTitle>
    <ToastDescription>This is a toast message.</ToastDescription>
  </div>
  <ToastClose />`)} />}
    />
  )
}

export { ToastPlayground }
