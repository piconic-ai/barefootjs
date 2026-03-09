"use client"
/**
 * Carousel Props Playground
 *
 * Interactive playground for the Carousel component.
 * Allows toggling between horizontal and vertical orientation.
 *
 * Both carousels are always rendered and Embla-initialized;
 * toggling switches visibility only.
 * (Embla cannot change orientation after init, so conditional
 * rendering would require re-initialization which the current
 * compiler insert() path does not support.)
 *
 * Layout strategy:
 *  - Horizontal carousel is always in normal flow → sets the wrapper height.
 *  - Vertical carousel is always position:absolute → overlays without
 *    affecting height.  left:0/right:0 inherits the wrapper width so
 *    Embla can measure correctly at init time.
 *  - We toggle visibility + pointer-events; no position changes needed.
 */

import { createSignal, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { highlightJsxTree, plainJsxTree, type JsxTreeNode } from './shared/playground-highlight'
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

  const tree = (): JsxTreeNode => {
    const props = vertical()
      ? [{ name: 'orientation', value: 'vertical', defaultValue: 'horizontal' }]
      : []
    return {
      tag: 'Carousel', props, children: [
        { tag: 'CarouselContent', children: [{ tag: 'CarouselItem', children: '...' }] },
        { tag: 'CarouselPrevious' },
        { tag: 'CarouselNext' },
      ],
    }
  }

  createEffect(() => {
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) codeEl.innerHTML = highlightJsxTree(tree())
  })

  // Toggle visibility of the two pre-rendered carousels.
  // Horizontal is always in-flow; vertical is always position:absolute.
  // We only toggle visibility + pointer-events — no position changes.
  createEffect(() => {
    const v = vertical()
    const horiz = document.querySelector('[data-carousel-horiz]') as HTMLElement
    const vert = document.querySelector('[data-carousel-vert]') as HTMLElement
    if (horiz) {
      horiz.style.visibility = v ? 'hidden' : ''
      horiz.style.pointerEvents = v ? 'none' : ''
    }
    if (vert) {
      vert.style.visibility = v ? '' : 'hidden'
      vert.style.pointerEvents = v ? '' : 'none'
      // When vertical is shown, expand the wrapper so the bottom
      // navigation button (position:-bottom-12) is not clipped by
      // the PlaygroundLayout's overflow-hidden.
      const wrapper = vert.parentElement
      if (wrapper) {
        wrapper.style.minHeight = v ? `${vert.scrollHeight}px` : ''
      }
    }
  })


  const items = [1, 2, 3, 4, 5]

  return (
    <PlaygroundLayout
      previewDataAttr="data-carousel-preview"
      previewContent={
        <div className="w-full max-w-xs px-14 relative">
          {/* Horizontal: in-flow, sets wrapper height */}
          <div data-carousel-horiz>
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
          {/* Vertical: absolute overlay, inherits width via left:0/right:0 */}
          <div data-carousel-vert className="py-14" style="position:absolute;top:0;left:0;right:0;visibility:hidden;pointer-events:none">
            <Carousel orientation="vertical" opts={{ align: 'start' }}>
              <CarouselContent orientation="vertical" className="h-[200px]">
                {items.map((n) => (
                  <CarouselItem orientation="vertical" className="basis-1/2">
                    <div className="p-1">
                      <div className="flex items-center justify-center rounded-lg border bg-card p-4">
                        <span className="text-2xl font-semibold">{n}</span>
                      </div>
                    </div>
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious orientation="vertical" />
              <CarouselNext orientation="vertical" />
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
      copyButton={<CopyButton code={plainJsxTree(tree())} />}
    />
  )
}

export { CarouselPlayground }
