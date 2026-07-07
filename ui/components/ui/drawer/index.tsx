"use client"

/**
 * Drawer Components
 *
 * A panel that slides in from the edge of the screen, typically from the bottom.
 * Similar to Sheet but designed for mobile-friendly interactions with a handle bar.
 * Inspired by shadcn/ui (Vaul-based) with CSS variable theming support.
 *
 * State management uses createContext/useContext for parent-child communication.
 * Drawer root manages open state, children consume via context.
 *
 * Features:
 * - ESC key to close
 * - Click outside (overlay) to close
 * - Focus trap (Tab/Shift+Tab cycles within panel)
 * - Accessibility (role="dialog", aria-modal="true")
 * - Slide animation from any edge (top, right, bottom, left)
 * - Handle bar indicator (for top/bottom directions)
 * - No built-in close button (X) by default
 *
 * @example Basic drawer
 * ```tsx
 * const [open, setOpen] = createSignal(false)
 *
 * <Drawer open={open()} onOpenChange={setOpen}>
 *   <DrawerTrigger>Open Drawer</DrawerTrigger>
 *   <DrawerOverlay />
 *   <DrawerContent direction="bottom" ariaLabelledby="drawer-title">
 *     <DrawerHandle />
 *     <DrawerHeader>
 *       <DrawerTitle id="drawer-title">Drawer Title</DrawerTitle>
 *       <DrawerDescription>Drawer description here.</DrawerDescription>
 *     </DrawerHeader>
 *     <DrawerFooter>
 *       <DrawerClose>Close</DrawerClose>
 *     </DrawerFooter>
 *   </DrawerContent>
 * </Drawer>
 * ```
 *
 * @example Styled trigger (asChild)
 * ```tsx
 * // Wrapping a <Button> inside DrawerTrigger requires asChild. Without it,
 * // DrawerTrigger renders its OWN <button>, the HTML parser auto-closes the
 * // nested <button>, and the drawer silently never opens.
 * <DrawerTrigger asChild>
 *   <Button variant="outline">Open Drawer</Button>
 * </DrawerTrigger>
 * ```
 */

import { createContext, useContext, createEffect, createPortal, isSSRPortal } from '@barefootjs/client'
import type { ButtonHTMLAttributes, HTMLBaseAttributes } from '@barefootjs/jsx'
import type { Child } from '../../../types'

// Context for Drawer -> children state sharing
interface DrawerContextValue {
  open: () => boolean
  onOpenChange: (open: boolean) => void
}

const DrawerContext = createContext<DrawerContextValue>()

// Direction variants
type DrawerDirection = 'top' | 'right' | 'bottom' | 'left'

// DrawerOverlay base classes
const drawerOverlayBaseClasses = 'fixed inset-0 z-50 bg-black/80 transition-opacity duration-200'

// DrawerOverlay open/closed classes
const drawerOverlayOpenClasses = 'opacity-100'
const drawerOverlayClosedClasses = 'opacity-0 pointer-events-none'

// DrawerContent base classes
const drawerContentBaseClasses = 'z-50 flex flex-col bg-background shadow-lg transition-transform duration-200'

// Direction-specific positioning classes
const directionClasses: Record<DrawerDirection, string> = {
  top: 'fixed inset-x-0 top-0 max-h-[80vh] rounded-b-lg',
  right: 'fixed inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm',
  bottom: 'fixed inset-x-0 bottom-0 max-h-[80vh] rounded-t-lg',
  left: 'fixed inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm',
}

// Direction-specific open state classes (slide to final position)
const directionOpenClasses: Record<DrawerDirection, string> = {
  top: 'translate-y-0',
  right: 'translate-x-0',
  bottom: 'translate-y-0',
  left: 'translate-x-0',
}

// Direction-specific closed state classes (slide off-screen + pointer-events-none to prevent
// closed portaled panels from other demos intercepting clicks)
const directionClosedClasses: Record<DrawerDirection, string> = {
  top: '-translate-y-full pointer-events-none',
  right: 'translate-x-full pointer-events-none',
  bottom: 'translate-y-full pointer-events-none',
  left: '-translate-x-full pointer-events-none',
}

// DrawerHeader classes — centered text for vertical drawers
const drawerHeaderClasses = 'flex flex-col gap-1.5 p-4 text-center'

// DrawerTitle classes
const drawerTitleClasses = 'text-foreground font-semibold'

// DrawerDescription classes
const drawerDescriptionClasses = 'text-muted-foreground text-sm'

// DrawerFooter classes
const drawerFooterClasses = 'mt-auto flex flex-col gap-2 p-4'

// DrawerTrigger classes (synced with button.tsx default variant)
const drawerTriggerClasses = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40 aria-[invalid]:border-destructive touch-action-manipulation bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2 has-[>svg]:px-3'

// DrawerClose classes (synced with button.tsx outline variant)
const drawerCloseClasses = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40 aria-[invalid]:border-destructive touch-action-manipulation border border-input bg-background text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:hover:bg-input/50 h-9 px-4 py-2 has-[>svg]:px-3'

