/** @jsxImportSource hono/jsx */
import { createContext, useContext, createEffect, createPortal, isSSRPortal, provideContextSSR } from '@barefootjs/hono/client-shim'
import type { ButtonHTMLAttributes, HTMLBaseAttributes } from '@barefootjs/jsx'
import type { Child } from '../../../types'

const DialogContext = createContext<DialogContextValue>()

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
interface DialogTriggerProps extends ButtonHTMLAttributes {
  /** Whether disabled */
  disabled?: boolean
  /**
   * Render the child element as the trigger instead of DialogTrigger's own `<button>`.
   * Required whenever `children` is itself an interactive element (e.g. `<Button>`) —
   * without it, DialogTrigger renders its own `<button>` around the child, the HTML
   * parser auto-closes the nested `<button>`, and the dialog silently never opens.
   */
  asChild?: boolean
  /** Button content */
  children?: Child
}
interface DialogOverlayProps extends HTMLBaseAttributes {
}
interface DialogContentProps extends HTMLBaseAttributes {
  /** Dialog content */
  children?: Child
  /** ID of the title element for aria-labelledby */
  ariaLabelledby?: string
  /** ID of the description element for aria-describedby */
  ariaDescribedby?: string
}
interface DialogHeaderProps extends HTMLBaseAttributes {
  /** Header content (typically DialogTitle and DialogDescription) */
  children?: Child
}
interface DialogTitleProps extends HTMLBaseAttributes {
  /** ID for aria-labelledby reference */
  id?: string
  /** Title text */
  children?: Child
}
interface DialogDescriptionProps extends HTMLBaseAttributes {
  /** ID for aria-describedby reference */
  id?: string
  /** Description text */
  children?: Child
}
interface DialogFooterProps extends HTMLBaseAttributes {
  /** Footer content (typically action buttons) */
  children?: Child
}
interface DialogCloseProps extends ButtonHTMLAttributes {
  /** Button content */
  children?: Child
}

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
interface DialogTriggerProps extends ButtonHTMLAttributes {
  /** Whether disabled */
  disabled?: boolean
  /**
   * Render the child element as the trigger instead of DialogTrigger's own `<button>`.
   * Required whenever `children` is itself an interactive element (e.g. `<Button>`) —
   * without it, DialogTrigger renders its own `<button>` around the child, the HTML
   * parser auto-closes the nested `<button>`, and the dialog silently never opens.
   */
  asChild?: boolean
  /** Button content */
  children?: Child
}
interface DialogOverlayProps extends HTMLBaseAttributes {
}
interface DialogContentProps extends HTMLBaseAttributes {
  /** Dialog content */
  children?: Child
  /** ID of the title element for aria-labelledby */
  ariaLabelledby?: string
  /** ID of the description element for aria-describedby */
  ariaDescribedby?: string
}
interface DialogHeaderProps extends HTMLBaseAttributes {
  /** Header content (typically DialogTitle and DialogDescription) */
  children?: Child
}
interface DialogTitleProps extends HTMLBaseAttributes {
  /** ID for aria-labelledby reference */
  id?: string
  /** Title text */
  children?: Child
}
interface DialogDescriptionProps extends HTMLBaseAttributes {
  /** ID for aria-describedby reference */
  id?: string
  /** Description text */
  children?: Child
}
interface DialogFooterProps extends HTMLBaseAttributes {
  /** Footer content (typically action buttons) */
  children?: Child
}
interface DialogCloseProps extends ButtonHTMLAttributes {
  /** Button content */
  children?: Child
}

