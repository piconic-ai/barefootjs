"use client"

/**
 * AlertDialog Components
 *
 * A modal dialog for critical confirmations that require explicit user action.
 * Unlike Dialog, AlertDialog does NOT close on overlay click — users must
 * choose an action (Cancel or Action).
 *
 * Follows the WAI-ARIA alertdialog pattern and shadcn/ui's AlertDialog design.
 *
 * Features:
 * - ESC key to close
 * - Overlay does NOT close on click (key difference from Dialog)
 * - Focus trap (Tab/Shift+Tab cycles within modal)
 * - Accessibility (role="alertdialog", aria-modal="true")
 *
 * @example Basic alert dialog
 * ```tsx
 * const [open, setOpen] = createSignal(false)
 *
 * <AlertDialog open={open()} onOpenChange={setOpen}>
 *   <AlertDialogTrigger>Delete</AlertDialogTrigger>
 *   <AlertDialogOverlay />
 *   <AlertDialogContent ariaLabelledby="alert-title" ariaDescribedby="alert-desc">
 *     <AlertDialogHeader>
 *       <AlertDialogTitle id="alert-title">Are you sure?</AlertDialogTitle>
 *       <AlertDialogDescription id="alert-desc">
 *         This action cannot be undone.
 *       </AlertDialogDescription>
 *     </AlertDialogHeader>
 *     <AlertDialogFooter>
 *       <AlertDialogCancel>Cancel</AlertDialogCancel>
 *       <AlertDialogAction>Continue</AlertDialogAction>
 *     </AlertDialogFooter>
 *   </AlertDialogContent>
 * </AlertDialog>
 * ```
 *
 * @example Styled trigger (asChild)
 * ```tsx
 * // Wrapping a <Button> inside AlertDialogTrigger requires asChild. Without it,
 * // AlertDialogTrigger renders its OWN <button>, the HTML parser auto-closes the
 * // nested <button>, and the alert dialog silently never opens.
 * <AlertDialogTrigger asChild>
 *   <Button variant="destructive">Delete</Button>
 * </AlertDialogTrigger>
 * ```
 */

import { createContext, useContext, createEffect, createPortal, isSSRPortal } from '@barefootjs/client'
import type { HTMLBaseAttributes, ButtonHTMLAttributes } from '@barefootjs/jsx'
import type { Child } from '../../../types'

// Context for AlertDialog → children state sharing
interface AlertDialogContextValue {
  open: () => boolean
  onOpenChange: (open: boolean) => void
}

const AlertDialogContext = createContext<AlertDialogContextValue>()

// AlertDialogOverlay base classes (aligned with shadcn/ui)
const alertDialogOverlayBaseClasses = 'fixed inset-0 z-50 bg-black/80 transition-opacity duration-200'

// AlertDialogOverlay open/closed classes
const alertDialogOverlayOpenClasses = 'opacity-100'
const alertDialogOverlayClosedClasses = 'opacity-0 pointer-events-none'

// AlertDialogContent base classes (aligned with shadcn/ui)
const alertDialogContentBaseClasses = 'fixed left-[50%] top-[50%] z-50 flex flex-col w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 sm:rounded-lg'

// AlertDialogContent open/closed classes
const alertDialogContentOpenClasses = 'opacity-100 scale-100'
const alertDialogContentClosedClasses = 'opacity-0 scale-95 pointer-events-none'

// AlertDialogHeader classes
const alertDialogHeaderClasses = 'flex flex-col gap-2 text-center sm:text-left'

// AlertDialogTitle classes
const alertDialogTitleClasses = 'text-lg leading-none font-semibold'

// AlertDialogDescription classes
const alertDialogDescriptionClasses = 'text-muted-foreground text-sm'

// AlertDialogFooter classes
const alertDialogFooterClasses = 'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'

// AlertDialogTrigger classes (synced with button.tsx default variant)
const alertDialogTriggerClasses = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40 aria-[invalid]:border-destructive touch-action-manipulation bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2 has-[>svg]:px-3'

// AlertDialogCancel classes (synced with button.tsx outline variant)
const alertDialogCancelClasses = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40 aria-[invalid]:border-destructive touch-action-manipulation border border-input bg-background text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:hover:bg-input/50 h-9 px-4 py-2 has-[>svg]:px-3'

// AlertDialogAction classes (synced with button.tsx default variant)
const alertDialogActionClasses = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40 aria-[invalid]:border-destructive touch-action-manipulation bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2 has-[>svg]:px-3'

/**
 * Props for AlertDialog component.
 */
interface AlertDialogProps {
  /** Whether the alert dialog is open */
  open?: boolean
  /** Callback when open state should change */
  onOpenChange?: (open: boolean) => void
  /** Scope ID for SSR portal support (explicit) */
  scopeId?: string
  /** Scope ID from compiler (auto-passed via hydration props) */
  __instanceId?: string
  /** Scope ID from compiler in loops (auto-passed via hydration props) */
  __bfScope?: string
  /** AlertDialog content */
  children?: Child
}

