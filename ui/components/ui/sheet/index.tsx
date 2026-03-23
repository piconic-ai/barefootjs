"use client"

/**
 * Sheet Components
 *
 * A panel that slides in from the edge of the screen.
 * Extends the Dialog pattern with side-based positioning and slide animations.
 * Inspired by shadcn/ui with CSS variable theming support.
 *
 * State management uses createContext/useContext for parent-child communication.
 * Sheet root manages open state, children consume via context.
 *
 * Features:
 * - ESC key to close
 * - Click outside (overlay) to close
 * - Focus trap (Tab/Shift+Tab cycles within panel)
 * - Accessibility (role="dialog", aria-modal="true")
 * - Slide animation from any edge (top, right, bottom, left)
 * - Built-in close button (configurable via showCloseButton)
 *
 * @example Basic sheet
 * ```tsx
 * const [open, setOpen] = createSignal(false)
 *
 * <Sheet open={open()} onOpenChange={setOpen}>
 *   <SheetTrigger>Open Sheet</SheetTrigger>
 *   <SheetOverlay />
 *   <SheetContent side="right" ariaLabelledby="sheet-title">
 *     <SheetHeader>
 *       <SheetTitle id="sheet-title">Sheet Title</SheetTitle>
 *       <SheetDescription>Sheet description here.</SheetDescription>
 *     </SheetHeader>
 *     <SheetFooter>
 *       <SheetClose>Close</SheetClose>
 *     </SheetFooter>
 *   </SheetContent>
 * </Sheet>
 * ```
 */

import { createContext, useContext, createEffect, createPortal, isSSRPortal } from '@barefootjs/dom'
import type { ButtonHTMLAttributes, HTMLBaseAttributes } from '@barefootjs/jsx'
import type { Child } from '../../../types'
import { XIcon } from '../icon'

// Context for Sheet -> children state sharing
interface SheetContextValue {
  open: () => boolean
  onOpenChange: (open: boolean) => void
}

const SheetContext = createContext<SheetContextValue>()

// Side variants
type SheetSide = 'top' | 'right' | 'bottom' | 'left'

// SheetOverlay base classes
const sheetOverlayBaseClasses = 'fixed inset-0 z-50 bg-black/80 transition-opacity duration-200'

// SheetOverlay open/closed classes
const sheetOverlayOpenClasses = 'opacity-100'
const sheetOverlayClosedClasses = 'opacity-0 pointer-events-none'

// SheetContent base classes
const sheetContentBaseClasses = 'z-50 flex flex-col gap-4 bg-background p-6 shadow-lg transition-transform duration-200'

// Side-specific positioning classes
const sideClasses: Record<SheetSide, string> = {
  top: 'fixed inset-x-0 top-0 w-full border-b border-border',
  right: 'fixed inset-y-0 right-0 h-full w-3/4 border-l border-border sm:max-w-sm',
  bottom: 'fixed inset-x-0 bottom-0 w-full border-t border-border',
  left: 'fixed inset-y-0 left-0 h-full w-3/4 border-r border-border sm:max-w-sm',
}

// Side-specific open state classes (slide to final position)
const sideOpenClasses: Record<SheetSide, string> = {
  top: 'translate-y-0',
  right: 'translate-x-0',
  bottom: 'translate-y-0',
  left: 'translate-x-0',
}

// Side-specific closed state classes (slide off-screen + pointer-events-none to prevent
// closed portaled panels from other demos intercepting clicks)
const sideClosedClasses: Record<SheetSide, string> = {
  top: '-translate-y-full pointer-events-none',
  right: 'translate-x-full pointer-events-none',
  bottom: 'translate-y-full pointer-events-none',
  left: '-translate-x-full pointer-events-none',
}

// SheetHeader classes
const sheetHeaderClasses = 'flex flex-col gap-2 text-center sm:text-left'

// SheetTitle classes
const sheetTitleClasses = 'text-lg leading-none font-semibold'

// SheetDescription classes
const sheetDescriptionClasses = 'text-muted-foreground text-sm'

// SheetFooter classes
const sheetFooterClasses = 'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'

// SheetTrigger classes (synced with button.tsx default variant)
const sheetTriggerClasses = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40 aria-[invalid]:border-destructive touch-action-manipulation bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2 has-[>svg]:px-3'

// SheetClose classes (synced with button.tsx outline variant)
const sheetCloseClasses = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40 aria-[invalid]:border-destructive touch-action-manipulation border bg-background text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 h-9 px-4 py-2 has-[>svg]:px-3'

// Close button (X) classes
const closeButtonClasses = 'absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none'

/**
 * Props for Sheet component.
 */
interface SheetProps {
  /** Whether the sheet is open */
  open?: boolean
  /** Callback when open state should change */
  onOpenChange?: (open: boolean) => void
  /** Scope ID for SSR portal support (explicit) */
  scopeId?: string
  /** Scope ID from compiler (auto-passed via hydration props) */
  __instanceId?: string
  /** Scope ID from compiler in loops (auto-passed via hydration props) */
  __bfScope?: string
  /** Sheet content */
  children?: Child
}

