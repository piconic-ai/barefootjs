"use client"
/**
 * Pagination Props Playground
 *
 * Interactive playground for the Pagination component.
 * Allows toggling isActive state and ellipsis visibility with live preview.
 */

import { createSignal, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { highlightJsxTree, plainJsxTree, type JsxTreeNode } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@ui/components/ui/select'
import { Checkbox } from '@ui/components/ui/checkbox'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
} from '@ui/components/ui/pagination'

function PaginationPlayground(_props: {}) {
  const [activePage, setActivePage] = createSignal('1')
  const [showEllipsis, setShowEllipsis] = createSignal(true)

  const buildTree = (): JsxTreeNode => {
    const pageItems: JsxTreeNode[] = [
      { tag: 'PaginationItem', children: [{ tag: 'PaginationPrevious', props: [{ name: 'href', value: '#', defaultValue: '' }] }] },
      { tag: 'PaginationItem', children: [{ tag: 'PaginationLink', props: [{ name: 'href', value: '#', defaultValue: '' }, ...(activePage() === '1' ? [{ name: 'isActive', value: 'true', defaultValue: 'false', kind: 'boolean' as const }] : [])], children: '1' }] },
      { tag: 'PaginationItem', children: [{ tag: 'PaginationLink', props: [{ name: 'href', value: '#', defaultValue: '' }, ...(activePage() === '2' ? [{ name: 'isActive', value: 'true', defaultValue: 'false', kind: 'boolean' as const }] : [])], children: '2' }] },
      { tag: 'PaginationItem', children: [{ tag: 'PaginationLink', props: [{ name: 'href', value: '#', defaultValue: '' }, ...(activePage() === '3' ? [{ name: 'isActive', value: 'true', defaultValue: 'false', kind: 'boolean' as const }] : [])], children: '3' }] },
    ]
    if (showEllipsis()) {
      pageItems.push({ tag: 'PaginationItem', children: [{ tag: 'PaginationEllipsis' }] })
    }
    pageItems.push({ tag: 'PaginationItem', children: [{ tag: 'PaginationNext', props: [{ name: 'href', value: '#', defaultValue: '' }] }] })

    return {
      tag: 'Pagination', children: [
        { tag: 'PaginationContent', children: pageItems },
      ]
    }
  }

  createEffect(() => {
    const tree = buildTree()
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) codeEl.innerHTML = highlightJsxTree(tree)
  })

  return (
    <PlaygroundLayout
      previewDataAttr="data-pagination-preview"
      previewContent={
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious href="#" />
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#" isActive={activePage() === '1'}>1</PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#" isActive={activePage() === '2'}>2</PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#" isActive={activePage() === '3'}>3</PaginationLink>
            </PaginationItem>
            {showEllipsis() ? (
              <PaginationItem>
                <PaginationEllipsis />
              </PaginationItem>
            ) : null}
            <PaginationItem>
              <PaginationNext href="#" />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      }
      controls={<>
        <PlaygroundControl label="activePage">
          <Select value={activePage()} onValueChange={(v: string) => setActivePage(v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select page..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1</SelectItem>
              <SelectItem value="2">2</SelectItem>
              <SelectItem value="3">3</SelectItem>
            </SelectContent>
          </Select>
        </PlaygroundControl>
        <PlaygroundControl label="showEllipsis">
          <Checkbox
            checked={showEllipsis()}
            onCheckedChange={setShowEllipsis}
          />
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={plainJsxTree(buildTree())} />}
    />
  )
}

export { PaginationPlayground }
