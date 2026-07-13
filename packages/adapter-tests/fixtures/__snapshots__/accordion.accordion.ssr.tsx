/** @jsxImportSource hono/jsx */
import type { ButtonHTMLAttributes, HTMLBaseAttributes } from '@barefootjs/jsx'
import { createContext, useContext, createMemo, createEffect, provideContextSSR } from '@barefootjs/hono/client-shim'
import type { Child } from '../../../types'
import { ChevronDownIcon } from '../icon'

const AccordionItemContext = createContext<AccordionItemContextValue>()

interface AccordionProps extends HTMLBaseAttributes {
  /** AccordionItem components */
  children?: Child
}
interface AccordionItemProps extends HTMLBaseAttributes {
  /** Unique identifier for this item */
  value: string
  /** Whether this item is open */
  open?: boolean
  /** Whether this item is disabled */
  disabled?: boolean
  /** Callback when open state changes */
  onOpenChange?: (open: boolean) => void
  /** AccordionTrigger and AccordionContent */
  children?: Child
}
interface AccordionTriggerProps extends ButtonHTMLAttributes {
  /** Whether disabled */
  disabled?: boolean
  /** Render child element as trigger instead of built-in button */
  asChild?: boolean
  /** Trigger label */
  children?: Child
}
interface AccordionContentProps extends HTMLBaseAttributes {
  /** Content to display */
  children?: Child
}

type AccordionPropsWithHydration = AccordionProps & {
  __instanceId?: string
  __bfScope?: string
  __bfChild?: boolean
  __bfParentProps?: string
  __bfParent?: string
  __bfMount?: string
  "data-key"?: string | number
}

interface AccordionProps extends HTMLBaseAttributes {
  /** AccordionItem components */
  children?: Child
}
interface AccordionItemProps extends HTMLBaseAttributes {
  /** Unique identifier for this item */
  value: string
  /** Whether this item is open */
  open?: boolean
  /** Whether this item is disabled */
  disabled?: boolean
  /** Callback when open state changes */
  onOpenChange?: (open: boolean) => void
  /** AccordionTrigger and AccordionContent */
  children?: Child
}
interface AccordionTriggerProps extends ButtonHTMLAttributes {
  /** Whether disabled */
  disabled?: boolean
  /** Render child element as trigger instead of built-in button */
  asChild?: boolean
  /** Trigger label */
  children?: Child
}
interface AccordionContentProps extends HTMLBaseAttributes {
  /** Content to display */
  children?: Child
}

export type { AccordionProps, AccordionItemProps, AccordionTriggerProps, AccordionContentProps }

export function Accordion({ children, className = '', __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props }: AccordionPropsWithHydration = {} as AccordionPropsWithHydration) {
  const __scopeId = __instanceId || `Accordion_${Math.random().toString(36).slice(2, 8)}`
  const accordionClasses = 'w-full'

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof children !== 'function' && !(typeof children === 'object' && children !== null && 'isEscaped' in children)) __hydrateProps['children'] = children
  if (typeof className !== 'function' && !(typeof className === 'object' && className !== null && 'isEscaped' in className)) __hydrateProps['className'] = className
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="accordion" className={`${accordionClasses} ${className}`} {...props} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{children}</div>
  )
}

export function AccordionItem(__allProps: AccordionItemProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `AccordionItem_${Math.random().toString(36).slice(2, 8)}`
  const accordionItemClasses = 'border-b last:border-b-0'

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.value !== 'function' && !(typeof props.value === 'object' && props.value !== null && 'isEscaped' in props.value)) __hydrateProps['value'] = props.value
  if (typeof props.open !== 'function' && !(typeof props.open === 'object' && props.open !== null && 'isEscaped' in props.open)) __hydrateProps['open'] = props.open
  if (typeof props.disabled !== 'function' && !(typeof props.disabled === 'object' && props.disabled !== null && 'isEscaped' in props.disabled)) __hydrateProps['disabled'] = props.disabled
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <>{provideContextSSR(AccordionItemContext, {
      open: () => props.open ?? false,
      onOpenChange: props.onOpenChange ?? (() => {}),
    }, <><div data-slot="accordion-item" id={props.id} data-state={`${props.open ? 'open' : 'closed'}`} data-value={props.value} className={`${accordionItemClasses} ${props.className ?? ''}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{props.children}</div></>)}</>
  )
}

export function AccordionTrigger(__allProps: AccordionTriggerProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `AccordionTrigger_${Math.random().toString(36).slice(2, 8)}`
  const className = props.className ?? ''

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.disabled !== 'function' && !(typeof props.disabled === 'object' && props.disabled !== null && 'isEscaped' in props.disabled)) __hydrateProps['disabled'] = props.disabled
  if (typeof props.asChild !== 'function' && !(typeof props.asChild === 'object' && props.asChild !== null && 'isEscaped' in props.asChild)) __hydrateProps['asChild'] = props.asChild
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  if (props.asChild) {
    return (
      <h3 className="flex" bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})}><span data-slot="accordion-trigger" style="display:contents" aria-expanded="false" bf="s2">{props.children}</span></h3>
    )
  }
  return (
    <h3 className="flex" bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})}><button data-slot="accordion-trigger" id={props.id} className={`flex flex-1 items-start justify-between gap-4 rounded-md py-4 text-left text-sm font-medium transition-all outline-none hover:underline disabled:pointer-events-none disabled:opacity-50 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] ${className}`} disabled={(props.disabled) || undefined} aria-expanded="false" aria-disabled={(props.disabled) || undefined} bf="s1">{props.children}<ChevronDownIcon size="sm" className={`text-muted-foreground pointer-events-none shrink-0 translate-y-0.5 transition-transform duration-normal`} __instanceId={`${__scopeId}_s0`} __bfChild={true} __bfParent={__scopeId} __bfMount={'s0'} /></button></h3>
  )
}

export function AccordionContent(__allProps: AccordionContentProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `AccordionContent_${Math.random().toString(36).slice(2, 8)}`
  const className = () => props.className ?? ''
  const accordionContentBaseClasses = 'grid transition-[grid-template-rows,visibility] duration-normal ease-out'
  const accordionContentClosedClasses = 'grid-rows-[0fr] invisible'

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="accordion-content" id={props.id} role="region" data-state="closed" className={`${accordionContentBaseClasses} ${accordionContentClosedClasses}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s1"><div className={`overflow-hidden text-sm`}><div className={`pt-0 pb-4 ${className()}`} bf="s0">{props.children}</div></div></div>
  )
}