/**
 * Sheet root component.
 * Provides open state to children via context.
 *
 * @param props.open - Whether the sheet is open
 * @param props.onOpenChange - Callback when open state should change
 */
function Sheet(props: SheetProps) {
  return (
    <SheetContext.Provider value={{
      open: () => props.open ?? false,
      onOpenChange: props.onOpenChange ?? (() => {}),
    }}>
      {props.children}
    </SheetContext.Provider>
  )
}

/**
 * Props for SheetTrigger component.
 */
interface SheetTriggerProps extends ButtonHTMLAttributes {
  /** Whether disabled */
  disabled?: boolean
  /** Render child element as trigger instead of built-in button */
  asChild?: boolean
  /** Button content */
  children?: Child
}

/**
 * Button that triggers the sheet to open.
 * Reads open state from context and toggles via onOpenChange.
 *
 * @param props.disabled - Whether disabled
 * @param props.asChild - Render child as trigger
 */
function SheetTrigger(props: SheetTriggerProps) {
  const handleMount = (el: HTMLElement) => {
    const ctx = useContext(SheetContext)

    el.addEventListener('click', () => {
      ctx.onOpenChange(!ctx.open())
    })
  }

  if (props.asChild) {
    return (
      <span
        data-slot="sheet-trigger"
        style="display:contents"
        ref={handleMount}
      >
        {props.children}
      </span>
    )
  }

  return (
    <button
      data-slot="sheet-trigger"
      type="button"
      id={props.id}
      className={`${sheetTriggerClasses} ${props.className ?? ''}`}
      disabled={props.disabled ?? false}
      ref={handleMount}
    >
      {props.children}
    </button>
  )
}

/**
 * Props for SheetOverlay component.
 */
interface SheetOverlayProps extends HTMLBaseAttributes {
}

/**
 * Semi-transparent overlay behind the sheet.
 * Portals to document.body to avoid z-index issues with fixed headers.
 * Reads open state from context.
 */
function SheetOverlay(props: SheetOverlayProps) {
  const handleMount = (el: HTMLElement) => {
    // Portal to body
    if (el && el.parentNode !== document.body && !isSSRPortal(el)) {
      const ownerScope = el.closest('[bf-s]') ?? undefined
      createPortal(el, document.body, { ownerScope })
    }

    const ctx = useContext(SheetContext)

    // Reactive show/hide + click-to-close
    createEffect(() => {
      const isOpen = ctx.open()
      el.dataset.state = isOpen ? 'open' : 'closed'
      el.className = `${sheetOverlayBaseClasses} ${isOpen ? sheetOverlayOpenClasses : sheetOverlayClosedClasses} ${props.className ?? ''}`
    })

    el.addEventListener('click', () => {
      ctx.onOpenChange(false)
    })
  }

  return (
    <div
      data-slot="sheet-overlay"
      data-state="closed"
      id={props.id}
      className={`${sheetOverlayBaseClasses} ${sheetOverlayClosedClasses} ${props.className ?? ''}`}
      ref={handleMount}
    />
  )
}

/**
 * Props for SheetContent component.
 */
interface SheetContentProps extends HTMLBaseAttributes {
  /** Sheet content */
  children?: Child
  /** Which edge the sheet slides from */
  side?: SheetSide
  /** Whether to show the built-in close button (X) */
  showCloseButton?: boolean
  /** ID of the title element for aria-labelledby */
  ariaLabelledby?: string
  /** ID of the description element for aria-describedby */
  ariaDescribedby?: string
}

/**
 * Main content container for the sheet.
 * Portals to document.body to avoid z-index issues with fixed headers.
 * Reads open state from context.
 *
 * @param props.side - Which edge to slide from (default: 'right')
 * @param props.showCloseButton - Show built-in X close button (default: true)
 * @param props.ariaLabelledby - ID of title for accessibility
 * @param props.ariaDescribedby - ID of description for accessibility
 */
