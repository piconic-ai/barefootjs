"use client"

import type { HTMLBaseAttributes } from '@barefootjs/jsx'
import { createSignal, onCleanup } from '@barefootjs/dom'

/**
 * ScrollArea Component
 *
 * Augments native scroll with custom, cross-browser styled scrollbars.
 * Hides native scrollbars and renders overlay thumb indicators.
 *
 * @example
 * ```tsx
 * <ScrollArea className="h-72 w-48 rounded-md border">
 *   <div className="p-4">{content}</div>
 * </ScrollArea>
 * ```
 */

// CSS classes matching shadcn/ui
const rootClasses = 'relative overflow-hidden'
const viewportClasses = 'h-full w-full rounded-[inherit]'

const scrollbarOrientationClasses = {
  vertical: 'flex w-2.5 border-l border-l-transparent p-px touch-none select-none transition-opacity',
  horizontal: 'flex h-2.5 flex-col border-t border-t-transparent p-px touch-none select-none transition-opacity',
} as const

const thumbClasses = 'bg-border relative rounded-full flex-1'

type ScrollAreaType = 'hover' | 'scroll' | 'auto' | 'always'

interface ScrollAreaProps extends HTMLBaseAttributes {
  /** Content to display inside the scrollable area. */
  children?: any
  /** When to show scrollbars. @default 'hover' */
  type?: ScrollAreaType
}

interface ScrollBarProps extends HTMLBaseAttributes {
  /** Scroll direction. @default 'vertical' */
  orientation?: 'vertical' | 'horizontal'
}

/**
 * ScrollArea renders a scrollable viewport with custom overlay scrollbars.
 */
