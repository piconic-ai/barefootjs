"use client"
/**
 * Menubar Props Playground
 *
 * Interactive playground for the Menubar component.
 * Allows tweaking disabled state with live preview.
 */

import { createSignal, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { highlightJsxTree, plainJsxTree, type HighlightProp, type JsxTreeNode } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Checkbox } from '@ui/components/ui/checkbox'
import {
  Menubar,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarShortcut,
} from '@ui/components/ui/menubar'

function MenubarPlayground(_props: {}) {
  const [disabled, setDisabled] = createSignal(false)

  const itemProps = (): HighlightProp[] => [
    { name: 'disabled', value: String(disabled()), defaultValue: 'false', kind: 'boolean' },
  ]

  const tree = (): JsxTreeNode => ({
    tag: 'Menubar',
    children: [{
      tag: 'MenubarMenu',
      props: [
        { name: 'value', value: 'file', defaultValue: '' },
      ],
      children: [
        { tag: 'MenubarTrigger', children: 'File' },
        {
          tag: 'MenubarContent',
          children: [
            {
              tag: 'MenubarItem',
              props: itemProps(),
              children: 'New Tab',
            },
            {
              tag: 'MenubarItem',
              props: itemProps(),
              children: 'New Window',
            },
          ],
        },
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
      previewDataAttr="data-menubar-preview"
      previewContent={
        <Menubar>
          <MenubarMenu value="file">
            <MenubarTrigger>File</MenubarTrigger>
            <MenubarContent>
              <MenubarItem disabled={disabled()}>
                <span>New Tab</span>
                <MenubarShortcut>⌘T</MenubarShortcut>
              </MenubarItem>
              <MenubarItem disabled={disabled()}>
                <span>New Window</span>
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem>
                <span>Print</span>
                <MenubarShortcut>⌘P</MenubarShortcut>
              </MenubarItem>
            </MenubarContent>
          </MenubarMenu>
        </Menubar>
      }
      controls={<>
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

export { MenubarPlayground }
