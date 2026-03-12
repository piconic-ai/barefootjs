"use client"
/**
 * Drawer Props Playground
 *
 * Interactive playground for the Drawer component.
 * Allows tweaking direction prop with live preview.
 */

import { createSignal, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { highlightJsxTree, plainJsxTree, type HighlightProp, type JsxTreeNode } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@ui/components/ui/select'
import {
  Drawer,
  DrawerTrigger,
  DrawerOverlay,
  DrawerContent,
  DrawerHandle,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
  DrawerClose,
} from '@ui/components/ui/drawer'

function DrawerPlayground(_props: {}) {
  const [open, setOpen] = createSignal(false)
  const [direction, setDirection] = createSignal<string>('bottom')

  const contentProps = (): HighlightProp[] => [
    { name: 'direction', value: direction(), defaultValue: 'bottom' },
  ]

  const tree = (): JsxTreeNode => ({
    tag: 'Drawer',
    props: [
      { name: 'open', value: '{open()}', defaultValue: '', kind: 'expression' },
      { name: 'onOpenChange', value: '{setOpen}', defaultValue: '', kind: 'expression' },
    ],
    children: [
      { tag: 'DrawerTrigger', children: 'Open Drawer' },
      { tag: 'DrawerOverlay' },
      {
        tag: 'DrawerContent',
        props: contentProps(),
        children: [
          ...(direction() === 'bottom' || direction() === 'top' ? [{ tag: 'DrawerHandle' } as JsxTreeNode] : []),
          {
            tag: 'DrawerHeader',
            children: [
              { tag: 'DrawerTitle', children: 'Drawer Title' },
              { tag: 'DrawerDescription', children: 'Drawer description here.' },
            ],
          },
          {
            tag: 'DrawerFooter',
            children: [
              { tag: 'DrawerClose', children: 'Close' },
            ],
          },
        ],
      },
    ],
  })

  createEffect(() => {
    const t = tree()
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) codeEl.innerHTML = highlightJsxTree(t)
  })

  const showHandle = () => direction() === 'bottom' || direction() === 'top'

  return (
    <PlaygroundLayout
      previewDataAttr="data-drawer-preview"
      previewContent={
        <div>
          <Drawer open={open()} onOpenChange={setOpen}>
            <DrawerTrigger>Open Drawer</DrawerTrigger>
            <DrawerOverlay />
            <DrawerContent
              direction={direction() as 'top' | 'right' | 'bottom' | 'left'}
              ariaLabelledby="playground-drawer-title"
            >
              {showHandle() ? <DrawerHandle /> : null}
              <DrawerHeader>
                <DrawerTitle id="playground-drawer-title">Drawer Title</DrawerTitle>
                <DrawerDescription>Drawer description here.</DrawerDescription>
              </DrawerHeader>
              <DrawerFooter>
                <DrawerClose>Close</DrawerClose>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
        </div>
      }
      controls={<>
        <PlaygroundControl label="direction">
          <Select value={direction()} onValueChange={setDirection}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="top">top</SelectItem>
              <SelectItem value="right">right</SelectItem>
              <SelectItem value="bottom">bottom</SelectItem>
              <SelectItem value="left">left</SelectItem>
            </SelectContent>
          </Select>
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={plainJsxTree(tree())} />}
    />
  )
}

export { DrawerPlayground }