function ScrollArea(props: ScrollAreaProps) {
  const [hovered, setHovered] = createSignal(false)
  const [scrolling, setScrolling] = createSignal(false)
  const [thumbVSize, setThumbVSize] = createSignal(0)
  const [thumbVPos, setThumbVPos] = createSignal(0)
  const [thumbHSize, setThumbHSize] = createSignal(0)
  const [thumbHPos, setThumbHPos] = createSignal(0)
  const [canScrollV, setCanScrollV] = createSignal(false)
  const [canScrollH, setCanScrollH] = createSignal(false)

  let scrollTimeout: ReturnType<typeof setTimeout> | undefined

  const updateScrollMetrics = (viewport: HTMLElement) => {
    const { scrollTop, scrollLeft, scrollHeight, scrollWidth, clientHeight, clientWidth } = viewport

    // Vertical
    const vRatio = clientHeight / scrollHeight
    setCanScrollV(vRatio < 1)
    const vSize = Math.max(vRatio * 100, 10)
    setThumbVSize(vSize)
    setThumbVPos(scrollHeight > clientHeight ? (scrollTop / (scrollHeight - clientHeight)) * (100 - vSize) : 0)

    // Horizontal
    const hRatio = clientWidth / scrollWidth
    setCanScrollH(hRatio < 1)
    const hSize = Math.max(hRatio * 100, 10)
    setThumbHSize(hSize)
    setThumbHPos(scrollWidth > clientWidth ? (scrollLeft / (scrollWidth - clientWidth)) * (100 - hSize) : 0)
  }

  const handleScroll = (e: Event) => {
    const viewport = e.currentTarget as HTMLElement
    updateScrollMetrics(viewport)

    setScrolling(true)
    if (scrollTimeout) clearTimeout(scrollTimeout)
    scrollTimeout = setTimeout(() => setScrolling(false), 1000)
  }

  const handleMouseEnter = () => setHovered(true)
  const handleMouseLeave = () => setHovered(false)

  const handleMount = (root: HTMLElement) => {
    const viewport = root.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement
    if (viewport) {
      updateScrollMetrics(viewport)

      // Observe content size changes
      const observer = new ResizeObserver(() => updateScrollMetrics(viewport))
      observer.observe(viewport)
      if (viewport.firstElementChild) {
        observer.observe(viewport.firstElementChild)
      }
      onCleanup(() => observer.disconnect())
    }
  }

  const isVisible = () => {
    const t = props.type ?? 'hover'
    if (t === 'always') return true
    if (t === 'hover') return hovered()
    if (t === 'scroll') return scrolling()
    // auto: show on hover or scroll
    return hovered() || scrolling()
  }

  // Thumb drag for vertical scrollbar
  const handleThumbPointerDownV = (e: PointerEvent) => {
    e.preventDefault()
    const thumb = e.currentTarget as HTMLElement
    const scrollbar = thumb.parentElement as HTMLElement
    const root = scrollbar.closest('[data-slot="scroll-area"]') as HTMLElement
    const viewport = root.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement
    if (!viewport) return

    thumb.setPointerCapture(e.pointerId)
    const startY = e.clientY
    const startScrollTop = viewport.scrollTop

    const onMove = (me: PointerEvent) => {
      const scrollbarRect = scrollbar.getBoundingClientRect()
      const delta = me.clientY - startY
      const scrollableHeight = viewport.scrollHeight - viewport.clientHeight
      const ratio = delta / (scrollbarRect.height * (1 - thumbVSize() / 100))
      viewport.scrollTop = startScrollTop + ratio * scrollableHeight
    }

    const onUp = () => {
      thumb.removeEventListener('pointermove', onMove)
      thumb.removeEventListener('pointerup', onUp)
    }

    thumb.addEventListener('pointermove', onMove)
    thumb.addEventListener('pointerup', onUp)
  }

  // Thumb drag for horizontal scrollbar
  const handleThumbPointerDownH = (e: PointerEvent) => {
    e.preventDefault()
    const thumb = e.currentTarget as HTMLElement
    const scrollbar = thumb.parentElement as HTMLElement
    const root = scrollbar.closest('[data-slot="scroll-area"]') as HTMLElement
    const viewport = root.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement
    if (!viewport) return

    thumb.setPointerCapture(e.pointerId)
    const startX = e.clientX
    const startScrollLeft = viewport.scrollLeft

    const onMove = (me: PointerEvent) => {
      const scrollbarRect = scrollbar.getBoundingClientRect()
      const delta = me.clientX - startX
      const scrollableWidth = viewport.scrollWidth - viewport.clientWidth
      const ratio = delta / (scrollbarRect.width * (1 - thumbHSize() / 100))
      viewport.scrollLeft = startScrollLeft + ratio * scrollableWidth
    }

    const onUp = () => {
      thumb.removeEventListener('pointermove', onMove)
      thumb.removeEventListener('pointerup', onUp)
    }

    thumb.addEventListener('pointermove', onMove)
    thumb.addEventListener('pointerup', onUp)
  }

  onCleanup(() => {
    if (scrollTimeout) clearTimeout(scrollTimeout)
  })

  const vBarVisible = () => canScrollV() && isVisible()
  const hBarVisible = () => canScrollH() && isVisible()

  return (
    <div
      data-slot="scroll-area"
      id={props.id}
      className={`${rootClasses} ${props.className ?? ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      ref={handleMount}
    >
      <div
        data-slot="scroll-area-viewport"
        className={viewportClasses}
        style="overflow: scroll; scrollbar-width: none; -ms-overflow-style: none;"
        onScroll={handleScroll}
      >
        {props.children}
      </div>

      {/* Vertical scrollbar */}
      <div
        data-slot="scroll-area-scrollbar"
        data-orientation="vertical"
        data-state={vBarVisible() ? 'visible' : 'hidden'}
        className={`absolute right-0 top-0 bottom-0 ${scrollbarOrientationClasses.vertical}`}
        style={`opacity: ${vBarVisible() ? 1 : 0}; ${canScrollV() ? '' : 'display: none;'}`}
      >
        <div
          data-slot="scroll-area-thumb"
          className={thumbClasses}
          style={`height: ${thumbVSize()}%; top: ${thumbVPos()}%; position: absolute; width: 100%;`}
          onPointerDown={handleThumbPointerDownV}
        />
      </div>

      {/* Horizontal scrollbar */}
      <div
        data-slot="scroll-area-scrollbar"
        data-orientation="horizontal"
        data-state={hBarVisible() ? 'visible' : 'hidden'}
        className={`absolute bottom-0 left-0 right-0 ${scrollbarOrientationClasses.horizontal}`}
        style={`opacity: ${hBarVisible() ? 1 : 0}; ${canScrollH() ? '' : 'display: none;'}`}
      >
        <div
          data-slot="scroll-area-thumb"
          className={thumbClasses}
          style={`width: ${thumbHSize()}%; left: ${thumbHPos()}%; position: absolute; height: 100%;`}
          onPointerDown={handleThumbPointerDownH}
        />
      </div>
    </div>
  )
}

/**
 * ScrollBar — standalone scrollbar component for custom configurations.
 * Not typically used directly; ScrollArea includes both scrollbars.
 */
function ScrollBar({ orientation = 'vertical', className = '', ...props }: ScrollBarProps) {
  const posClasses = orientation === 'vertical'
    ? 'absolute right-0 top-0 bottom-0'
    : 'absolute bottom-0 left-0 right-0'

  return (
    <div
      data-slot="scroll-area-scrollbar"
      data-orientation={orientation}
      className={`${posClasses} ${scrollbarOrientationClasses[orientation]} ${className}`}
      {...props}
    >
      <div data-slot="scroll-area-thumb" className={thumbClasses} />
    </div>
  )
}

export { ScrollArea, ScrollBar }
export type { ScrollAreaProps, ScrollBarProps, ScrollAreaType }