/**
 * Props for Drawer component.
 */
interface DrawerProps {
  /** Whether the drawer is open */
  open?: boolean
  /** Callback when open state should change */
  onOpenChange?: (open: boolean) => void
  /** Scope ID for SSR portal support (explicit) */
  scopeId?: string
  /** Scope ID from compiler (auto-passed via hydration props) */
  __instanceId?: string
  /** Scope ID from compiler in loops (auto-passed via hydration props) */
  __bfScope?: string
  /** Drawer content */
  children?: Child
}

/**
 * Drawer root component.
 * Provides open state to children via context.
 *
 * @param props.open - Whether the drawer is open
 * @param props.onOpenChange - Callback when open state should change
 */
function Drawer(props: DrawerProps) {
  return (
    <DrawerContext.Provider value={{
      open: () => props.open ?? false,
      onOpenChange: props.onOpenChange ?? (() => {}),
    }}>
      {props.children}
    </DrawerContext.Provider>
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
 * Props for DrawerTrigger component.
 */
interface DrawerTriggerProps extends ButtonHTMLAttributes {
  /** Whether disabled */
  disabled?: boolean
  /**
   * Render the child element as the trigger instead of DrawerTrigger's own
   * `<button>`. Required whenever `children` is itself an interactive element
   * (e.g. `<Button>`) — without it, the nested `<button>` gets auto-closed by the
   * HTML parser and the drawer silently never opens.
   */
  asChild?: boolean
  /** Button content */
  children?: Child
}

/**
 * Button that triggers the drawer to open.
 * Reads open state from context and toggles via onOpenChange.
 *
 * @param props.disabled - Whether disabled
 * @param props.asChild - Render child as trigger. Required when `children` is an
 *   interactive element like `<Button>` — see DrawerTriggerProps.asChild for why.
 */
function DrawerTrigger(props: DrawerTriggerProps) {
  const handleMount = (el: HTMLElement) => {
    const ctx = useContext(DrawerContext)

    el.addEventListener('click', () => {
      ctx.onOpenChange(!ctx.open())
    })

    if (!props.asChild) warnIfMisusedTrigger(el, 'DrawerTrigger')
  }

  if (props.asChild) {
    return (
      <span
        data-slot="drawer-trigger"
        style="display:contents"
        ref={handleMount}
      >
        {props.children}
      </span>
    )
  }

  return (
    <button
      data-slot="drawer-trigger"
      type="button"
      id={props.id}
      className={`${drawerTriggerClasses} ${props.className ?? ''}`}
      disabled={props.disabled ?? false}
      ref={handleMount}
    >
      {props.children}
    </button>
  )
}

/**
 * Props for DrawerOverlay component.
 */
interface DrawerOverlayProps extends HTMLBaseAttributes {
}

/**
 * Semi-transparent overlay behind the drawer.
 * Portals to document.body to avoid z-index issues with fixed headers.
 * Reads open state from context.
 */
function DrawerOverlay(props: DrawerOverlayProps) {
  const handleMount = (el: HTMLElement) => {
    // Portal to body
    if (el && el.parentNode !== document.body && !isSSRPortal(el)) {
      const ownerScope = el.closest('[bf-s]') ?? undefined
      createPortal(el, document.body, { ownerScope })
    }

    const ctx = useContext(DrawerContext)

    // Reactive show/hide + click-to-close
    createEffect(() => {
      const isOpen = ctx.open()
      el.dataset.state = isOpen ? 'open' : 'closed'
      el.className = `${drawerOverlayBaseClasses} ${isOpen ? drawerOverlayOpenClasses : drawerOverlayClosedClasses} ${props.className ?? ''}`
    })

    el.addEventListener('click', () => {
      ctx.onOpenChange(false)
    })
  }

  return (
    <div
      data-slot="drawer-overlay"
      data-state="closed"
      id={props.id}
      className={`${drawerOverlayBaseClasses} ${drawerOverlayClosedClasses} ${props.className ?? ''}`}
      ref={handleMount}
    />
  )
}

/**
 * Props for DrawerContent component.
 */
interface DrawerContentProps extends HTMLBaseAttributes {
  /** Drawer content */
  children?: Child
  /** Which edge the drawer slides from */
  direction?: DrawerDirection
  /** ID of the title element for aria-labelledby */
  ariaLabelledby?: string
  /** ID of the description element for aria-describedby */
  ariaDescribedby?: string
}

/**
 * Main content container for the drawer.
 * Portals to document.body to avoid z-index issues with fixed headers.
 * Reads open state from context.
 *
 * @param props.direction - Which edge to slide from (default: 'bottom')
 * @param props.ariaLabelledby - ID of title for accessibility
 * @param props.ariaDescribedby - ID of description for accessibility
 */
function DrawerContent(props: DrawerContentProps) {
  const handleMount = (el: HTMLElement) => {
    // Portal to body
    if (el && el.parentNode !== document.body && !isSSRPortal(el)) {
      const ownerScope = el.closest('[bf-s]') ?? undefined
      createPortal(el, document.body, { ownerScope })
    }

    const ctx = useContext(DrawerContext)

    // Track cleanup functions for global listeners
    let cleanupFns: Function[] = []

    // Reactive show/hide + scroll lock + focus trap + ESC key
    createEffect(() => {
      // Clean up previous listeners
      for (const fn of cleanupFns) fn()
      cleanupFns = []

      const dir = props.direction ?? 'bottom'
      const isOpen = ctx.open()
      el.dataset.state = isOpen ? 'open' : 'closed'
      el.className = `${drawerContentBaseClasses} ${directionClasses[dir]} ${isOpen ? directionOpenClasses[dir] : directionClosedClasses[dir]} ${props.className ?? ''}`

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
      data-slot="drawer-content"
      data-state="closed"
      role="dialog"
      aria-modal="true"
      aria-labelledby={props.ariaLabelledby}
      aria-describedby={props.ariaDescribedby}
      tabindex={-1}
      id={props.id}
      className={`${drawerContentBaseClasses} ${directionClasses[props.direction ?? 'bottom']} ${directionClosedClasses[props.direction ?? 'bottom']} ${props.className ?? ''}`}
      ref={handleMount}
    >
      {props.children}
    </div>
  )
}

/**
 * Props for DrawerHandle component.
 */
interface DrawerHandleProps extends HTMLBaseAttributes {
}

/**
 * Visual handle indicator for the drawer.
 * Displays a small horizontal bar, typically at the top of bottom drawers.
 */
function DrawerHandle({ className = '', ...props }: DrawerHandleProps) {
  return (
    <div
      data-slot="drawer-handle"
      className={`mx-auto mt-4 h-2 w-[100px] shrink-0 rounded-full bg-muted ${className}`}
      {...props}
    />
  )
}

/**
 * Props for DrawerHeader component.
 */
interface DrawerHeaderProps extends HTMLBaseAttributes {
  /** Header content (typically DrawerTitle and DrawerDescription) */
  children?: Child
}

/**
 * Header section of the drawer.
 * Text is centered by default (common for bottom drawers).
 *
 * @param props.children - Header content
 */
function DrawerHeader({ className = '', children, ...props }: DrawerHeaderProps) {
  return (
    <div data-slot="drawer-header" className={`${drawerHeaderClasses} ${className}`} {...props}>
      {children}
    </div>
  )
}

/**
 * Props for DrawerTitle component.
 */
interface DrawerTitleProps extends HTMLBaseAttributes {
  /** Title text */
  children?: Child
}

/**
 * Title of the drawer.
 *
 * @param props.id - ID for accessibility
 */
function DrawerTitle({ className = '', children, ...props }: DrawerTitleProps) {
  return (
    <h2 data-slot="drawer-title" className={`${drawerTitleClasses} ${className}`} {...props}>
      {children}
    </h2>
  )
}

/**
 * Props for DrawerDescription component.
 */
interface DrawerDescriptionProps extends HTMLBaseAttributes {
  /** Description text */
  children?: Child
}

/**
 * Description text for the drawer.
 *
 * @param props.id - ID for accessibility
 */
function DrawerDescription({ className = '', children, ...props }: DrawerDescriptionProps) {
  return (
    <p data-slot="drawer-description" className={`${drawerDescriptionClasses} ${className}`} {...props}>
      {children}
    </p>
  )
}

/**
 * Props for DrawerFooter component.
 */
interface DrawerFooterProps extends HTMLBaseAttributes {
  /** Footer content (typically action buttons) */
  children?: Child
}

/**
 * Footer section of the drawer.
 *
 * @param props.children - Footer content
 */
function DrawerFooter({ className = '', children, ...props }: DrawerFooterProps) {
  return (
    <div data-slot="drawer-footer" className={`${drawerFooterClasses} ${className}`} {...props}>
      {children}
    </div>
  )
}

/**
 * Props for DrawerClose component.
 */
interface DrawerCloseProps extends ButtonHTMLAttributes {
  /** Button content */
  children?: Child
}

/**
 * Close button for the drawer.
 * Reads context and calls onOpenChange(false) on click.
 */
function DrawerClose(props: DrawerCloseProps) {
  const handleMount = (el: HTMLElement) => {
    const ctx = useContext(DrawerContext)

    el.addEventListener('click', () => {
      ctx.onOpenChange(false)
    })
  }

  return (
    <button
      data-slot="drawer-close"
      type="button"
      id={props.id}
      className={`${drawerCloseClasses} ${props.className ?? ''}`}
      ref={handleMount}
    >
      {props.children}
    </button>
  )
}

export {
  Drawer,
  DrawerTrigger,
  DrawerOverlay,
  DrawerContent,
  DrawerHandle,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
  DrawerClose,
}
export type {
  DrawerProps,
  DrawerTriggerProps,
  DrawerOverlayProps,
  DrawerContentProps,
  DrawerHandleProps,
  DrawerHeaderProps,
  DrawerTitleProps,
  DrawerDescriptionProps,
  DrawerFooterProps,
  DrawerCloseProps,
  DrawerDirection,
}
