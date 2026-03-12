"use client"
/**
 * Breadcrumb Props Playground
 *
 * Interactive playground for the Breadcrumb component.
 * Allows tweaking separator style and ellipsis visibility with live preview.
 */

import { createSignal, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { highlightJsxTree, plainJsxTree, type JsxTreeNode } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Checkbox } from '@ui/components/ui/checkbox'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@ui/components/ui/select'
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
} from '@ui/components/ui/breadcrumb'

type SeparatorStyle = 'default' | 'slash'

function BreadcrumbPlayground(_props: {}) {
  const [separator, setSeparator] = createSignal<SeparatorStyle>('default')
  const [showEllipsis, setShowEllipsis] = createSignal(false)

  const separatorNode = (): JsxTreeNode => {
    if (separator() === 'slash') {
      return { tag: 'BreadcrumbSeparator', children: '/' }
    }
    return { tag: 'BreadcrumbSeparator' }
  }

  const tree = (): JsxTreeNode => {
    const items: JsxTreeNode[] = [
      {
        tag: 'BreadcrumbItem',
        children: [{ tag: 'BreadcrumbLink', props: [{ name: 'href', value: '#', defaultValue: '' }], children: 'Home' }],
      },
      separatorNode(),
    ]

    if (showEllipsis()) {
      items.push({ tag: 'BreadcrumbItem', children: [{ tag: 'BreadcrumbEllipsis' }] })
      items.push(separatorNode())
    }

    items.push({
      tag: 'BreadcrumbItem',
      children: [{ tag: 'BreadcrumbLink', props: [{ name: 'href', value: '#', defaultValue: '' }], children: 'Components' }],
    })
    items.push(separatorNode())
    items.push({
      tag: 'BreadcrumbItem',
      children: [{ tag: 'BreadcrumbPage', children: 'Breadcrumb' }],
    })

    return {
      tag: 'Breadcrumb',
      children: [{ tag: 'BreadcrumbList', children: items }],
    }
  }

  createEffect(() => {
    const t = tree()
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) codeEl.innerHTML = highlightJsxTree(t)
  })

  const separatorContent = () => separator() === 'slash' ? '/' : undefined

  return (
    <PlaygroundLayout
      previewDataAttr="data-breadcrumb-preview"
      previewContent={
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="#">Home</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>{separatorContent()}</BreadcrumbSeparator>
            {showEllipsis() && <>
              <BreadcrumbItem>
                <BreadcrumbEllipsis />
              </BreadcrumbItem>
              <BreadcrumbSeparator>{separatorContent()}</BreadcrumbSeparator>
            </>}
            <BreadcrumbItem>
              <BreadcrumbLink href="#">Components</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>{separatorContent()}</BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbPage>Breadcrumb</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      }
      controls={<>
        <PlaygroundControl label="separator">
          <Select value={separator()} onValueChange={(v: string) => setSeparator(v as SeparatorStyle)}>
            <SelectTrigger>
              <SelectValue placeholder="Select separator..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">default (chevron)</SelectItem>
              <SelectItem value="slash">slash (/)</SelectItem>
            </SelectContent>
          </Select>
        </PlaygroundControl>
        <PlaygroundControl label="ellipsis">
          <Checkbox
            checked={showEllipsis()}
            onCheckedChange={setShowEllipsis}
          />
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={plainJsxTree(tree())} />}
    />
  )
}

export { BreadcrumbPlayground }
