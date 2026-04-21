"use client"

/**
 * Dialog Components
 *
 * A modal dialog that displays content in a layer above the page.
 * Inspired by shadcn/ui with CSS variable theming support.
 *
 * State management uses createContext/useContext for parent-child communication.
 * Dialog root manages open state, children consume via context.
 *
 * Features:
 * - ESC key to close
 * - Click outside (overlay) to close
 * - Focus trap (Tab/Shift+Tab cycles within modal)
 * - Accessibility (role="dialog", aria-modal="true")
 *
 * @example Basic dialog
 * ```tsx
 * const [open, setOpen] = createSignal(false)
 *
 * <Dialog open={open()} onOpenChange={setOpen}>
 *   <DialogTrigger>Open Dialog</DialogTrigger>
 *   <DialogOverlay />
 *   <DialogContent ariaLabelledby="dialog-title">
 *     <DialogHeader>
 *       <DialogTitle id="dialog-title">Dialog Title</DialogTitle>
 *       <DialogDescription>Dialog description here.</DialogDescription>
 *     </DialogHeader>
 *     <DialogFooter>
 *       <DialogClose>Cancel</DialogClose>
 *       <Button onClick={handleAction}>Confirm</Button>
 *     </DialogFooter>
 *   </DialogContent>
 * </Dialog>
 * ```
 */

import { createContext, useContext, createEffect, createPortal, isSSRPortal } from '@barefootjs/client'
import type { ButtonHTMLAttributes, HTMLBaseAttributes } from '@barefootjs/jsx'
import type { Child } from '../../../types'

// Context for Dialog → children state sharing
interface DialogContextValue {
  open: () => boolean
  onOpenChange: (open: boolean) => void
}

const DialogContext = createContext<DialogContextValue>()

// DialogOverlay base classes (aligned with shadcn/ui)
// Portal: element is moved to document.body during hydration
const dialogOverlayBaseClasses = 'fixed inset-0 z-50 bg-black/80 transition-opacity duration-200'

// DialogOverlay open/closed classes
const dialogOverlayOpenClasses = 'opacity-100'
const dialogOverlayClosedClasses = 'opacity-0 pointer-events-none'

// DialogContent base classes (aligned with shadcn/ui)
// Portal: element is moved to document.body during hydration
// Note: shadcn/ui uses 'grid', we use 'flex flex-col' for scroll behavior with fixed header/footer
const dialogContentBaseClasses = 'fixed left-[50%] top-[50%] z-50 flex flex-col w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 sm:rounded-lg'

// DialogContent open/closed classes
const dialogContentOpenClasses = 'opacity-100 scale-100'
const dialogContentClosedClasses = 'opacity-0 scale-95 pointer-events-none'

// DialogHeader classes
const dialogHeaderClasses = 'flex flex-col gap-2 text-center sm:text-left'

// DialogTitle classes
const dialogTitleClasses = 'text-lg leading-none font-semibold'

// DialogDescription classes
const dialogDescriptionClasses = 'text-muted-foreground text-sm'

// DialogFooter classes
const dialogFooterClasses = 'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'

// DialogTrigger classes (synced with button.tsx default variant)
const dialogTriggerClasses = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40 aria-[invalid]:border-destructive touch-action-manipulation bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2 has-[>svg]:px-3'

// DialogClose classes (synced with button.tsx outline variant)
const dialogCloseClasses = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40 aria-[invalid]:border-destructive touch-action-manipulation border bg-background text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 h-9 px-4 py-2 has-[>svg]:px-3'

/**
 * Props for Dialog component.
 */
interface DialogProps {
  /** Whether the dialog is open */
  open?: boolean
  /** Callback when open state should change */
  onOpenChange?: (open: boolean) => void
  /** Scope ID for SSR portal support (explicit) */
  scopeId?: string
  /** Scope ID from compiler (auto-passed via hydration props) */
  __instanceId?: string
  /** Scope ID from compiler in loops (auto-passed via hydration props) */
  __bfScope?: string
  /** Dialog content */
  children?: Child
}

