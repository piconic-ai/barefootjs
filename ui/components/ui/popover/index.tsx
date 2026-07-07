"use client"

/**
 * Popover Components
 *
 * A floating panel that appears relative to a trigger element.
 * Inspired by shadcn/ui Popover with CSS variable theming support.
 *
 * State management uses createContext/useContext for parent-child communication.
 * Root Popover manages open state, children consume via context.
 *
 * Features:
 * - ESC key to close
 * - Click outside to close
 * - Non-modal (no scroll lock, no focus trap)
 * - Accessibility (aria-expanded, data-state)
 *
 * @example Basic popover
 * ```tsx
 * const [open, setOpen] = createSignal(false)
 *
 * <Popover open={open()} onOpenChange={setOpen}>
 *   <PopoverTrigger>Open</PopoverTrigger>
 *   <PopoverContent>
 *     <p>Popover content here.</p>
 *   </PopoverContent>
 * </Popover>
 * ```
 *
 * @example Styled trigger (asChild)
 * ```tsx
 * // Wrapping a <Button> inside PopoverTrigger requires asChild. Without it,
 * // PopoverTrigger renders its OWN <button>, the HTML parser auto-closes the
 * // nested <button>, and the popover silently never opens.
 * <PopoverTrigger asChild>
 *   <Button variant="outline">Open</Button>
 * </PopoverTrigger>
 * ```
 */

import { createContext, useContext, createEffect, createPortal, isSSRPortal, findSiblingSlot } from '@barefootjs/client'
import type { ButtonHTMLAttributes, HTMLBaseAttributes } from '@barefootjs/jsx'
import type { Child } from '../../../types'

// Context for parent-child state sharing
interface PopoverContextValue {
  open: () => boolean
  onOpenChange: (open: boolean) => void
}

const PopoverContext = createContext<PopoverContextValue>()

// Store Content -> Trigger element mapping for positioning after portal
const contentTriggerMap = new WeakMap<HTMLElement, HTMLElement>()

// Popover container classes
const popoverClasses = 'relative inline-block'

// PopoverTrigger classes
const popoverTriggerClasses = 'inline-flex items-center disabled:pointer-events-none disabled:opacity-50'

// PopoverContent base classes (from shadcn/ui)
const popoverContentBaseClasses = 'fixed z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-hidden transform-gpu origin-top transition-[opacity,transform] duration-normal ease-out'

// PopoverContent open/closed classes
const popoverContentOpenClasses = 'opacity-100 scale-100'
const popoverContentClosedClasses = 'opacity-0 scale-95 pointer-events-none'

/**
 * Props for Popover component.
 */
interface PopoverProps extends HTMLBaseAttributes {
  /** Whether the popover is open */
  open?: boolean
  /** Callback when open state should change */
  onOpenChange?: (open: boolean) => void
  /** PopoverTrigger and PopoverContent */
  children?: Child
}

/**
 * Popover root component.
 * Provides open state to children via context.
 *
 * @param props.open - Whether the popover is open
 * @param props.onOpenChange - Callback when open state should change
 */
function Popover(props: PopoverProps) {
  return (
    <PopoverContext.Provider value={{
      open: () => props.open ?? false,
      onOpenChange: props.onOpenChange ?? (() => {}),
    }}>
      <div data-slot="popover" id={props.id} className={`${popoverClasses} ${props.className ?? ''}`}>
        {props.children}
      </div>
    </PopoverContext.Provider>
  )
}

/**
 * Detects the classic shadcn/ui migration mistake: wrapping an interactive
 * element (e.g. `<Button>`) inside a non-asChild *Trigger. The Trigger renders
 * its own `<button>` around it, so the HTML parser auto-closes the nested
 * `<button>` while parsing — the outer trigger ends up EMPTY with the inner
 * element as its next sibling instead of its child. Click wiring lands on the
 * empty outer button, so the visible inner element does nothing.
 * For DOM trees built without going through the HTML parser (e.g. programmatic
 * DOM construction), the nested element can instead survive as an actual
 * descendant, so both shapes are checked.
 * See https://github.com/piconic-ai/barefootjs/issues/2127.
 */
function warnIfMisusedTrigger(el: HTMLElement, componentName: string): void {
  const interactiveSelector = 'button, [role="button"], a[href]'
  const hasNestedInteractive = el.querySelector(interactiveSelector) != null
  const isEmpty = Array.from(el.childNodes).every(
    (node) => node.nodeType === Node.TEXT_NODE && !node.textContent?.trim()
  )
  const siblingIsInteractive = isEmpty && (el.nextElementSibling?.matches(interactiveSelector) ?? false)

  if (hasNestedInteractive) {
    console.warn(
      `[barefootjs] ${componentName} contains a nested interactive element (<button>, <a href>, or [role="button"]) inside the trigger's own <button> — nested interactive elements don't work reliably. Use <${componentName} asChild> to adopt your element instead.`
    )
  } else if (siblingIsInteractive) {
    console.warn(
      `[barefootjs] ${componentName} rendered an empty trigger followed by an interactive element — this is what the HTML parser produces from a <button>/<Button> nested inside the trigger. Use <${componentName} asChild> to adopt your element instead.`
    )
  }
}

/**
 * Props for PopoverTrigger component.
 */