type DialogHeaderPropsWithHydration = DialogHeaderProps & {
  __instanceId?: string
  __bfScope?: string
  __bfChild?: boolean
  __bfParentProps?: string
  __bfParent?: string
  __bfMount?: string
  "data-key"?: string | number
}

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
interface DialogTriggerProps extends ButtonHTMLAttributes {
  /** Whether disabled */
  disabled?: boolean
  /**
   * Render the child element as the trigger instead of DialogTrigger's own `<button>`.
   * Required whenever `children` is itself an interactive element (e.g. `<Button>`) —
   * without it, DialogTrigger renders its own `<button>` around the child, the HTML
   * parser auto-closes the nested `<button>`, and the dialog silently never opens.
   */
  asChild?: boolean
  /** Button content */
  children?: Child
}
interface DialogOverlayProps extends HTMLBaseAttributes {
}
interface DialogContentProps extends HTMLBaseAttributes {
  /** Dialog content */
  children?: Child
  /** ID of the title element for aria-labelledby */
  ariaLabelledby?: string
  /** ID of the description element for aria-describedby */
  ariaDescribedby?: string
}
interface DialogHeaderProps extends HTMLBaseAttributes {
  /** Header content (typically DialogTitle and DialogDescription) */
  children?: Child
}
interface DialogTitleProps extends HTMLBaseAttributes {
  /** ID for aria-labelledby reference */
  id?: string
  /** Title text */
  children?: Child
}
interface DialogDescriptionProps extends HTMLBaseAttributes {
  /** ID for aria-describedby reference */
  id?: string
  /** Description text */
  children?: Child
}
interface DialogFooterProps extends HTMLBaseAttributes {
  /** Footer content (typically action buttons) */
  children?: Child
}
interface DialogCloseProps extends ButtonHTMLAttributes {
  /** Button content */
  children?: Child
}

type DialogTitlePropsWithHydration = DialogTitleProps & {
  __instanceId?: string
  __bfScope?: string
  __bfChild?: boolean
  __bfParentProps?: string
  __bfParent?: string
  __bfMount?: string
  "data-key"?: string | number
}

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
interface DialogTriggerProps extends ButtonHTMLAttributes {
  /** Whether disabled */
  disabled?: boolean
  /**
   * Render the child element as the trigger instead of DialogTrigger's own `<button>`.
   * Required whenever `children` is itself an interactive element (e.g. `<Button>`) —
   * without it, DialogTrigger renders its own `<button>` around the child, the HTML
   * parser auto-closes the nested `<button>`, and the dialog silently never opens.
   */
  asChild?: boolean
  /** Button content */
  children?: Child
}
interface DialogOverlayProps extends HTMLBaseAttributes {
}
interface DialogContentProps extends HTMLBaseAttributes {
  /** Dialog content */
  children?: Child
  /** ID of the title element for aria-labelledby */
  ariaLabelledby?: string
  /** ID of the description element for aria-describedby */
  ariaDescribedby?: string
}
interface DialogHeaderProps extends HTMLBaseAttributes {
  /** Header content (typically DialogTitle and DialogDescription) */
  children?: Child
}
interface DialogTitleProps extends HTMLBaseAttributes {
  /** ID for aria-labelledby reference */
  id?: string
  /** Title text */
  children?: Child
}
interface DialogDescriptionProps extends HTMLBaseAttributes {
  /** ID for aria-describedby reference */
  id?: string
  /** Description text */
  children?: Child
}
interface DialogFooterProps extends HTMLBaseAttributes {
  /** Footer content (typically action buttons) */
  children?: Child
}
interface DialogCloseProps extends ButtonHTMLAttributes {
  /** Button content */
  children?: Child
}

type DialogDescriptionPropsWithHydration = DialogDescriptionProps & {
  __instanceId?: string
  __bfScope?: string
  __bfChild?: boolean
  __bfParentProps?: string
  __bfParent?: string
  __bfMount?: string
  "data-key"?: string | number
}

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
interface DialogTriggerProps extends ButtonHTMLAttributes {
  /** Whether disabled */
  disabled?: boolean
  /**
   * Render the child element as the trigger instead of DialogTrigger's own `<button>`.
   * Required whenever `children` is itself an interactive element (e.g. `<Button>`) —
   * without it, DialogTrigger renders its own `<button>` around the child, the HTML
   * parser auto-closes the nested `<button>`, and the dialog silently never opens.
   */
  asChild?: boolean
  /** Button content */
  children?: Child
}
interface DialogOverlayProps extends HTMLBaseAttributes {
}
interface DialogContentProps extends HTMLBaseAttributes {
  /** Dialog content */
  children?: Child
  /** ID of the title element for aria-labelledby */
  ariaLabelledby?: string
  /** ID of the description element for aria-describedby */
  ariaDescribedby?: string
}
interface DialogHeaderProps extends HTMLBaseAttributes {
  /** Header content (typically DialogTitle and DialogDescription) */
  children?: Child
}
interface DialogTitleProps extends HTMLBaseAttributes {
  /** ID for aria-labelledby reference */
  id?: string
  /** Title text */
  children?: Child
}
interface DialogDescriptionProps extends HTMLBaseAttributes {
  /** ID for aria-describedby reference */
  id?: string
  /** Description text */
  children?: Child
}
interface DialogFooterProps extends HTMLBaseAttributes {
  /** Footer content (typically action buttons) */
  children?: Child
}
interface DialogCloseProps extends ButtonHTMLAttributes {
  /** Button content */
  children?: Child
}

