import { createContext, useContext, createEffect, createPortal, isSSRPortal, provideContextSSR } from '@barefootjs/hono/client-shim'
import type { HTMLBaseAttributes, ButtonHTMLAttributes } from '@barefootjs/jsx'
import type { Child } from '../../../types'

interface AlertDialogContextValue {
  open: () => boolean
  onOpenChange: (open: boolean) => void
}

const AlertDialogContext = createContext<AlertDialogContextValue>()

const alertDialogOverlayBaseClasses = 'fixed inset-0 z-50 bg-black/80 transition-opacity duration-200'

const alertDialogOverlayOpenClasses = 'opacity-100'

const alertDialogOverlayClosedClasses = 'opacity-0 pointer-events-none'

const alertDialogContentBaseClasses = 'fixed left-[50%] top-[50%] z-50 flex flex-col w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 sm:rounded-lg'

const alertDialogContentOpenClasses = 'opacity-100 scale-100'

const alertDialogContentClosedClasses = 'opacity-0 scale-95 pointer-events-none'

const alertDialogHeaderClasses = 'flex flex-col gap-2 text-center sm:text-left'

const alertDialogTitleClasses = 'text-lg leading-none font-semibold'

const alertDialogDescriptionClasses = 'text-muted-foreground text-sm'

const alertDialogFooterClasses = 'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'

const alertDialogTriggerClasses = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40 aria-[invalid]:border-destructive touch-action-manipulation bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2 has-[>svg]:px-3'

const alertDialogCancelClasses = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40 aria-[invalid]:border-destructive touch-action-manipulation border border-input bg-background text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:hover:bg-input/50 h-9 px-4 py-2 has-[>svg]:px-3'

const alertDialogActionClasses = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40 aria-[invalid]:border-destructive touch-action-manipulation bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2 has-[>svg]:px-3'

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

interface AlertDialogOverlayProps extends HTMLBaseAttributes {
}

interface AlertDialogContentProps extends HTMLBaseAttributes {
  /** AlertDialog content */
  children?: Child
  /** ID of the title element for aria-labelledby */
  ariaLabelledby?: string
  /** ID of the description element for aria-describedby */
  ariaDescribedby?: string
}

interface AlertDialogHeaderProps extends HTMLBaseAttributes {
  /** Header content */
  children?: Child
}

interface AlertDialogTitleProps extends HTMLBaseAttributes {
  /** Title text */
  children?: Child
}

interface AlertDialogDescriptionProps extends HTMLBaseAttributes {
  /** Description text */
  children?: Child
}

interface AlertDialogFooterProps extends HTMLBaseAttributes {
  /** Footer content */
  children?: Child
}

interface AlertDialogCancelProps extends ButtonHTMLAttributes {
  /** Button content */
  children?: Child
}

interface AlertDialogActionProps extends ButtonHTMLAttributes {
  /** Button content */
  children?: Child
  /** Click handler for the action */
  onClick?: () => void
}

type AlertDialogHeaderPropsWithHydration = AlertDialogHeaderProps & {
  __instanceId?: string
  __bfScope?: string
  __bfChild?: boolean
  __bfParentProps?: string
  __bfParent?: string
  __bfMount?: string
  "data-key"?: string | number
}

type AlertDialogTitlePropsWithHydration = AlertDialogTitleProps & {
  __instanceId?: string
  __bfScope?: string
  __bfChild?: boolean
  __bfParentProps?: string
  __bfParent?: string
  __bfMount?: string
  "data-key"?: string | number
}

type AlertDialogDescriptionPropsWithHydration = AlertDialogDescriptionProps & {
  __instanceId?: string
  __bfScope?: string
  __bfChild?: boolean
  __bfParentProps?: string
  __bfParent?: string
  __bfMount?: string
  "data-key"?: string | number
}

type AlertDialogFooterPropsWithHydration = AlertDialogFooterProps & {
  __instanceId?: string
  __bfScope?: string
  __bfChild?: boolean
  __bfParentProps?: string
  __bfParent?: string
  __bfMount?: string
  "data-key"?: string | number
}

export type { AlertDialogProps, AlertDialogTriggerProps, AlertDialogOverlayProps, AlertDialogContentProps, AlertDialogHeaderProps, AlertDialogTitleProps, AlertDialogDescriptionProps, AlertDialogFooterProps, AlertDialogCancelProps, AlertDialogActionProps }

export function AlertDialog(__allProps: AlertDialogProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `AlertDialog_${Math.random().toString(36).slice(2, 8)}`

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.open !== 'function' && !(typeof props.open === 'object' && props.open !== null && 'isEscaped' in props.open)) __hydrateProps['open'] = props.open
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div style="display:contents" bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})}><>{provideContextSSR(AlertDialogContext, {
      open: () => props.open ?? false,
      onOpenChange: props.onOpenChange ?? (() => {}),
    }, <>{props.children}</>)}</></div>
  )
}

export function AlertDialogTrigger(__allProps: AlertDialogTriggerProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `AlertDialogTrigger_${Math.random().toString(36).slice(2, 8)}`
  const alertDialogTriggerClasses = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40 aria-[invalid]:border-destructive touch-action-manipulation bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2 has-[>svg]:px-3'

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.disabled !== 'function' && !(typeof props.disabled === 'object' && props.disabled !== null && 'isEscaped' in props.disabled)) __hydrateProps['disabled'] = props.disabled
  if (typeof props.asChild !== 'function' && !(typeof props.asChild === 'object' && props.asChild !== null && 'isEscaped' in props.asChild)) __hydrateProps['asChild'] = props.asChild
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  if (props.asChild) {
    return (
      <span data-slot="alert-dialog-trigger" style="display:contents" bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s1">{props.children}</span>
    )
  }
  return (
    <button data-slot="alert-dialog-trigger" type="button" id={props.id} className={`${alertDialogTriggerClasses} ${props.className ?? ''}`} disabled={(props.disabled ?? false) || undefined} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{props.children}</button>
  )
}

