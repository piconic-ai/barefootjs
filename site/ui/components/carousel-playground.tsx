"use client"
/**
 * Carousel Props Playground
 *
 * Interactive playground for the Carousel component.
 * Allows switching orientation.
 */

import { createSignal, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { hlPlain, hlTag, hlAttr, hlStr } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@ui/components/ui/select'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from '@ui/components/ui/carousel'

type Orientation = 'horizontal' | 'vertical'

function CarouselPlayground(_props: {}) {
  const [orientation, setOrientation] = createSignal<Orientation>('horizontal')

  createEffect(() => {
    const o = orientation()
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (!codeEl) return

    const orientProp = o === 'horizontal' ? '' : ` ${hlAttr('orientation')}${hlPlain('=')}${hlStr('&quot;vertical&quot;')}`
    codeEl.innerHTML =
      `${hlPlain('&lt;')}${hlTag('Carousel')}${orientProp}${hlPlain('&gt;')}\n` +
      `  ${hlPlain('&lt;')}${hlTag('CarouselContent')}${hlPlain('&gt;')}\n` +
      `    ${hlPlain('&lt;')}${hlTag('CarouselItem')}${hlPlain('&gt;')}...${hlPlain('&lt;/')}${hlTag('CarouselItem')}${hlPlain('&gt;')}\n` +
      `  ${hlPlain('&lt;/')}${hlTag('CarouselContent')}${hlPlain('&gt;')}\n` +
      `  ${hlPlain('&lt;')}${hlTag('CarouselPrevious')} ${hlPlain('/&gt;')}\n` +
      `  ${hlPlain('&lt;')}${hlTag('CarouselNext')} ${hlPlain('/&gt;')}\n` +
      `${hlPlain('&lt;/')}${hlTag('Carousel')}${hlPlain('&gt;')}`
  })

  const plainCode = () => {
    const o = orientation()
    const orientProp = o === 'horizontal' ? '' : ` orientation="vertical"`
    return (
      `<Carousel${orientProp}>\n` +
      `  <CarouselContent>\n` +
      `    <CarouselItem>...</CarouselItem>\n` +
      `  </CarouselContent>\n` +
      `  <CarouselPrevious />\n` +
      `  <CarouselNext />\n` +
      `</Carousel>`
    )
  }

  return (
    <PlaygroundLayout
      previewDataAttr="data-carousel-preview"
      previewContent={
        <div className={orientation() === 'vertical' ? 'h-[200px]' : 'w-full max-w-xs'}>
          <Carousel orientation={orientation()}>
            <CarouselContent>
              {[1, 2, 3, 4, 5].map((n) => (
                <CarouselItem>
                  <div className="flex aspect-square items-center justify-center rounded-lg border bg-card p-6">
                    <span className="text-3xl font-semibold">{n}</span>
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious />
            <CarouselNext />
          </Carousel>
        </div>
      }
      controls={<>
        <PlaygroundControl label="orientation">
          <Select value={orientation()} onValueChange={(v: string) => setOrientation(v as Orientation)}>
            <SelectTrigger>
              <SelectValue placeholder="Select orientation..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="horizontal">horizontal</SelectItem>
              <SelectItem value="vertical">vertical</SelectItem>
            </SelectContent>
          </Select>
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={plainCode()} />}
    />
  )
}

export { CarouselPlayground }
