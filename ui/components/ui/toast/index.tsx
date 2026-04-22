"use client"

/**
 * Toast Components
 *
 * A non-blocking notification component that displays brief messages.
 * Inspired by shadcn/ui with CSS variable theming support.
 *
 * State management uses createContext/useContext for parent-child communication.
 * Toast root manages open state and animation, children consume via context.
 *
 * Features:
 * - Variants: default, success, error, warning, info
 * - Auto-dismiss with configurable duration
 * - Manual dismiss via close button or context
 * - Portal rendering to document.body
 * - Reactive enter/exit animations via createEffect
 * - Position options: top-right, top-center, top-left, bottom-right, bottom-center, bottom-left
 * - Accessibility: role="status", aria-live="polite"
 *
 * @example Basic toast
 * ```tsx
 * const [open, setOpen] = createSignal(false)
 *
 * <ToastProvider position="bottom-right">
 *   <Toast open={open()} onOpenChange={setOpen}>
 *     <div className="flex-1">
 *       <ToastTitle>Success!</ToastTitle>
 *       <ToastDescription>Your changes have been saved.</ToastDescription>
 *     </div>
 *     <ToastClose />
 *   </Toast>
 * </ToastProvider>
 * ```
 *
 * @example Toast with action
 * ```tsx
 * <Toast open={open()} onOpenChange={setOpen}>
 *   <div className="flex-1">
 *     <ToastTitle>Item deleted</ToastTitle>
 *     <ToastDescription>The item has been removed.</ToastDescription>
 *   </div>
 *   <ToastAction altText="Undo" onClick={handleUndo}>Undo</ToastAction>
 *   <ToastClose />
 * </Toast>
 * ```
 */

import { createContext, useContext, createEffect, createPortal, isSSRPortal } from '@barefootjs/client'
import type { ButtonHTMLAttributes, HTMLBaseAttributes } from '@barefootjs/jsx'
import type { Child } from '../../../types'
import { XIcon } from '../icon'

// Type definitions
type ToastVariant = 'default' | 'success' | 'error' | 'warning' | 'info'
type ToastPosition = 'top-right' | 'top-center' | 'top-left' | 'bottom-right' | 'bottom-center' | 'bottom-left'

// Context for Toast -> children state sharing
interface ToastContextValue {
  dismiss: () => void
}

const ToastContext = createContext<ToastContextValue>()


// ToastProvider position classes
const positionClasses: Record<ToastPosition, string> = {
  'top-right': 'top-4 right-4',
  'top-center': 'top-4 left-1/2 -translate-x-1/2 items-center',
  'top-left': 'top-4 left-4',
  'bottom-right': 'bottom-4 right-4',
  'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2 items-center',
  'bottom-left': 'bottom-4 left-4',
}

// ToastProvider base classes
const toastProviderClasses = 'fixed z-50 flex flex-col gap-2 pointer-events-none'

// Toast base classes
const toastBaseClasses = 'items-start gap-3 w-80 p-4 rounded-lg border shadow-lg pointer-events-auto transition-all duration-slow ease-out'

// Toast style (neutral for all variants — icons differentiate types)
const toastVariantClass = 'bg-background text-foreground'

// Toast variant icon color classes
const toastIconClasses: Record<ToastVariant, string> = {
  default: '',
  success: 'text-success',
  error: 'text-destructive',
  warning: 'text-warning',
  info: 'text-info',
}

// Position-aware toast animation classes
function getToastStateClasses(position: ToastPosition) {
  let enterExitClass = ''
  if (position.endsWith('center')) {
    enterExitClass = position.startsWith('top') ? '-translate-y-full' : 'translate-y-full'
  } else if (position.endsWith('left')) {
    enterExitClass = '-translate-x-full'
  } else {
    enterExitClass = 'translate-x-full'
  }

  return {
    entering: `flex ${enterExitClass} opacity-0`,
    visible: 'flex translate-x-0 translate-y-0 opacity-100',
    exiting: `flex ${enterExitClass} opacity-0`,
    hidden: 'hidden',
  }
}

// ToastTitle classes
const toastTitleClasses = 'text-sm font-semibold'

// ToastDescription classes
const toastDescriptionClasses = 'text-sm opacity-90'

// ToastClose classes
const toastCloseClasses = 'ml-auto -mr-1 -mt-1 h-6 w-6 rounded-md inline-flex items-center justify-center opacity-50 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring'

// ToastAction classes
const toastActionClasses = 'inline-flex items-center justify-center rounded-md text-sm font-medium h-8 px-3 border border-current opacity-80 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring'