type DialogFooterPropsWithHydration = DialogFooterProps & {
  __instanceId?: string
  __bfScope?: string
  __bfChild?: boolean
  __bfParentProps?: string
  __bfParent?: string
  __bfMount?: string
  "data-key"?: string | number
}

export type { DialogProps, DialogTriggerProps, DialogOverlayProps, DialogContentProps, DialogHeaderProps, DialogTitleProps, DialogDescriptionProps, DialogFooterProps, DialogCloseProps }
export const DialogRoot = Dialog

export function Dialog(__allProps: DialogProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `Dialog_${Math.random().toString(36).slice(2, 8)}`

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.open !== 'function' && !(typeof props.open === 'object' && props.open !== null && 'isEscaped' in props.open)) __hydrateProps['open'] = props.open
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div style="display:contents" bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})}><>{provideContextSSR(DialogContext, {
      open: () => props.open ?? false,
      onOpenChange: props.onOpenChange ?? (() => {}),
    }, <>{props.children}</>)}</></div>
  )
}

export function DialogTrigger(__allProps: DialogTriggerProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `DialogTrigger_${Math.random().toString(36).slice(2, 8)}`
  const dialogTriggerClasses = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40 aria-[invalid]:border-destructive touch-action-manipulation bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2 has-[>svg]:px-3'

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.disabled !== 'function' && !(typeof props.disabled === 'object' && props.disabled !== null && 'isEscaped' in props.disabled)) __hydrateProps['disabled'] = props.disabled
  if (typeof props.asChild !== 'function' && !(typeof props.asChild === 'object' && props.asChild !== null && 'isEscaped' in props.asChild)) __hydrateProps['asChild'] = props.asChild
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  if (props.asChild) {
    return (
      <span data-slot="dialog-trigger" style="display:contents" bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s1">{props.children}</span>
    )
  }
  return (
    <button data-slot="dialog-trigger" type="button" id={props.id} className={`${dialogTriggerClasses} ${props.className ?? ''}`} disabled={(props.disabled ?? false) || undefined} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{props.children}</button>
  )
}

export function DialogOverlay(__allProps: DialogOverlayProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps: _bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `DialogOverlay_${Math.random().toString(36).slice(2, 8)}`
  const dialogOverlayBaseClasses = 'fixed inset-0 z-50 bg-black/80 transition-opacity duration-200'
  const dialogOverlayClosedClasses = 'opacity-0 pointer-events-none'

  return (
    <div data-slot="dialog-overlay" data-state="closed" id={props.id} className={`${dialogOverlayBaseClasses} ${dialogOverlayClosedClasses} ${props.className ?? ''}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0" />
  )
}

export function DialogContent(__allProps: DialogContentProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `DialogContent_${Math.random().toString(36).slice(2, 8)}`
  const dialogContentBaseClasses = 'fixed left-[50%] top-[50%] z-50 flex flex-col w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 sm:rounded-lg'
  const dialogContentClosedClasses = 'opacity-0 scale-95 pointer-events-none'

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  if (typeof props.ariaLabelledby !== 'function' && !(typeof props.ariaLabelledby === 'object' && props.ariaLabelledby !== null && 'isEscaped' in props.ariaLabelledby)) __hydrateProps['ariaLabelledby'] = props.ariaLabelledby
  if (typeof props.ariaDescribedby !== 'function' && !(typeof props.ariaDescribedby === 'object' && props.ariaDescribedby !== null && 'isEscaped' in props.ariaDescribedby)) __hydrateProps['ariaDescribedby'] = props.ariaDescribedby
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="dialog-content" data-state="closed" role="dialog" aria-modal="true" aria-labelledby={props.ariaLabelledby} aria-describedby={props.ariaDescribedby} tabindex={-1} id={props.id} className={`${dialogContentBaseClasses} ${dialogContentClosedClasses} ${props.className ?? ''}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{props.children}</div>
  )
}

export function DialogHeader({ className = '', children, __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props }: DialogHeaderPropsWithHydration = {} as DialogHeaderPropsWithHydration) {
  const __scopeId = __instanceId || `DialogHeader_${Math.random().toString(36).slice(2, 8)}`
  const dialogHeaderClasses = 'flex flex-col gap-2 text-center sm:text-left'

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof className !== 'function' && !(typeof className === 'object' && className !== null && 'isEscaped' in className)) __hydrateProps['className'] = className
  if (typeof children !== 'function' && !(typeof children === 'object' && children !== null && 'isEscaped' in children)) __hydrateProps['children'] = children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="dialog-header" className={`${dialogHeaderClasses} ${className}`} {...props} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{children}</div>
  )
}

