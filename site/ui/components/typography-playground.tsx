"use client"
/**
 * Typography Props Playground
 *
 * Interactive playground for the Typography components.
 * Uses raw HTML elements with matching classes for client-side reactivity,
 * since Typography components are stateless (no "use client").
 */

import { createSignal, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { highlightJsx, plainJsx, type HighlightProp } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@ui/components/ui/select'
import { Input } from '@ui/components/ui/input'

type TypographyElement = 'H1' | 'H2' | 'H3' | 'H4' | 'P' | 'Blockquote' | 'List' | 'InlineCode' | 'Lead' | 'Large' | 'Small' | 'Muted'

const defaultTexts: Record<TypographyElement, string> = {
  H1: 'The Joke Tax Chronicles',
  H2: 'The People of the Kingdom',
  H3: 'The Joke Tax',
  H4: 'People stopped telling jokes',
  P: 'The king, seeing how the people of his kingdom were suffering, decided to repeal the joke tax.',
  Blockquote: '"After all," he said, "everyone enjoys a good joke."',
  List: 'List item text',
  InlineCode: '@barefootjs/dom',
  Lead: 'A modal dialog that interrupts the user with important content and expects a response.',
  Large: 'Are you absolutely sure?',
  Small: 'Email address',
  Muted: 'Enter your email address.',
}

// Classes matching the Typography component definitions
const elementClasses: Record<TypographyElement, string> = {
  H1: 'scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl',
  H2: 'scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight first:mt-0',
  H3: 'scroll-m-20 text-2xl font-semibold tracking-tight',
  H4: 'scroll-m-20 text-xl font-semibold tracking-tight',
  P: 'leading-7 [&:not(:first-child)]:mt-6',
  Blockquote: 'mt-6 border-l-2 pl-6 italic',
  List: 'my-6 ml-6 list-disc [&>li]:mt-2',
  InlineCode: 'relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold',
  Lead: 'text-xl text-muted-foreground',
  Large: 'text-lg font-semibold',
  Small: 'text-sm font-medium leading-none',
  Muted: 'text-sm text-muted-foreground',
}

function TypographyPlayground(_props: {}) {
  const [element, setElement] = createSignal<TypographyElement>('H1')
  const [text, setText] = createSignal(defaultTexts['H1'])

  const componentName = () => `Typography${element()}`

  const props = (): HighlightProp[] => []

  createEffect(() => {
    const p = props()
    const t = text()
    const name = componentName()
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) codeEl.innerHTML = highlightJsx(name, p, t)
  })

  // Update preview element reactively via DOM manipulation
  createEffect(() => {
    const el = element()
    const t = text()
    const previewEl = document.querySelector('[data-typography-preview]')
    if (!previewEl) return

    const classes = elementClasses[el]
    const tagMap: Record<TypographyElement, string> = {
      H1: 'h1', H2: 'h2', H3: 'h3', H4: 'h4',
      P: 'p', Blockquote: 'blockquote', List: 'ul',
      InlineCode: 'code', Lead: 'p', Large: 'div',
      Small: 'small', Muted: 'p',
    }
    const tag = tagMap[el]

    if (el === 'List') {
      previewEl.innerHTML = `<${tag} class="${classes}"><li>${t}</li><li>Another item</li><li>Third item</li></${tag}>`
    } else {
      previewEl.innerHTML = `<${tag} class="${classes}">${t}</${tag}>`
    }
  })

  const handleElementChange = (v: string) => {
    setElement(v as TypographyElement)
    setText(defaultTexts[v as TypographyElement])
  }

  return (
    <PlaygroundLayout
      previewDataAttr="data-typography-preview"
      previewContent={<h1 className={elementClasses['H1']}>{text()}</h1>}
      controls={<>
        <PlaygroundControl label="element">
          <Select value={element()} onValueChange={handleElementChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select element..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="H1">H1</SelectItem>
              <SelectItem value="H2">H2</SelectItem>
              <SelectItem value="H3">H3</SelectItem>
              <SelectItem value="H4">H4</SelectItem>
              <SelectItem value="P">P</SelectItem>
              <SelectItem value="Blockquote">Blockquote</SelectItem>
              <SelectItem value="List">List</SelectItem>
              <SelectItem value="InlineCode">InlineCode</SelectItem>
              <SelectItem value="Lead">Lead</SelectItem>
              <SelectItem value="Large">Large</SelectItem>
              <SelectItem value="Small">Small</SelectItem>
              <SelectItem value="Muted">Muted</SelectItem>
            </SelectContent>
          </Select>
        </PlaygroundControl>
        <PlaygroundControl label="children">
          <Input
            type="text"
            value={text()}
            onInput={(e: Event) => setText((e.target as HTMLInputElement).value)}
          />
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={plainJsx(componentName(), props(), text())} />}
    />
  )
}

export { TypographyPlayground }
