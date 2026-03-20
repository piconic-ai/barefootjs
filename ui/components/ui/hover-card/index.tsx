"use client"

/**
 * HoverCard Components
 *
 * A floating card that appears on hover to show rich content.
 * Combines Popover's context/portal/positioning with Tooltip's hover/timer pattern.
 *
 * State management uses createContext/useContext for parent-child communication.
 * Timer IDs are stored on DOM elements (dataset) to ensure they are shared
 * across event handler closures after hydration.
 *
 * Features:
 * - Hover to open with configurable delay (700ms default)
 * - Close delay (300ms default) allows moving to content
 * - ESC key to close
 * - Portal to body for overflow clipping escape
 * - Accessibility (aria-expanded, data-state)
 *
 * @example Basic hover card
 * ```tsx
 * const [open, setOpen] = createSignal(false)
 *
 * <HoverCard open={open()} onOpenChange={setOpen}>
 *   <HoverCardTrigger>
 *     <a href="#">@username</a>
 *   </HoverCardTrigger>
 *   <HoverCardContent>
 *     <p>User profile information</p>
 *   </HoverCardContent>
 * </HoverCard>
 * ```
 */

import { createContext, useContext, createEffect, createPortal, isSSRPortal, findSiblingSlot } from '@barefootjs/dom'
import type { HTMLBaseAttributes } from '@barefootjs/jsx'
import type { Child } from '../../../types'

// Context for parent-child state sharing
interface HoverCardContextValue {
  open: () => boolean
  onOpenChange: (open: boolean) => void
  openDelay: number
  closeDelay: number
}

const HoverCardContext = createContext<HoverCardContextValue>()

// Store Content -> Trigger element mapping for positioning after portal
const contentTriggerMap = new WeakMap<HTMLElement, HTMLElement>()

// Store Content -> Root element mapping for timer access after portal
const contentRootMap = new WeakMap<HTMLElement, HTMLElement>()

// HoverCard container classes
const hoverCardClasses = 'relative inline-block'

// HoverCardContent base classes (from shadcn/ui)
const hoverCardContentBaseClasses = 'fixed z-50 w-64 rounded-md border border-border bg-popover p-4 text-popover-foreground shadow-md outline-hidden transform-gpu origin-top transition-[opacity,transform] duration-normal ease-out'

// HoverCardContent open/closed classes
const hoverCardContentOpenClasses = 'opacity-100 scale-100'
const hoverCardContentClosedClasses = 'opacity-0 scale-95 pointer-events-none'

/**
 * Props for HoverCard component.
 */
interface HoverCardProps extends HTMLBaseAttributes {
  /** Whether the hover card is open */
  open?: boolean
  /** Callback when open state should change */
  onOpenChange?: (open: boolean) => void
  /** HoverCardTrigger and HoverCardContent */
  children?: Child
  /**
   * Delay in ms before opening on hover.
   * @default 700
   */
  openDelay?: number
  /**
   * Delay in ms before closing after mouse leave.
   * @default 300
   */
  closeDelay?: number
}

/**
 * HoverCard root component.
 * Provides open state and timer config to children via context.
 *
 * @param props.open - Whether the hover card is open
 * @param props.onOpenChange - Callback when open state should change
 * @param props.openDelay - Delay before opening (default 700ms)
 * @param props.closeDelay - Delay before closing (default 300ms)
 */
function HoverCard(props: HoverCardProps) {
  return (
    <HoverCardContext.Provider value={{
      open: () => props.open ?? false,
      onOpenChange: props.onOpenChange ?? (() => {}),
      openDelay: props.openDelay ?? 700,
      closeDelay: props.closeDelay ?? 300,
    }}>
      <div
        data-slot="hover-card"
        id={props.id}
        className={`${hoverCardClasses} ${props.className ?? ''}`}
      >
        {props.children}
      </div>
    </HoverCardContext.Provider>
  )
}

/**
 * Props for HoverCardTrigger component.
 */
