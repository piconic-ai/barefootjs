/** @jsxImportSource hono/jsx */
import { createContext, useContext, createEffect, createPortal, isSSRPortal, findSiblingSlot, provideContextSSR } from '@barefootjs/hono/client-shim'
import type { ButtonHTMLAttributes, HTMLBaseAttributes } from '@barefootjs/jsx'
import type { Child } from '../../../types'

const PopoverContext = createContext<PopoverContextValue>()

interface PopoverProps extends HTMLBaseAttributes {
  /** Whether the popover is open */
  open?: boolean
  /** Callback when open state should change */
  onOpenChange?: (open: boolean) => void
  /** PopoverTrigger and PopoverContent */
  children?: Child
}
interface PopoverTriggerProps extends ButtonHTMLAttributes {
  /** Whether disabled */
  disabled?: boolean
  /** Render child element as trigger instead of built-in button */
  asChild?: boolean
  /** Trigger content */
  children?: Child
}
interface PopoverContentProps extends HTMLBaseAttributes {
  /** Popover content */
  children?: Child
  /** Alignment relative to trigger */
  align?: 'start' | 'center' | 'end'
  /** Side relative to trigger */
  side?: 'top' | 'bottom'
}
interface PopoverCloseProps extends ButtonHTMLAttributes {
  /** Button content */
  children?: Child
}

export type { PopoverProps, PopoverTriggerProps, PopoverContentProps, PopoverCloseProps }

export function Popover(__allProps: PopoverProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `Popover_${Math.random().toString(36).slice(2, 8)}`
  const popoverClasses = 'relative inline-block'

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.open !== 'function' && !(typeof props.open === 'object' && props.open !== null && 'isEscaped' in props.open)) __hydrateProps['open'] = props.open
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <>{provideContextSSR(PopoverContext, {
      open: () => props.open ?? false,
      onOpenChange: props.onOpenChange ?? (() => {}),
    }, <><div data-slot="popover" id={props.id} className={`${popoverClasses} ${props.className ?? ''}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})}>{props.children}</div></>)}</>
  )
}

export function PopoverTrigger(__allProps: PopoverTriggerProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `PopoverTrigger_${Math.random().toString(36).slice(2, 8)}`
  const popoverTriggerClasses = 'inline-flex items-center disabled:pointer-events-none disabled:opacity-50'

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.disabled !== 'function' && !(typeof props.disabled === 'object' && props.disabled !== null && 'isEscaped' in props.disabled)) __hydrateProps['disabled'] = props.disabled
  if (typeof props.asChild !== 'function' && !(typeof props.asChild === 'object' && props.asChild !== null && 'isEscaped' in props.asChild)) __hydrateProps['asChild'] = props.asChild
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  if (props.asChild) {
    return (
      <span data-slot="popover-trigger" aria-expanded="false" style="display:contents" bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s1">{props.children}</span>
    )
  }
  return (
    <button data-slot="popover-trigger" type="button" aria-expanded="false" id={props.id} disabled={(props.disabled ?? false) || undefined} className={`${popoverTriggerClasses} ${props.className ?? ''}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{props.children}</button>
  )
}

export function PopoverContent(__allProps: PopoverContentProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `PopoverContent_${Math.random().toString(36).slice(2, 8)}`
  const popoverContentBaseClasses = 'fixed z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-hidden transform-gpu origin-top transition-[opacity,transform] duration-normal ease-out'
  const popoverContentClosedClasses = 'opacity-0 scale-95 pointer-events-none'

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  if (typeof props.align !== 'function' && !(typeof props.align === 'object' && props.align !== null && 'isEscaped' in props.align)) __hydrateProps['align'] = props.align
  if (typeof props.side !== 'function' && !(typeof props.side === 'object' && props.side !== null && 'isEscaped' in props.side)) __hydrateProps['side'] = props.side
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="popover-content" data-state="closed" tabindex={-1} id={props.id} className={`${popoverContentBaseClasses} ${popoverContentClosedClasses} ${props.className ?? ''}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{props.children}</div>
  )
}

export function PopoverClose(__allProps: PopoverCloseProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `PopoverClose_${Math.random().toString(36).slice(2, 8)}`

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <button data-slot="popover-close" type="button" id={props.id} className={props.className ?? ''} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{props.children}</button>
  )
}
