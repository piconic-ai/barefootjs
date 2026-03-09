"use client"
/**
 * Card Props Playground
 *
 * Interactive playground for the Card component.
 * Allows toggling content and footer sections independently,
 * and editing title and description text with live preview.
 */

import { createSignal, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { highlightJsxTree, plainJsxTree, type JsxTreeNode } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Checkbox } from '@ui/components/ui/checkbox'
import { Input } from '@ui/components/ui/input'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@ui/components/ui/card'

function CardPlayground(_props: {}) {
  const [title, setTitle] = createSignal('Card Title')
  const [description, setDescription] = createSignal('Card description here.')
  const [showContent, setShowContent] = createSignal(false)
  const [showFooter, setShowFooter] = createSignal(false)

  const tree = (): JsxTreeNode => {
    const headerChildren: JsxTreeNode[] = [
      { tag: 'CardTitle', children: title() },
      { tag: 'CardDescription', children: description() },
    ]
    const cardChildren: JsxTreeNode[] = [
      { tag: 'CardHeader', children: headerChildren },
    ]
    if (showContent()) {
      cardChildren.push({ tag: 'CardContent', children: [{ tag: 'p', children: 'Content goes here.' }] })
    }
    if (showFooter()) {
      cardChildren.push({ tag: 'CardFooter', children: [{ tag: 'Button', children: 'Save' }] })
    }
    return { tag: 'Card', children: cardChildren }
  }

  createEffect(() => {
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) codeEl.innerHTML = highlightJsxTree(tree())
  })

  return (
    <PlaygroundLayout
      previewDataAttr="data-card-preview"
      previewContent={
        <Card className="w-[320px]">
          <CardHeader>
            <CardTitle>{title()}</CardTitle>
            <CardDescription>{description()}</CardDescription>
          </CardHeader>
          {showContent() && (
            <CardContent>
              <p className="text-sm">Content goes here.</p>
            </CardContent>
          )}
          {showFooter() && (
            <CardFooter>
              <button className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground h-9 px-4 py-2">Save</button>
            </CardFooter>
          )}
        </Card>
      }
      controls={<>
        <PlaygroundControl label="content">
          <Checkbox
            checked={showContent()}
            onCheckedChange={setShowContent}
          />
        </PlaygroundControl>
        <PlaygroundControl label="footer">
          <Checkbox
            checked={showFooter()}
            onCheckedChange={setShowFooter}
          />
        </PlaygroundControl>
        <PlaygroundControl label="title">
          <Input
            type="text"
            value={title()}
            onInput={(e: Event) => setTitle((e.target as HTMLInputElement).value)}
          />
        </PlaygroundControl>
        <PlaygroundControl label="description">
          <Input
            type="text"
            value={description()}
            onInput={(e: Event) => setDescription((e.target as HTMLInputElement).value)}
          />
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={plainJsxTree(tree())} />}
    />
  )
}

export { CardPlayground }