function SheetContent(props: SheetContentProps) {
  const showClose = props.showCloseButton !== false

  const handleMount = (el: HTMLElement) => {
    // Portal to body
    if (el && el.parentNode !== document.body && !isSSRPortal(el)) {
      const ownerScope = el.closest('[bf-s]') ?? undefined
      createPortal(el, document.body, { ownerScope })
    }

    const ctx = useContext(SheetContext)

    // Track cleanup functions for global listeners
    let cleanupFns: Function[] = []

    // Reactive show/hide + scroll lock + focus trap + ESC key
    createEffect(() => {
      // Clean up previous listeners
      for (const fn of cleanupFns) fn()
      cleanupFns = []

      const side = props.side ?? 'right'
      const isOpen = ctx.open()
      el.dataset.state = isOpen ? 'open' : 'closed'
      el.className = `${sheetContentBaseClasses} ${sideClasses[side]} ${isOpen ? sideOpenClasses[side] : sideClosedClasses[side]} ${props.className ?? ''}`

      if (isOpen) {
        // Scroll lock
        const originalOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'

        // Focus first focusable element
        const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        setTimeout(() => {
          const focusableElements = el.querySelectorAll(focusableSelector)
          const firstElement = focusableElements[0] as HTMLElement
          firstElement?.focus()
        }, 0)

        // ESC key to close
        const handleKeyDown = (e: KeyboardEvent) => {
          if (e.key === 'Escape') {
            ctx.onOpenChange(false)
            return
          }

          // Focus trap
          if (e.key === 'Tab') {
            const focusableElements = el.querySelectorAll(focusableSelector)
            const firstElement = focusableElements[0] as HTMLElement
            const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement

            if (e.shiftKey) {
              if (document.activeElement === firstElement || document.activeElement === el) {
                e.preventDefault()
                lastElement?.focus()
              }
            } else {
              if (document.activeElement === lastElement) {
                e.preventDefault()
                firstElement?.focus()
              }
            }
          }
        }

        document.addEventListener('keydown', handleKeyDown)

        cleanupFns.push(
          () => { document.body.style.overflow = originalOverflow },
          () => document.removeEventListener('keydown', handleKeyDown),
        )
      }
    })
  }

  // Close button handler
  const handleCloseMount = (el: HTMLElement) => {
    const ctx = useContext(SheetContext)
    el.addEventListener('click', () => {
      ctx.onOpenChange(false)
    })
  }

  return (
    <div
      data-slot="sheet-content"
      data-state="closed"
      role="dialog"
      aria-modal="true"
      aria-labelledby={props.ariaLabelledby}
      aria-describedby={props.ariaDescribedby}
      tabindex={-1}
      id={props.id}
      className={`${sheetContentBaseClasses} ${sideClasses[props.side ?? 'right']} ${sideClosedClasses[props.side ?? 'right']} ${props.className ?? ''}`}
      ref={handleMount}
    >
      {props.children}
      {showClose && (
        <button
          data-slot="sheet-close-button"
          type="button"
          className={closeButtonClasses}
          ref={handleCloseMount}
        >
          <XIcon className="size-4" />
          <span className="sr-only">Close</span>
        </button>
      )}
    </div>
  )
}

/**
 * Props for SheetHeader component.
 */
interface SheetHeaderProps extends HTMLBaseAttributes {
  /** Header content (typically SheetTitle and SheetDescription) */
  children?: Child
}

/**
 * Header section of the sheet.
 *
 * @param props.children - Header content
 */
function SheetHeader({ children, className = '', ...props }: SheetHeaderProps) {
  return (
    <div data-slot="sheet-header" className={`${sheetHeaderClasses} ${className}`} {...props}>
      {children}
    </div>
  )
}

/**
 * Props for SheetTitle component.
 */
interface SheetTitleProps extends HTMLBaseAttributes {
  /** Title text */
  children?: Child
}

/**
 * Title of the sheet.
 *
 * @param props.id - ID for accessibility
 */
function SheetTitle({ children, className = '', ...props }: SheetTitleProps) {
  return (
    <h2 data-slot="sheet-title" className={`${sheetTitleClasses} ${className}`} {...props}>
      {children}
    </h2>
  )
}

/**
 * Props for SheetDescription component.
 */
interface SheetDescriptionProps extends HTMLBaseAttributes {
  /** Description text */
  children?: Child
}

/**
 * Description text for the sheet.
 *
 * @param props.id - ID for accessibility
 */
function SheetDescription({ children, className = '', ...props }: SheetDescriptionProps) {
  return (
    <p data-slot="sheet-description" className={`${sheetDescriptionClasses} ${className}`} {...props}>
      {children}
    </p>
  )
}

/**
 * Props for SheetFooter component.
 */
interface SheetFooterProps extends HTMLBaseAttributes {
  /** Footer content (typically action buttons) */
  children?: Child
}

/**
 * Footer section of the sheet.
 *
 * @param props.children - Footer content
 */
function SheetFooter({ children, className = '', ...props }: SheetFooterProps) {
  return (
    <div data-slot="sheet-footer" className={`${sheetFooterClasses} ${className}`} {...props}>
      {children}
    </div>
  )
}

/**
 * Props for SheetClose component.
 */
interface SheetCloseProps extends ButtonHTMLAttributes {
  /** Button content */
  children?: Child
}

/**
 * Close button for the sheet.
 * Reads context and calls onOpenChange(false) on click.
 */
function SheetClose(props: SheetCloseProps) {
  const handleMount = (el: HTMLElement) => {
    const ctx = useContext(SheetContext)

    el.addEventListener('click', () => {
      ctx.onOpenChange(false)
    })
  }

  return (
    <button
      data-slot="sheet-close"
      type="button"
      id={props.id}
      className={`${sheetCloseClasses} ${props.className ?? ''}`}
      ref={handleMount}
    >
      {props.children}
    </button>
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetOverlay,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
}
export type {
  SheetProps,
  SheetTriggerProps,
  SheetOverlayProps,
  SheetContentProps,
  SheetHeaderProps,
  SheetTitleProps,
  SheetDescriptionProps,
  SheetFooterProps,
  SheetCloseProps,
  SheetSide,
}