interface PopoverTriggerProps extends ButtonHTMLAttributes {
  /** Whether disabled */
  disabled?: boolean
  /**
   * Render the child element as the trigger instead of PopoverTrigger's own
   * `<button>`. Required whenever `children` is itself an interactive element
   * (e.g. `<Button>`) — without it, the nested `<button>` gets auto-closed by the
   * HTML parser and the popover silently never opens.
   */
  asChild?: boolean
  /** Trigger content */
  children?: Child
}

/**
 * Button that toggles the popover.
 * Reads open state from context and toggles via onOpenChange.
 *
 * @param props.disabled - Whether disabled
 * @param props.asChild - Render child as trigger. Required when `children` is an
 *   interactive element like `<Button>` — see PopoverTriggerProps.asChild for why.
 */
function PopoverTrigger(props: PopoverTriggerProps) {
  const handleMount = (el: HTMLElement) => {
    const ctx = useContext(PopoverContext)

    createEffect(() => {
      el.setAttribute('aria-expanded', String(ctx.open()))
    })

    el.addEventListener('click', () => {
      ctx.onOpenChange(!ctx.open())
    })

    if (!props.asChild) warnIfMisusedTrigger(el, 'PopoverTrigger')
  }

  if (props.asChild) {
    return (
      <span
        data-slot="popover-trigger"
        aria-expanded="false"
        style="display:contents"
        ref={handleMount}
      >
        {props.children}
      </span>
    )
  }

  return (
    <button
      data-slot="popover-trigger"
      type="button"
      aria-expanded="false"
      id={props.id}
      disabled={props.disabled ?? false}
      className={`${popoverTriggerClasses} ${props.className ?? ''}`}
      ref={handleMount}
    >
      {props.children}
    </button>
  )
}

/**
 * Props for PopoverContent component.
 */
interface PopoverContentProps extends HTMLBaseAttributes {
  /** Popover content */
  children?: Child
  /** Alignment relative to trigger */
  align?: 'start' | 'center' | 'end'
  /** Side relative to trigger */
  side?: 'top' | 'bottom'
}

/**
 * Content container for the popover.
 * Portaled to body. Reads open state from context.
 *
 * @param props.align - Alignment ('start', 'center', or 'end')
 * @param props.side - Side ('top' or 'bottom')
 */
function PopoverContent(props: PopoverContentProps) {
  const handleMount = (el: HTMLElement) => {
    // Get trigger ref before portal (while still inside Popover container)
    const triggerEl = findSiblingSlot(el, '[data-slot="popover-trigger"]')
    if (triggerEl) contentTriggerMap.set(el, triggerEl)

    // Portal to body to escape overflow clipping
    if (el && el.parentNode !== document.body && !isSSRPortal(el)) {
      const ownerScope = el.closest('[bf-s]') ?? undefined
      createPortal(el, document.body, { ownerScope })
    }

    const ctx = useContext(PopoverContext)

    // Position content relative to trigger
    const updatePosition = () => {
      if (!triggerEl) return
      // display:contents elements have no box model; use first element child for positioning
      const positionEl = (triggerEl.style.display === 'contents' && triggerEl.firstElementChild
        ? triggerEl.firstElementChild
        : triggerEl) as HTMLElement
      const rect = positionEl.getBoundingClientRect()
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
      el.className = `${popoverContentBaseClasses} ${isOpen ? popoverContentOpenClasses : popoverContentClosedClasses} ${props.className ?? ''}`

      if (isOpen) {
        updatePosition()

        // Close on click outside (content or trigger)
        const handleClickOutside = (e: MouseEvent) => {
          if (!el.contains(e.target as Node) && !triggerEl?.contains(e.target as Node)) {
            ctx.onOpenChange(false)
          }
        }

        // Close on ESC
        const handleKeyDown = (e: KeyboardEvent) => {
          if (e.key === 'Escape') {
            ctx.onOpenChange(false)
            triggerEl?.focus()
          }
        }

        // Reposition on scroll and resize
        const handleScroll = () => updatePosition()

        document.addEventListener('mousedown', handleClickOutside)
        document.addEventListener('keydown', handleKeyDown)
        window.addEventListener('scroll', handleScroll, true)
        window.addEventListener('resize', handleScroll)

        cleanupFns.push(
          () => document.removeEventListener('mousedown', handleClickOutside),
          () => document.removeEventListener('keydown', handleKeyDown),
          () => window.removeEventListener('scroll', handleScroll, true),
          () => window.removeEventListener('resize', handleScroll),
        )
      }
    })
  }

  return (
    <div
      data-slot="popover-content"
      data-state="closed"
      tabindex={-1}
      id={props.id}
      className={`${popoverContentBaseClasses} ${popoverContentClosedClasses} ${props.className ?? ''}`}
      ref={handleMount}
    >
      {props.children}
    </div>
  )
}

/**
 * Props for PopoverClose component.
 */
interface PopoverCloseProps extends ButtonHTMLAttributes {
  /** Button content */
  children?: Child
}

/**
 * Close button for the popover.
 * Reads context and calls onOpenChange(false) on click.
 */
function PopoverClose(props: PopoverCloseProps) {
  const handleMount = (el: HTMLElement) => {
    const ctx = useContext(PopoverContext)

    el.addEventListener('click', () => {
      ctx.onOpenChange(false)
    })
  }

  return (
    <button
      data-slot="popover-close"
      type="button"
      id={props.id}
      className={props.className ?? ''}
      ref={handleMount}
    >
      {props.children}
    </button>
  )
}

export {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverClose,
}

export type {
  PopoverProps,
  PopoverTriggerProps,
  PopoverContentProps,
  PopoverCloseProps,
}