/**
 * Props for ToastProvider component.
 */
interface ToastProviderProps extends HTMLBaseAttributes {
  /**
   * Position of the toast container.
   * @default 'bottom-right'
   */
  position?: ToastPosition
  /** Toast components */
  children?: Child
}

/**
 * Container for toast notifications.
 * Portals to document.body to avoid z-index issues.
 *
 * @param props.position - Position of the container
 */
function ToastProvider(props: ToastProviderProps) {
  const handleMount = (el: HTMLElement) => {
    // Portal to body
    if (el && el.parentNode !== document.body && !isSSRPortal(el)) {
      const ownerScope = el.closest('[bf-s]') ?? undefined
      createPortal(el, document.body, { ownerScope })
    }

    createEffect(() => {
      const position = props.position ?? 'bottom-right'
      el.dataset.position = position
      el.className = `${toastProviderClasses} ${positionClasses[position]} ${props.className ?? ''}`
    })
  }

  return (
    <div
      data-slot="toast-provider"
      id={props.id}
      data-position={props.position ?? 'bottom-right'}
      className={`${toastProviderClasses} ${positionClasses[props.position ?? 'bottom-right']} ${props.className ?? ''}`}
      ref={handleMount}
    >
      {props.children}
    </div>
  )
}

/**
 * Props for Toast component.
 */
interface ToastProps extends HTMLBaseAttributes {
  /**
   * Visual variant of the toast.
   * @default 'default'
   */
  variant?: ToastVariant
  /**
   * Whether the toast is visible.
   * @default false
   */
  open?: boolean
  /** Callback when open state changes (e.g., on auto-dismiss) */
  onOpenChange?: (open: boolean) => void
  /**
   * Auto-dismiss duration in ms. Set to 0 to disable auto-dismiss.
   * @default 5000
   */
  duration?: number
  /** Toast content */
  children?: Child
}

/**
 * Toast notification component.
 * Manages enter/exit animations reactively via createEffect.
 *
 * @param props.variant - Visual variant
 * @param props.open - Whether visible
 * @param props.onOpenChange - Called on auto-dismiss or close
 * @param props.duration - Auto-dismiss duration in ms (0 = no auto-dismiss)
 */
function Toast(props: ToastProps) {
  const variant = props.variant ?? 'default'
  const className = props.className ?? ''

  const dismiss = () => {
    props.onOpenChange?.(false)
  }

  const handleMount = (el: HTMLElement) => {
    const providerEl = el.closest('[data-slot="toast-provider"]') as HTMLElement
    let dismissTimer: ReturnType<typeof setTimeout> | null = null
    let exitTimer: ReturnType<typeof setTimeout> | null = null

    // Transition to hidden after exit animation completes
    el.addEventListener('transitionend', (e) => {
      if (e.target !== el) return
      if (el.dataset.state === 'exiting') {
        if (exitTimer) { clearTimeout(exitTimer); exitTimer = null }
        el.dataset.state = 'hidden'
        el.className = `hidden ${toastBaseClasses} ${toastVariantClass} ${className}`
      }
    })

    createEffect(() => {
      const position = (providerEl?.dataset.position ?? 'bottom-right') as ToastPosition
      const stateClasses = getToastStateClasses(position)
      const isOpen = props.open ?? false
      const duration = props.duration ?? 5000

      if (isOpen) {
        // Clear dismiss timer when entering
        if (dismissTimer) { clearTimeout(dismissTimer); dismissTimer = null }
        if (exitTimer)    { clearTimeout(exitTimer);    exitTimer    = null }

        // Entering state
        el.dataset.state = 'entering'
        el.className = `${stateClasses.entering} ${toastBaseClasses} ${toastVariantClass} ${className}`

        // Transition to visible on next frame
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            el.dataset.state = 'visible'
            el.className = `${stateClasses.visible} ${toastBaseClasses} ${toastVariantClass} ${className}`
          })
        })

        // Auto-dismiss timer
        if (duration > 0) {
          dismissTimer = setTimeout(() => {
            dismiss()
          }, duration)
        }
      } else {
        if (dismissTimer) { clearTimeout(dismissTimer); dismissTimer = null }
        if (exitTimer)    { clearTimeout(exitTimer);    exitTimer    = null }

        const currentState = el.dataset.state
        if (currentState === 'visible' || currentState === 'entering') {
          el.dataset.state = 'exiting'
          el.className = `${stateClasses.exiting} ${toastBaseClasses} ${toastVariantClass} ${className}`

          // Fallback: if transitionend is dropped (CI load, backgrounded tab, etc.),
          // still finalize exit. Idempotent with the transitionend listener.
          exitTimer = setTimeout(() => {
            exitTimer = null
            if (el.dataset.state === 'exiting') {
              el.dataset.state = 'hidden'
              el.className = `hidden ${toastBaseClasses} ${toastVariantClass} ${className}`
            }
          }, 1000) // duration-slow (300ms) + generous buffer
        }
      }
    })
  }

  const iconClass = toastIconClasses[variant]

  return (
    <ToastContext.Provider value={{ dismiss }}>
      <div
        data-slot="toast"
        id={props.id}
        data-variant={variant}
        data-state="hidden"
        role={variant === 'error' ? 'alert' : 'status'}
        aria-live={variant === 'error' ? 'assertive' : 'polite'}
        className={`hidden ${toastBaseClasses} ${toastVariantClass} ${className}`}
        ref={handleMount}
      >
        {variant === 'success' && (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className={`shrink-0 ${iconClass}`} aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <path d="m9 12 2 2 4-4" />
          </svg>
        )}
        {variant === 'error' && (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className={`shrink-0 ${iconClass}`} aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <path d="m15 9-6 6" />
            <path d="m9 9 6 6" />
          </svg>
        )}
        {variant === 'warning' && (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className={`shrink-0 ${iconClass}`} aria-hidden="true">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
          </svg>
        )}
        {variant === 'info' && (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className={`shrink-0 ${iconClass}`} aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
        )}
        {props.children}
      </div>
    </ToastContext.Provider>
  )
}

