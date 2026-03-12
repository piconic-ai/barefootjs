"use client"
/**
 * Navigation Menu Props Playground
 *
 * Interactive playground for the NavigationMenu component.
 * Allows tweaking delayDuration and closeDelay props with live preview.
 */

import { createSignal, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { highlightJsxTree, plainJsxTree, type HighlightProp, type JsxTreeNode } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@ui/components/ui/select'
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuTrigger,
  NavigationMenuContent,
  NavigationMenuLink,
} from '@ui/components/ui/navigation-menu'

const delayOptions = ['0', '100', '200', '400']
const closeDelayOptions = ['0', '150', '300', '600']

function NavigationMenuPlayground(_props: {}) {
  const [delayDuration, setDelayDuration] = createSignal('200')
  const [closeDelay, setCloseDelay] = createSignal('300')

  const menuProps = (): HighlightProp[] => [
    { name: 'delayDuration', value: delayDuration(), defaultValue: '200', kind: 'expression' },
    { name: 'closeDelay', value: closeDelay(), defaultValue: '300', kind: 'expression' },
  ]

  const tree = (): JsxTreeNode => ({
    tag: 'NavigationMenu',
    props: menuProps(),
    children: [{
      tag: 'NavigationMenuList',
      children: [{
        tag: 'NavigationMenuItem',
        props: [{ name: 'value', value: 'getting-started', defaultValue: '' }],
        children: [
          { tag: 'NavigationMenuTrigger', children: 'Getting Started' },
          { tag: 'NavigationMenuContent', children: '...' },
        ],
      }],
    }],
  })

  createEffect(() => {
    const t = tree()
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) codeEl.innerHTML = highlightJsxTree(t)
  })

  return (
    <PlaygroundLayout
      previewDataAttr="data-navigation-menu-preview"
      previewContent={
        <div className="w-full">
          <NavigationMenu delayDuration={Number(delayDuration())} closeDelay={Number(closeDelay())}>
            <NavigationMenuList>
              <NavigationMenuItem value="getting-started">
                <NavigationMenuTrigger>Getting Started</NavigationMenuTrigger>
                <NavigationMenuContent className="w-[400px]">
                  <ul className="grid gap-3 p-4 md:grid-cols-2">
                    <li>
                      <NavigationMenuLink href="/docs">
                        <div className="text-sm font-medium leading-none">Introduction</div>
                        <p className="line-clamp-2 text-sm leading-snug text-muted-foreground mt-1">
                          Learn the basics.
                        </p>
                      </NavigationMenuLink>
                    </li>
                    <li>
                      <NavigationMenuLink href="/docs/installation">
                        <div className="text-sm font-medium leading-none">Installation</div>
                        <p className="line-clamp-2 text-sm leading-snug text-muted-foreground mt-1">
                          How to install and configure.
                        </p>
                      </NavigationMenuLink>
                    </li>
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>
              <NavigationMenuItem value="components">
                <NavigationMenuTrigger>Components</NavigationMenuTrigger>
                <NavigationMenuContent className="w-[400px]">
                  <ul className="grid gap-3 p-4 md:grid-cols-2">
                    <li>
                      <NavigationMenuLink href="/components/button">
                        <div className="text-sm font-medium leading-none">Button</div>
                        <p className="line-clamp-2 text-sm leading-snug text-muted-foreground mt-1">
                          Clickable actions with multiple variants.
                        </p>
                      </NavigationMenuLink>
                    </li>
                    <li>
                      <NavigationMenuLink href="/components/accordion">
                        <div className="text-sm font-medium leading-none">Accordion</div>
                        <p className="line-clamp-2 text-sm leading-snug text-muted-foreground mt-1">
                          Vertically collapsing content sections.
                        </p>
                      </NavigationMenuLink>
                    </li>
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>
        </div>
      }
      controls={<>
        <PlaygroundControl label="delayDuration">
          <Select value={delayDuration()} onValueChange={(v: string) => setDelayDuration(v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select delay..." />
            </SelectTrigger>
            <SelectContent>
              {delayOptions.map(v => <SelectItem value={v}>{v}ms</SelectItem>)}
            </SelectContent>
          </Select>
        </PlaygroundControl>
        <PlaygroundControl label="closeDelay">
          <Select value={closeDelay()} onValueChange={(v: string) => setCloseDelay(v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select close delay..." />
            </SelectTrigger>
            <SelectContent>
              {closeDelayOptions.map(v => <SelectItem value={v}>{v}ms</SelectItem>)}
            </SelectContent>
          </Select>
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={plainJsxTree(tree())} />}
    />
  )
}

export { NavigationMenuPlayground }
