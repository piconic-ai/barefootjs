/**
 * Table of Contents Component
 *
 * Displays a sticky sidebar navigation for documentation pages.
 * Shows section links for easy navigation within the page.
 * Highlights the section the reader is at, derived from the scroll position.
 */

'use client'

import { createSignal, createEffect } from '@barefootjs/client'

export interface TocItem {
  id: string
  title: string
  // Tree branch type for CSS styling (indented child items)
  branch?: 'start' | 'child' | 'end'
}

export interface TableOfContentsProps {
  items: TocItem[]
}

export function TableOfContents(props: TableOfContentsProps) {
  if (props.items.length === 0) return null

  // Item height in pixels (py-1 = 8px padding + ~20px line-height)
  const ITEM_HEIGHT = 28

  // Use separate variable to avoid operator precedence issues in compiled output
  const initialActiveId = props.items[0]?.id ?? ''
  const [activeId, setActiveId] = createSignal<string>(initialActiveId)

  // Update indicator position when activeId changes
  // Moves both vertically (Y) and horizontally (X) for indented items
  createEffect(() => {
    const indicator = document.querySelector('[data-toc-indicator]') as HTMLElement
    if (indicator) {
      const idx = props.items.findIndex(item => item.id === activeId())
      const activeIdx = idx >= 0 ? idx : 0
      const activeItem = props.items[activeIdx]
      const xOffset = activeItem?.branch ? 8 : 0
      indicator.style.transform = `translate(${xOffset}px, ${activeIdx * ITEM_HEIGHT}px)`
    }
  })

  // Follow the scroll position: the active item is the last one whose target
  // has scrolled up to where following its link places it (the target's
  // scroll-margin-top). This is derived from the current position on every
  // scroll, so it holds inside a long section with no heading in view, after
  // a jump, and on the way back up from the bottom. Targets that are
  // containers (site/ui's <section>s) and targets nested in them (<h3>s) are
  // both handled, because only each target's top edge matters. A layout
  // change that moves the targets without a scroll (content expanding above
  // the reader, a window resize) recomputes too.
  createEffect(() => {
    const targets = props.items
      .map(item => document.getElementById(item.id))
      .filter((el): el is HTMLElement => el !== null)

    if (targets.length === 0) return

    const firstItemId = props.items[0]?.id ?? ''
    const lastItemId = props.items[props.items.length - 1]?.id ?? ''
    // Sub-pixel rounding of a smooth scroll can stop just short of the margin
    const REACHED_TOLERANCE = 8
    // A clicked item stays active until the scroll it started has settled:
    // the smooth scroll passes other sections on the way, and a target near
    // the end of the page can never reach the top.
    const SETTLE_MS = 150
    // Input by which the reader scrolls the page themselves
    const USER_SCROLL_EVENTS = ['wheel', 'touchstart', 'keydown'] as const
    const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '])

    // Style reads stay off the per-frame path; re-read on a layout change
    const readMargins = () => targets.map(target => parseFloat(getComputedStyle(target).scrollMarginTop) || 0)
    let margins = readMargins()

    const activeFromScroll = () => {
      const scrolledToBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2
      if (scrolledToBottom) return lastItemId
      let reached = firstItemId
      targets.forEach((target, i) => {
        if (target.getBoundingClientRect().top <= margins[i] + REACHED_TOLERANCE) reached = target.id
      })
      return reached
    }

    let pinned = false
    let settleTimer: ReturnType<typeof setTimeout> | undefined
    let frame = 0

    const unpinWhenSettled = () => {
      clearTimeout(settleTimer)
      settleTimer = setTimeout(() => { pinned = false }, SETTLE_MS)
    }

    const handleScroll = () => {
      if (pinned) {
        unpinWhenSettled()
        return
      }
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        if (!pinned) setActiveId(activeFromScroll())
      })
    }

    // The reader scrolling by themselves takes over from a clicked item: its
    // smooth scroll is cancelled, so the marker follows their position again.
    const handleUserScrollInput = (event: Event) => {
      if (!pinned) return
      if (event instanceof KeyboardEvent && !SCROLL_KEYS.has(event.key)) return
      pinned = false
      clearTimeout(settleTimer)
      handleScroll()
    }

    const handleLayoutChange = () => {
      margins = readMargins()
      handleScroll()
    }

    const handleClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.('a[href^="#"]')
      const id = link?.getAttribute('href')?.slice(1)
      if (!id || !props.items.some(item => item.id === id)) return
      pinned = true
      setActiveId(id)
      unpinWhenSettled()
    }

    const nav = document.querySelector('nav[aria-label="Table of contents"]')
    // Observing <body> catches both a resize reflowing the page and content
    // growing or shrinking inside it; its first callback is harmless.
    const layoutObserver = new ResizeObserver(handleLayoutChange)
    setActiveId(activeFromScroll())
    layoutObserver.observe(document.body)
    window.addEventListener('scroll', handleScroll, { passive: true })
    nav?.addEventListener('click', handleClick as EventListener)
    for (const type of USER_SCROLL_EVENTS) {
      window.addEventListener(type, handleUserScrollInput, { passive: true })
    }

    return () => {
      window.removeEventListener('scroll', handleScroll)
      nav?.removeEventListener('click', handleClick as EventListener)
      for (const type of USER_SCROLL_EVENTS) {
        window.removeEventListener(type, handleUserScrollInput)
      }
      layoutObserver.disconnect()
      clearTimeout(settleTimer)
      cancelAnimationFrame(frame)
    }
  })

  // Show on lg screens (1024px+) - sticky positioning within flex layout
  return (
    <nav className="hidden lg:block sticky top-[94px] w-56 h-fit max-h-[calc(100vh-6rem)] overflow-y-auto shrink-0" aria-label="Table of contents">
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">On This Page</p>
        <div className="relative">
          {/* Animated active indicator - slides along the left border line */}
          <div
            data-toc-indicator
            className="absolute w-0.5 transition-transform duration-100 ease-out z-10"
            style={`background-color: var(--gradient-start); height: ${ITEM_HEIGHT}px; left: 0;`}
          />
          <ul className="list-none m-0 p-0 text-sm">
            {props.items.map(item => (
              <li key={item.id} className="list-none m-0 p-0">
                <a
                  href={`#${item.id}`}
                  className={`block py-1 pl-3 border-0 border-l border-solid transition-colors no-underline ${
                    item.branch ? 'ml-2' : ''
                  } ${
                    activeId() === item.id
                      ? 'text-foreground font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {item.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </nav>
  )
}