export function DialogTitle({ className = '', id, children, __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props }: DialogTitlePropsWithHydration = {} as DialogTitlePropsWithHydration) {
  const __scopeId = __instanceId || `DialogTitle_${Math.random().toString(36).slice(2, 8)}`
  const dialogTitleClasses = 'text-lg leading-none font-semibold'

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof className !== 'function' && !(typeof className === 'object' && className !== null && 'isEscaped' in className)) __hydrateProps['className'] = className
  if (typeof id !== 'function' && !(typeof id === 'object' && id !== null && 'isEscaped' in id)) __hydrateProps['id'] = id
  if (typeof children !== 'function' && !(typeof children === 'object' && children !== null && 'isEscaped' in children)) __hydrateProps['children'] = children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <h2 data-slot="dialog-title" id={id} className={`${dialogTitleClasses} ${className}`} {...props} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{children}</h2>
  )
}

export function DialogDescription({ className = '', id, children, __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props }: DialogDescriptionPropsWithHydration = {} as DialogDescriptionPropsWithHydration) {
  const __scopeId = __instanceId || `DialogDescription_${Math.random().toString(36).slice(2, 8)}`
  const dialogDescriptionClasses = 'text-muted-foreground text-sm'

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof className !== 'function' && !(typeof className === 'object' && className !== null && 'isEscaped' in className)) __hydrateProps['className'] = className
  if (typeof id !== 'function' && !(typeof id === 'object' && id !== null && 'isEscaped' in id)) __hydrateProps['id'] = id
  if (typeof children !== 'function' && !(typeof children === 'object' && children !== null && 'isEscaped' in children)) __hydrateProps['children'] = children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <p data-slot="dialog-description" id={id} className={`${dialogDescriptionClasses} ${className}`} {...props} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{children}</p>
  )
}

export function DialogFooter({ className = '', children, __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props }: DialogFooterPropsWithHydration = {} as DialogFooterPropsWithHydration) {
  const __scopeId = __instanceId || `DialogFooter_${Math.random().toString(36).slice(2, 8)}`
  const dialogFooterClasses = 'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof className !== 'function' && !(typeof className === 'object' && className !== null && 'isEscaped' in className)) __hydrateProps['className'] = className
  if (typeof children !== 'function' && !(typeof children === 'object' && children !== null && 'isEscaped' in children)) __hydrateProps['children'] = children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="dialog-footer" className={`${dialogFooterClasses} ${className}`} {...props} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{children}</div>
  )
}

export function DialogClose(__allProps: DialogCloseProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `DialogClose_${Math.random().toString(36).slice(2, 8)}`
  const dialogCloseClasses = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40 aria-[invalid]:border-destructive touch-action-manipulation border bg-background text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 h-9 px-4 py-2 has-[>svg]:px-3'

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <button data-slot="dialog-close" type="button" id={props.id} className={`${dialogCloseClasses} ${props.className ?? ''}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{props.children}</button>
  )
}