interface HoverCardTriggerProps extends HTMLBaseAttributes {
  /** Whether to render child element as trigger */
  asChild?: boolean
  /** Trigger content */
  children?: Child
}

/**
 * Element that triggers the hover card on mouse enter.
 * Reads context for open state and timer configuration.
 * Finds root element via DOM traversal for timer storage.
 *
 * @param props.asChild - Render child as trigger
 */
function HoverCardTrigger(props: HoverCardTriggerProps) {
  const handleMount = (el: HTMLElement) => {
    const ctx = useContext(HoverCardContext)
    const root = el.closest('[data-slot="hover-card"]') as HTMLElement

    // Resolve through display:contents — mouse events don't fire reliably
    // on display:contents elements, so attach to the first child instead
    const eventTarget = getComputedStyle(el).display === 'contents'
      ? (el.firstElementChild as HTMLElement | null) ?? el
      : el

    createEffect(() => {
      el.setAttribute('aria-expanded', String(ctx.open()))
    })

    eventTarget.addEventListener('mouseenter', () => {
      if (!root) return

      // Cancel any pending close timer
      const ct = root.dataset.hcCloseTimer
      if (ct) {
        clearTimeout(Number(ct))
        root.dataset.hcCloseTimer = ''
      }

      if (ctx.openDelay > 0) {
        const timerId = setTimeout(() => {
          ctx.onOpenChange(true)
          root.dataset.hcOpenTimer = ''
        }, ctx.openDelay) as unknown as number
        root.dataset.hcOpenTimer = String(timerId)
      } else {
        ctx.onOpenChange(true)
      }
    })

    eventTarget.addEventListener('mouseleave', () => {
      if (!root) return

      // Cancel any pending open timer
      const ot = root.dataset.hcOpenTimer
      if (ot) {
        clearTimeout(Number(ot))
        root.dataset.hcOpenTimer = ''
      }

      if (ctx.closeDelay > 0) {
        const timerId = setTimeout(() => {
          ctx.onOpenChange(false)
          root.dataset.hcCloseTimer = ''
        }, ctx.closeDelay) as unknown as number
        root.dataset.hcCloseTimer = String(timerId)
      } else {
        ctx.onOpenChange(false)
      }
    })
  }

  if (props.asChild) {
    return (
      <span
        data-slot="hover-card-trigger"
        id={props.id}
        aria-expanded="false"
        style="display:contents"
        ref={handleMount}
      >
        {props.children}
      </span>
    )
  }

  return (
    <span
      data-slot="hover-card-trigger"
      id={props.id}
      aria-expanded="false"
      className={`inline-flex items-center ${props.className ?? ''}`}
      ref={handleMount}
    >
      {props.children}
    </span>
  )
}

/**
 * Props for HoverCardContent component.
 */
interface HoverCardContentProps extends HTMLBaseAttributes {
  /** Hover card content */
  children?: Child
  /** Alignment relative to trigger */
  align?: 'start' | 'center' | 'end'
  /** Side relative to trigger */
  side?: 'top' | 'bottom'
}

/**
 * Content container for the hover card.
 * Portaled to body. Handles mouse enter/leave to keep card open while hovering content.
 * Captures root and trigger references before portal via WeakMap.
 *
 * @param props.align - Alignment ('start', 'center', or 'end')
 * @param props.side - Side ('top' or 'bottom')
 */