/**
 * Props for ToastTitle component.
 */
interface ToastTitleProps extends HTMLBaseAttributes {
  /** Title text */
  children?: Child
}

/**
 * Title text for the toast.
 */
function ToastTitle({ className = '', children, ...props }: ToastTitleProps) {
  return (
    <div data-slot="toast-title" {...props} className={`${toastTitleClasses} ${className}`}>
      {children}
    </div>
  )
}

/**
 * Props for ToastDescription component.
 */
interface ToastDescriptionProps extends HTMLBaseAttributes {
  /** Description text */
  children?: Child
}

/**
 * Description text for the toast.
 */
function ToastDescription({ className = '', children, ...props }: ToastDescriptionProps) {
  return (
    <div data-slot="toast-description" {...props} className={`${toastDescriptionClasses} ${className}`}>
      {children}
    </div>
  )
}

/**
 * Props for ToastClose component.
 */
interface ToastCloseProps extends ButtonHTMLAttributes {
}

/**
 * Close button for the toast.
 * Uses ToastContext to dismiss on click. No additional handler —
 * its only responsibility is dismissing the toast.
 */
function ToastClose(props: ToastCloseProps) {
  const handleMount = (el: HTMLElement) => {
    const ctx = useContext(ToastContext)

    el.addEventListener('click', () => {
      ctx.dismiss()
    })
  }

  return (
    <button
      data-slot="toast-close"
      id={props.id}
      type="button"
      aria-label="Close"
      className={`${toastCloseClasses} ${props.className ?? ''}`}
      ref={handleMount}
    >
      <XIcon size="sm" className="pointer-events-none" />
    </button>
  )
}

/**
 * Props for ToastAction component.
 */
interface ToastActionProps extends ButtonHTMLAttributes {
  /** Accessible text describing the action */
  altText: string
  /** Click handler */
  onClick?: () => void
  /** Button content */
  children?: Child
}

/**
 * Action button for the toast.
 * Uses ToastContext to auto-dismiss after action.
 *
 * @param props.altText - Accessible description
 * @param props.onClick - Click handler
 */
function ToastAction(props: ToastActionProps) {
  const handleMount = (el: HTMLElement) => {
    const ctx = useContext(ToastContext)

    el.addEventListener('click', () => {
      props.onClick?.()
      ctx.dismiss()
    })
  }

  return (
    <button
      data-slot="toast-action"
      id={props.id}
      type="button"
      aria-label={props.altText}
      className={`${toastActionClasses} ${props.className ?? ''}`}
      ref={handleMount}
    >
      {props.children}
    </button>
  )
}

export { ToastProvider, Toast, ToastTitle, ToastDescription, ToastClose, ToastAction }
export type { ToastVariant, ToastPosition, ToastProviderProps, ToastProps, ToastTitleProps, ToastDescriptionProps, ToastCloseProps, ToastActionProps }
