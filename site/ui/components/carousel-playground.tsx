"use client"
/**
 * Carousel Props Playground
 *
 * Interactive playground for the Carousel component.
 * Allows toggling between horizontal and vertical orientation.
 *
 * Note: Uses style-based visibility to show/hide orientation variants
 * because Embla Carousel cannot dynamically change orientation after init.
 */

import { createSignal, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { hlPlain, hlTag, hlAttr, hlStr } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Checkbox } from '@ui/components/ui/checkbox'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from '@ui/components/ui/carousel'

function CarouselPlayground(_props: {}) {
  const [vertical, setVertical] = createSignal(false)

  createEffect(() => {
    const v = vertical()
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (!codeEl) return

    const orientProp = v ? ` ${hlAttr('orientation')}${hlPlain('=')}${hlStr('&quot;vertical&quot;')}` : ''
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
    const orientProp = vertical() ? ` orientation="vertical"` : ''
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

  const items = [1, 2, 3, 4, 5]

  return (
    <PlaygroundLayout
      previewDataAttr="data-carousel-preview"
      previewContent={
        <div className="w-full max-w-xs">
          <div style={vertical() ? 'display:none' : undefined}>
            <Carousel orientation="horizontal">
              <CarouselContent>
                {items.map((n) => (
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
          <div className="h-[200px]" style={vertical() ? undefined : 'display:none'}>
            <Carousel orientation="vertical">
              <CarouselContent>
                {items.map((n) => (
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
        </div>
      }
      controls={<>
        <PlaygroundControl label="vertical">
          <Checkbox
            checked={vertical()}
            onCheckedChange={setVertical}
          />
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={plainCode()} />}
    />
  )
}

export { CarouselPlayground }