/**
 * Dialog root component.
 * Provides open state to children via context.
 *
 * @param props.open - Whether the dialog is open
 * @param props.onOpenChange - Callback when open state should change
 */
function Dialog(props: DialogProps) {
  return (
    <DialogContext.Provider value={{
      open: () => props.open ?? false,
      onOpenChange: props.onOpenChange ?? (() => {}),
    }}>
      {props.children}
    </DialogContext.Provider>
  )
}

// Keep DialogRoot as alias for backward compatibility
const DialogRoot = Dialog

/**
 * Props for DialogTrigger component.
 */
interface DialogTriggerProps extends ButtonHTMLAttributes {
  /** Whether disabled */
  disabled?: boolean
  /** Render child element as trigger instead of built-in button */
  asChild?: boolean
  /** Button content */
  children?: Child
}

/**
 * Button that triggers the dialog to open.
 * Reads open state from context and toggles via onOpenChange.
 *
 * @param props.disabled - Whether disabled
 * @param props.asChild - Render child as trigger
 */
function DialogTrigger(props: DialogTriggerProps) {
  const handleMount = (el: HTMLElement) => {
    const ctx = useContext(DialogContext)

    el.addEventListener('click', () => {
      ctx.onOpenChange(!ctx.open())
    })
  }

  if (props.asChild) {
    return (
      <span
        data-slot="dialog-trigger"
        style="display:contents"
        ref={handleMount}
      >
        {props.children}
      </span>
    )
  }

  return (
    <button
      data-slot="dialog-trigger"
      type="button"
      id={props.id}
      className={`${dialogTriggerClasses} ${props.className ?? ''}`}
      disabled={props.disabled ?? false}
      ref={handleMount}
    >
      {props.children}
    </button>
  )
}

/**
 * Props for DialogOverlay component.
 */
interface DialogOverlayProps extends HTMLBaseAttributes {
}

/**
 * Semi-transparent overlay behind the dialog.
 * Portals to document.body to avoid z-index issues with fixed headers.
 * Reads open state from context.
 */
function DialogOverlay(props: DialogOverlayProps) {
  const handleMount = (el: HTMLElement) => {
    // Portal to body
    if (el && el.parentNode !== document.body && !isSSRPortal(el)) {
      const ownerScope = el.closest('[bf-s]') ?? undefined
      createPortal(el, document.body, { ownerScope })
    }

    const ctx = useContext(DialogContext)

    // Reactive show/hide + click-to-close
    createEffect(() => {
      const isOpen = ctx.open()
      el.dataset.state = isOpen ? 'open' : 'closed'
      el.className = `${dialogOverlayBaseClasses} ${isOpen ? dialogOverlayOpenClasses : dialogOverlayClosedClasses} ${props.className ?? ''}`
    })

    el.addEventListener('click', () => {
      ctx.onOpenChange(false)
    })
  }

  return (
    <div
      data-slot="dialog-overlay"
      data-state="closed"
      id={props.id}
      className={`${dialogOverlayBaseClasses} ${dialogOverlayClosedClasses} ${props.className ?? ''}`}
      ref={handleMount}
    />
  )
}

/**
 * Props for DialogContent component.
 */
interface DialogContentProps extends HTMLBaseAttributes {
  /** Dialog content */
  children?: Child
  /** ID of the title element for aria-labelledby */
  ariaLabelledby?: string
  /** ID of the description element for aria-describedby */
  ariaDescribedby?: string
}

/**
 * Main content container for the dialog.
 * Portals to document.body to avoid z-index issues with fixed headers.
 * Reads open state from context.
 *
 * @param props.ariaLabelledby - ID of title for accessibility
 * @param props.ariaDescribedby - ID of description for accessibility
 */