export function AlertDialogOverlay(__allProps: AlertDialogOverlayProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps: _bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `AlertDialogOverlay_${Math.random().toString(36).slice(2, 8)}`

  return (
    <div data-slot="alert-dialog-overlay" data-state="closed" id={props.id} className={`${alertDialogOverlayBaseClasses} ${alertDialogOverlayClosedClasses} ${props.className ?? ''}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0" />
  )
}

export function AlertDialogContent(__allProps: AlertDialogContentProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `AlertDialogContent_${Math.random().toString(36).slice(2, 8)}`

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  if (typeof props.ariaLabelledby !== 'function' && !(typeof props.ariaLabelledby === 'object' && props.ariaLabelledby !== null && 'isEscaped' in props.ariaLabelledby)) __hydrateProps['ariaLabelledby'] = props.ariaLabelledby
  if (typeof props.ariaDescribedby !== 'function' && !(typeof props.ariaDescribedby === 'object' && props.ariaDescribedby !== null && 'isEscaped' in props.ariaDescribedby)) __hydrateProps['ariaDescribedby'] = props.ariaDescribedby
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="alert-dialog-content" data-state="closed" role="alertdialog" aria-modal="true" aria-labelledby={props.ariaLabelledby} aria-describedby={props.ariaDescribedby} tabindex={-1} id={props.id} className={`${alertDialogContentBaseClasses} ${alertDialogContentClosedClasses} ${props.className ?? ''}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{props.children}</div>
  )
}

export function AlertDialogHeader({ className = '', children, __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props }: AlertDialogHeaderPropsWithHydration = {} as AlertDialogHeaderPropsWithHydration) {
  const __scopeId = __instanceId || `AlertDialogHeader_${Math.random().toString(36).slice(2, 8)}`

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof className !== 'function' && !(typeof className === 'object' && className !== null && 'isEscaped' in className)) __hydrateProps['className'] = className
  if (typeof children !== 'function' && !(typeof children === 'object' && children !== null && 'isEscaped' in children)) __hydrateProps['children'] = children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="alert-dialog-header" className={`${alertDialogHeaderClasses} ${className}`} {...props} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{children}</div>
  )
}

export function AlertDialogTitle({ className = '', children, __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props }: AlertDialogTitlePropsWithHydration = {} as AlertDialogTitlePropsWithHydration) {
  const __scopeId = __instanceId || `AlertDialogTitle_${Math.random().toString(36).slice(2, 8)}`

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof className !== 'function' && !(typeof className === 'object' && className !== null && 'isEscaped' in className)) __hydrateProps['className'] = className
  if (typeof children !== 'function' && !(typeof children === 'object' && children !== null && 'isEscaped' in children)) __hydrateProps['children'] = children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <h2 data-slot="alert-dialog-title" className={`${alertDialogTitleClasses} ${className}`} {...props} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{children}</h2>
  )
}

export function AlertDialogDescription({ className = '', children, __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props }: AlertDialogDescriptionPropsWithHydration = {} as AlertDialogDescriptionPropsWithHydration) {
  const __scopeId = __instanceId || `AlertDialogDescription_${Math.random().toString(36).slice(2, 8)}`

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof className !== 'function' && !(typeof className === 'object' && className !== null && 'isEscaped' in className)) __hydrateProps['className'] = className
  if (typeof children !== 'function' && !(typeof children === 'object' && children !== null && 'isEscaped' in children)) __hydrateProps['children'] = children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <p data-slot="alert-dialog-description" className={`${alertDialogDescriptionClasses} ${className}`} {...props} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{children}</p>
  )
}

export function AlertDialogFooter({ className = '', children, __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props }: AlertDialogFooterPropsWithHydration = {} as AlertDialogFooterPropsWithHydration) {
  const __scopeId = __instanceId || `AlertDialogFooter_${Math.random().toString(36).slice(2, 8)}`

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof className !== 'function' && !(typeof className === 'object' && className !== null && 'isEscaped' in className)) __hydrateProps['className'] = className
  if (typeof children !== 'function' && !(typeof children === 'object' && children !== null && 'isEscaped' in children)) __hydrateProps['children'] = children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="alert-dialog-footer" className={`${alertDialogFooterClasses} ${className}`} {...props} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{children}</div>
  )
}

export function AlertDialogCancel(__allProps: AlertDialogCancelProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `AlertDialogCancel_${Math.random().toString(36).slice(2, 8)}`

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <button data-slot="alert-dialog-cancel" type="button" id={props.id} className={`${alertDialogCancelClasses} ${props.className ?? ''}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{props.children}</button>
  )
}

export function AlertDialogAction(__allProps: AlertDialogActionProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `AlertDialogAction_${Math.random().toString(36).slice(2, 8)}`

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <button data-slot="alert-dialog-action" type="button" id={props.id} className={`${alertDialogActionClasses} ${props.className ?? ''}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{props.children}</button>
  )
}