/**
 * AlertDialog root component.
 * Provides open state to children via context.
 */
function AlertDialog(props: AlertDialogProps) {
  return (
    <AlertDialogContext.Provider value={{
      open: () => props.open ?? false,
      onOpenChange: props.onOpenChange ?? (() => {}),
    }}>
      {props.children}
    </AlertDialogContext.Provider>
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

  if (hasNestedInteractive || siblingIsInteractive) {
    console.warn(
      `[barefootjs] ${componentName} rendered an empty trigger next to an interactive element — did you nest a <button>/<Button> inside it? Use <${componentName} asChild> to adopt your own element.`
    )
  }
}

/**
 * Props for AlertDialogTrigger component.
 */
interface AlertDialogTriggerProps extends ButtonHTMLAttributes {
  /** Whether disabled */
  disabled?: boolean
  /**
   * Render the child element as the trigger instead of AlertDialogTrigger's own
   * `<button>`. Required whenever `children` is itself an interactive element
   * (e.g. `<Button>`) — without it, the nested `<button>` gets auto-closed by the
   * HTML parser and the alert dialog silently never opens.
   */
  asChild?: boolean
  /** Button content */
  children?: Child
}

/**
 * Button that triggers the alert dialog to open.
 *
 * @param props.asChild - Render child as trigger. Required when `children` is an
 *   interactive element like `<Button>` — see AlertDialogTriggerProps.asChild for why.
 */
function AlertDialogTrigger(props: AlertDialogTriggerProps) {
  const handleMount = (el: HTMLElement) => {
    const ctx = useContext(AlertDialogContext)

    el.addEventListener('click', () => {
      ctx.onOpenChange(!ctx.open())
    })

    if (!props.asChild) warnIfMisusedTrigger(el, 'AlertDialogTrigger')
  }

  if (props.asChild) {
    return (
      <span
        data-slot="alert-dialog-trigger"
        style="display:contents"
        ref={handleMount}
      >
        {props.children}
      </span>
    )
  }

  return (
    <button
      data-slot="alert-dialog-trigger"
      type="button"
      id={props.id}
      className={`${alertDialogTriggerClasses} ${props.className ?? ''}`}
      disabled={props.disabled ?? false}
      ref={handleMount}
    >
      {props.children}
    </button>
  )
}

/**
 * Props for AlertDialogOverlay component.
 */
interface AlertDialogOverlayProps extends HTMLBaseAttributes {
}

/**
 * Semi-transparent overlay behind the alert dialog.
 * Unlike Dialog overlay, this does NOT close on click.
 */
function AlertDialogOverlay(props: AlertDialogOverlayProps) {
  const handleMount = (el: HTMLElement) => {
    // Portal to body
    if (el && el.parentNode !== document.body && !isSSRPortal(el)) {
      const ownerScope = el.closest('[bf-s]') ?? undefined
      createPortal(el, document.body, { ownerScope })
    }

    const ctx = useContext(AlertDialogContext)

    // Reactive show/hide — NO click-to-close (key difference from Dialog)
    createEffect(() => {
      const isOpen = ctx.open()
      el.dataset.state = isOpen ? 'open' : 'closed'
      el.className = `${alertDialogOverlayBaseClasses} ${isOpen ? alertDialogOverlayOpenClasses : alertDialogOverlayClosedClasses} ${props.className ?? ''}`
    })
  }

  return (
    <div
      data-slot="alert-dialog-overlay"
      data-state="closed"
      id={props.id}
      className={`${alertDialogOverlayBaseClasses} ${alertDialogOverlayClosedClasses} ${props.className ?? ''}`}
      ref={handleMount}
    />
  )
}

/**
 * Props for AlertDialogContent component.
 */
interface AlertDialogContentProps extends HTMLBaseAttributes {
  /** AlertDialog content */
  children?: Child
  /** ID of the title element for aria-labelledby */
  ariaLabelledby?: string
  /** ID of the description element for aria-describedby */
  ariaDescribedby?: string
}

/**
 * Main content container for the alert dialog.
 * Uses role="alertdialog" instead of role="dialog".
 */
function AlertDialogContent(props: AlertDialogContentProps) {
  const handleMount = (el: HTMLElement) => {
    // Portal to body
    if (el && el.parentNode !== document.body && !isSSRPortal(el)) {
      const ownerScope = el.closest('[bf-s]') ?? undefined
      createPortal(el, document.body, { ownerScope })
    }

    const ctx = useContext(AlertDialogContext)

    // Track cleanup functions for global listeners
    let cleanupFns: Function[] = []

    // Reactive show/hide + scroll lock + focus trap + ESC key
    createEffect(() => {
      // Clean up previous listeners
      for (const fn of cleanupFns) fn()
      cleanupFns = []

      const isOpen = ctx.open()
      el.dataset.state = isOpen ? 'open' : 'closed'
      el.className = `${alertDialogContentBaseClasses} ${isOpen ? alertDialogContentOpenClasses : alertDialogContentClosedClasses} ${props.className ?? ''}`

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
      data-slot="alert-dialog-content"
      data-state="closed"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={props.ariaLabelledby}
      aria-describedby={props.ariaDescribedby}
      tabindex={-1}
      id={props.id}
      className={`${alertDialogContentBaseClasses} ${alertDialogContentClosedClasses} ${props.className ?? ''}`}
      ref={handleMount}
    >
      {props.children}
    </div>
  )
}

/**
 * Props for AlertDialogHeader component.
 */
interface AlertDialogHeaderProps extends HTMLBaseAttributes {
  /** Header content */
  children?: Child
}

/**
 * Header section of the alert dialog.
 */
function AlertDialogHeader({ className = '', children, ...props }: AlertDialogHeaderProps) {
  return (
    <div data-slot="alert-dialog-header" className={`${alertDialogHeaderClasses} ${className}`} {...props}>
      {children}
    </div>
  )
}

/**
 * Props for AlertDialogTitle component.
 */
interface AlertDialogTitleProps extends HTMLBaseAttributes {
  /** Title text */
  children?: Child
}

/**
 * Title of the alert dialog.
 */
function AlertDialogTitle({ className = '', children, ...props }: AlertDialogTitleProps) {
  return (
    <h2 data-slot="alert-dialog-title" className={`${alertDialogTitleClasses} ${className}`} {...props}>
      {children}
    </h2>
  )
}

/**
 * Props for AlertDialogDescription component.
 */
interface AlertDialogDescriptionProps extends HTMLBaseAttributes {
  /** Description text */
  children?: Child
}

/**
 * Description text for the alert dialog.
 */
function AlertDialogDescription({ className = '', children, ...props }: AlertDialogDescriptionProps) {
  return (
    <p data-slot="alert-dialog-description" className={`${alertDialogDescriptionClasses} ${className}`} {...props}>
      {children}
    </p>
  )
}

/**
 * Props for AlertDialogFooter component.
 */
interface AlertDialogFooterProps extends HTMLBaseAttributes {
  /** Footer content */
  children?: Child
}

/**
 * Footer section of the alert dialog.
 */
function AlertDialogFooter({ className = '', children, ...props }: AlertDialogFooterProps) {
  return (
    <div data-slot="alert-dialog-footer" className={`${alertDialogFooterClasses} ${className}`} {...props}>
      {children}
    </div>
  )
}

/**
 * Props for AlertDialogCancel component.
 */
interface AlertDialogCancelProps extends ButtonHTMLAttributes {
  /** Button content */
  children?: Child
}

/**
 * Cancel button for the alert dialog.
 * Closes the dialog without performing the action.
 */
function AlertDialogCancel(props: AlertDialogCancelProps) {
  const handleMount = (el: HTMLElement) => {
    const ctx = useContext(AlertDialogContext)

    el.addEventListener('click', () => {
      ctx.onOpenChange(false)
    })
  }

  return (
    <button
      data-slot="alert-dialog-cancel"
      type="button"
      id={props.id}
      className={`${alertDialogCancelClasses} ${props.className ?? ''}`}
      ref={handleMount}
    >
      {props.children}
    </button>
  )
}

/**
 * Props for AlertDialogAction component.
 */
interface AlertDialogActionProps extends ButtonHTMLAttributes {
  /** Button content */
  children?: Child
  /** Click handler for the action */
  onClick?: () => void
}

/**
 * Action button for the alert dialog.
 * Closes the dialog and triggers the action.
 */
function AlertDialogAction(props: AlertDialogActionProps) {
  const handleMount = (el: HTMLElement) => {
    const ctx = useContext(AlertDialogContext)

    el.addEventListener('click', () => {
      props.onClick?.()
      ctx.onOpenChange(false)
    })
  }

  return (
    <button
      data-slot="alert-dialog-action"
      type="button"
      id={props.id}
      className={`${alertDialogActionClasses} ${props.className ?? ''}`}
      ref={handleMount}
    >
      {props.children}
    </button>
  )
}

export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogOverlay,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
}
export type {
  AlertDialogProps,
  AlertDialogTriggerProps,
  AlertDialogOverlayProps,
  AlertDialogContentProps,
  AlertDialogHeaderProps,
  AlertDialogTitleProps,
  AlertDialogDescriptionProps,
  AlertDialogFooterProps,
  AlertDialogCancelProps,
  AlertDialogActionProps,
}
