import type { HTMLBaseAttributes, ButtonHTMLAttributes } from '@barefootjs/jsx'
import { createContext, useContext, createSignal, createEffect, provideContextSSR } from '@barefootjs/hono/client-shim'
import type { Child } from '../../../types'

interface CollapsibleContextValue {
  open: () => boolean
  onOpenChange: (open: boolean) => void
  disabled: () => boolean
}

const CollapsibleContext = createContext<CollapsibleContextValue>()

const collapsibleContentBaseClasses = 'grid transition-[grid-template-rows,visibility] duration-normal ease-out'

const collapsibleContentOpenClasses = 'grid-rows-[1fr] visible'

const collapsibleContentClosedClasses = 'grid-rows-[0fr] invisible'

const collapsibleContentInnerClasses = 'overflow-hidden'

interface CollapsibleProps extends HTMLBaseAttributes {
  /** Controlled open state */
  open?: boolean
  /** Default open state for uncontrolled mode */
  defaultOpen?: boolean
  /** Callback when open state changes */
  onOpenChange?: (open: boolean) => void
  /** Whether the collapsible is disabled */
  disabled?: boolean
  /** Child components */
  children?: Child
}

interface CollapsibleTriggerProps extends ButtonHTMLAttributes {
  /** Render child element as trigger instead of built-in button */
  asChild?: boolean
  /** Trigger content */
  children?: Child
}

interface CollapsibleContentProps extends HTMLBaseAttributes {
  /** Whether the content is initially open (for SSR) */
  defaultOpen?: boolean
  /** Content to display */
  children?: Child
}

export type { CollapsibleProps, CollapsibleTriggerProps, CollapsibleContentProps }

export function Collapsible(__allProps: CollapsibleProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `Collapsible_${Math.random().toString(36).slice(2, 8)}`
  const internalOpen = () => props.defaultOpen ?? false
  const setInternalOpen = (..._args: any[]) => {}
  const isControlled = () => props.open !== undefined
  const open = () => isControlled() ? props.open! : internalOpen()
  const handleOpenChange = (value: boolean) => {
    if (props.disabled) return
    if (!isControlled()) {
      setInternalOpen(value)
    }
    props.onOpenChange?.(value)
  }

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.open !== 'function' && !(typeof props.open === 'object' && props.open !== null && 'isEscaped' in props.open)) __hydrateProps['open'] = props.open
  if (typeof props.defaultOpen !== 'function' && !(typeof props.defaultOpen === 'object' && props.defaultOpen !== null && 'isEscaped' in props.defaultOpen)) __hydrateProps['defaultOpen'] = props.defaultOpen
  if (typeof props.disabled !== 'function' && !(typeof props.disabled === 'object' && props.disabled !== null && 'isEscaped' in props.disabled)) __hydrateProps['disabled'] = props.disabled
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <>{provideContextSSR(CollapsibleContext, {
      open,
      onOpenChange: handleOpenChange,
      disabled: () => props.disabled ?? false,
    }, <><div id={props.id} data-slot="collapsible" data-state={`${props.defaultOpen ? 'open' : 'closed'}`} data-disabled={(props.disabled) || undefined} className={props.className ?? ''} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{props.children}</div></>)}</>
  )
}

export function CollapsibleTrigger(__allProps: CollapsibleTriggerProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `CollapsibleTrigger_${Math.random().toString(36).slice(2, 8)}`

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.asChild !== 'function' && !(typeof props.asChild === 'object' && props.asChild !== null && 'isEscaped' in props.asChild)) __hydrateProps['asChild'] = props.asChild
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  if (props.asChild) {
    return (
      <span data-slot="collapsible-trigger" style="display:contents" aria-expanded="false" bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s1">{props.children}</span>
    )
  }
  return (
    <button id={props.id} data-slot="collapsible-trigger" type="button" className={props.className ?? ''} aria-expanded="false" bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{props.children}</button>
  )
}

export function CollapsibleContent(__allProps: CollapsibleContentProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `CollapsibleContent_${Math.random().toString(36).slice(2, 8)}`
  const className = props.className ?? ''
  const initialOpen = props.defaultOpen ?? false

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.defaultOpen !== 'function' && !(typeof props.defaultOpen === 'object' && props.defaultOpen !== null && 'isEscaped' in props.defaultOpen)) __hydrateProps['defaultOpen'] = props.defaultOpen
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div id={props.id} data-slot="collapsible-content" role="region" data-state={`${initialOpen ? 'open' : 'closed'}`} className={`${collapsibleContentBaseClasses} ${initialOpen ? collapsibleContentOpenClasses : collapsibleContentClosedClasses}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0"><div className={`overflow-hidden`}><div className={className}>{props.children}</div></div></div>
  )
}