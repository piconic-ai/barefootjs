"use client"
/**
 * Portal Props Playground
 *
 * Interactive playground for the createPortal utility.
 * Allows toggling portal visibility and switching between default and custom container.
 */

import { createSignal, createEffect, createPortal, type Portal } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { highlightJsxTree, plainJsxTree, type JsxTreeNode } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Checkbox } from '@ui/components/ui/checkbox'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@ui/components/ui/select'

type ContainerTarget = 'body' | 'custom'

function PortalPlayground(_props: {}) {
  const [visible, setVisible] = createSignal(false)
  const [target, setTarget] = createSignal<ContainerTarget>('body')
  const state: { portal: Portal | null; container: HTMLElement | null } = { portal: null, container: null }

  const setContainerRef = (el: HTMLElement) => {
    state.container = el
  }

  const mountPortal = () => {
    if (state.portal) {
      state.portal.unmount()
      state.portal = null
    }

    const container = target() === 'custom' ? state.container ?? undefined : undefined
    state.portal = createPortal(
      '<div data-portal-content class="bg-accent text-accent-foreground p-3 rounded-md text-sm">Portal content</div>',
      container
    )
  }

  const unmountPortal = () => {
    if (state.portal) {
      state.portal.unmount()
      state.portal = null
    }
  }

  createEffect(() => {
    if (visible()) {
      mountPortal()
    } else {
      unmountPortal()
    }
  })

  // Re-mount when target changes while visible
  createEffect(() => {
    void target()
    if (visible()) {
      mountPortal()
    }
  })

  const tree = (): JsxTreeNode => ({
    tag: 'createPortal',
    props: [
      { name: 'children', value: "'<div>Portal content</div>'", defaultValue: '', kind: 'expression' as const },
      ...(target() === 'custom'
        ? [{ name: 'container', value: 'containerRef', defaultValue: 'document.body', kind: 'expression' as const }]
        : []),
    ],
    children: undefined,
  })

  createEffect(() => {
    const t = tree()
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) codeEl.innerHTML = highlightJsxTree(t)
  })

  return (
    <PlaygroundLayout
      previewDataAttr="data-portal-preview"
      previewContent={
        <div className="space-y-4">
          <div className="flex gap-2 items-center">
            <span className="text-sm text-muted-foreground">
              {visible() ? 'Portal is mounted' : 'Portal is unmounted'}
              {visible() && target() === 'custom' ? ' (custom container)' : ''}
              {visible() && target() === 'body' ? ' (document.body)' : ''}
            </span>
          </div>
          {target() === 'custom' && (
            <div
              ref={setContainerRef}
              data-portal-container
              className="min-h-16 border border-dashed border-border rounded-lg p-4 flex items-center justify-center"
            >
              {!visible() && <span className="text-muted-foreground text-sm">Custom container</span>}
            </div>
          )}
        </div>
      }
      controls={<>
        <PlaygroundControl label="visible">
          <Checkbox
            checked={visible()}
            onCheckedChange={setVisible}
          />
        </PlaygroundControl>
        <PlaygroundControl label="container">
          <Select value={target()} onValueChange={(v: string) => setTarget(v as ContainerTarget)}>
            <SelectTrigger>
              <SelectValue placeholder="Select target..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="body">document.body</SelectItem>
              <SelectItem value="custom">custom element</SelectItem>
            </SelectContent>
          </Select>
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={plainJsxTree(tree())} />}
    />
  )
}

export { PortalPlayground }