function HoverCardContent(props: HoverCardContentProps) {
  const handleMount = (el: HTMLElement) => {
    // Capture references before portal (while still inside HoverCard container)
    const triggerEl = findSiblingSlot(el, '[data-slot="hover-card-trigger"]')
    const rootEl = el.closest('[data-slot="hover-card"]') as HTMLElement
    if (triggerEl) contentTriggerMap.set(el, triggerEl)
    if (rootEl) contentRootMap.set(el, rootEl)

    // Portal to body to escape overflow clipping
    if (el && el.parentNode !== document.body && !isSSRPortal(el)) {
      const ownerScope = el.closest('[bf-s]') ?? undefined
      createPortal(el, document.body, { ownerScope })
    }

    const ctx = useContext(HoverCardContext)

    // Mouse enter on content: cancel close timer
    el.addEventListener('mouseenter', () => {
      const root = contentRootMap.get(el)
      if (!root) return

      const ct = root.dataset.hcCloseTimer
      if (ct) {
        clearTimeout(Number(ct))
        root.dataset.hcCloseTimer = ''
      }
    })

    // Mouse leave on content: start close timer
    el.addEventListener('mouseleave', () => {
      const root = contentRootMap.get(el)
      if (!root) return

      // Cancel any pending open timer
      const ot = root.dataset.hcOpenTimer
      if (ot) {
        clearTimeout(Number(ot))
        root.dataset.hcOpenTimer = ''
      }

      if (ctx.closeDelay > 0) {
        const timerId = setTimeout(() => {
          ctx.onOpenChange(false)
          root.dataset.hcCloseTimer = ''
        }, ctx.closeDelay) as unknown as number
        root.dataset.hcCloseTimer = String(timerId)
      } else {
        ctx.onOpenChange(false)
      }
    })

    // Position content relative to trigger
    // Resolve through display:contents (asChild wraps in a span with display:contents
    // which returns a zero rect from getBoundingClientRect)
    const positionTarget = triggerEl && getComputedStyle(triggerEl).display === 'contents'
      ? (triggerEl.firstElementChild as HTMLElement | null) ?? triggerEl
      : triggerEl
    const updatePosition = () => {
      if (!positionTarget) return
      const rect = positionTarget.getBoundingClientRect()
      const align = props.align ?? 'center'
      const side = props.side ?? 'bottom'

      if (side === 'bottom') {
        el.style.top = `${rect.bottom + 4}px`
      } else {
        el.style.top = `${rect.top - el.offsetHeight - 4}px`
      }

      if (align === 'start') {
        el.style.left = `${rect.left}px`
      } else if (align === 'end') {
        el.style.left = `${rect.right - el.offsetWidth}px`
      } else {
        // center
        el.style.left = `${rect.left + rect.width / 2 - el.offsetWidth / 2}px`
      }
    }

    // Track cleanup functions for global listeners
    let cleanupFns: Function[] = []

    // Reactive show/hide + positioning + global listeners
    createEffect(() => {
      // Clean up previous listeners
      for (const fn of cleanupFns) fn()
      cleanupFns = []

      const isOpen = ctx.open()
      el.dataset.state = isOpen ? 'open' : 'closed'
      el.className = `${hoverCardContentBaseClasses} ${isOpen ? hoverCardContentOpenClasses : hoverCardContentClosedClasses} ${props.className ?? ''}`

      if (isOpen) {
        updatePosition()

        // Close on ESC
        const handleKeyDown = (e: KeyboardEvent) => {
          if (e.key === 'Escape') {
            ctx.onOpenChange(false)
          }
        }

        // Reposition on scroll and resize
        const handleScroll = () => updatePosition()

        document.addEventListener('keydown', handleKeyDown)
        window.addEventListener('scroll', handleScroll, true)
        window.addEventListener('resize', handleScroll)

        cleanupFns.push(
          () => document.removeEventListener('keydown', handleKeyDown),
          () => window.removeEventListener('scroll', handleScroll, true),
          () => window.removeEventListener('resize', handleScroll),
        )
      }
    })
  }

  return (
    <div
      data-slot="hover-card-content"
      id={props.id}
      data-state="closed"
      className={`${hoverCardContentBaseClasses} ${hoverCardContentClosedClasses} ${props.className ?? ''}`}
      ref={handleMount}
    >
      {props.children}
    </div>
  )
}

export {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
}

export type {
  HoverCardProps,
  HoverCardTriggerProps,
  HoverCardContentProps,
}