function DialogContent(props: DialogContentProps) {
  const handleMount = (el: HTMLElement) => {
    // Portal to body
    if (el && el.parentNode !== document.body && !isSSRPortal(el)) {
      const ownerScope = el.closest('[bf-s]') ?? undefined
      createPortal(el, document.body, { ownerScope })
    }

    const ctx = useContext(DialogContext)

    // Track cleanup functions for global listeners
    let cleanupFns: Function[] = []

    // Reactive show/hide + scroll lock + focus trap + ESC key
    createEffect(() => {
      // Clean up previous listeners
      for (const fn of cleanupFns) fn()
      cleanupFns = []

      const isOpen = ctx.open()
      el.dataset.state = isOpen ? 'open' : 'closed'
      el.className = `${dialogContentBaseClasses} ${isOpen ? dialogContentOpenClasses : dialogContentClosedClasses} ${props.className ?? ''}`

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

  return (
    <div
      data-slot="dialog-content"
      data-state="closed"
      role="dialog"
      aria-modal="true"
      aria-labelledby={props.ariaLabelledby}
      aria-describedby={props.ariaDescribedby}
      tabindex={-1}
      id={props.id}
      className={`${dialogContentBaseClasses} ${dialogContentClosedClasses} ${props.className ?? ''}`}
      ref={handleMount}
    >
      {props.children}
    </div>
  )
}

/**
 * Props for DialogHeader component.
 */
interface DialogHeaderProps extends HTMLBaseAttributes {
  /** Header content (typically DialogTitle and DialogDescription) */
  children?: Child
}

/**
 * Header section of the dialog.
 *
 * @param props.children - Header content
 */
function DialogHeader({ className = '', children, ...props }: DialogHeaderProps) {
  return (
    <div data-slot="dialog-header" className={`${dialogHeaderClasses} ${className}`} {...props}>
      {children}
    </div>
  )
}

/**
 * Props for DialogTitle component.
 */
interface DialogTitleProps extends HTMLBaseAttributes {
  /** ID for aria-labelledby reference */
  id?: string
  /** Title text */
  children?: Child
}

/**
 * Title of the dialog.
 *
 * @param props.id - ID for accessibility
 */
function DialogTitle({ className = '', id, children, ...props }: DialogTitleProps) {
  return (
    <h2 data-slot="dialog-title" id={id} className={`${dialogTitleClasses} ${className}`} {...props}>
      {children}
    </h2>
  )
}

/**
 * Props for DialogDescription component.
 */
interface DialogDescriptionProps extends HTMLBaseAttributes {
  /** ID for aria-describedby reference */
  id?: string
  /** Description text */
  children?: Child
}

/**
 * Description text for the dialog.
 *
 * @param props.id - ID for accessibility
 */
function DialogDescription({ className = '', id, children, ...props }: DialogDescriptionProps) {
  return (
    <p data-slot="dialog-description" id={id} className={`${dialogDescriptionClasses} ${className}`} {...props}>
      {children}
    </p>
  )
}

/**
 * Props for DialogFooter component.
 */
interface DialogFooterProps extends HTMLBaseAttributes {
  /** Footer content (typically action buttons) */
  children?: Child
}

/**
 * Footer section of the dialog.
 *
 * @param props.children - Footer content
 */
function DialogFooter({ className = '', children, ...props }: DialogFooterProps) {
  return (
    <div data-slot="dialog-footer" className={`${dialogFooterClasses} ${className}`} {...props}>
      {children}
    </div>
  )
}

/**
 * Props for DialogClose component.
 */
interface DialogCloseProps extends ButtonHTMLAttributes {
  /** Button content */
  children?: Child
}

/**
 * Close button for the dialog.
 * Reads context and calls onOpenChange(false) on click.
 */
function DialogClose(props: DialogCloseProps) {
  const handleMount = (el: HTMLElement) => {
    const ctx = useContext(DialogContext)

    el.addEventListener('click', () => {
      ctx.onOpenChange(false)
    })
  }

  return (
    <button
      data-slot="dialog-close"
      type="button"
      id={props.id}
      className={`${dialogCloseClasses} ${props.className ?? ''}`}
      ref={handleMount}
    >
      {props.children}
    </button>
  )
}

export {
  Dialog,
  DialogRoot,
  DialogTrigger,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
}
export type {
  DialogProps,
  DialogTriggerProps,
  DialogOverlayProps,
  DialogContentProps,
  DialogHeaderProps,
  DialogTitleProps,
  DialogDescriptionProps,
  DialogFooterProps,
  DialogCloseProps,
}
