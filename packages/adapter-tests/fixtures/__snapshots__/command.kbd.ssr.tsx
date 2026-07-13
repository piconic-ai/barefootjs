/** @jsxImportSource hono/jsx */
import type { HTMLBaseAttributes } from '@barefootjs/jsx'
import type { Child } from '../../../types'
import { Slot } from '../slot'

interface KbdProps extends HTMLBaseAttributes {
  /**
   * When true, renders child element with kbd styling instead of `<kbd>`.
   * Useful for custom elements with keyboard key appearance.
   * @default false
   */
  asChild?: boolean
  /**
   * Children to render inside the kbd element.
   */
  children?: Child
}
interface KbdGroupProps extends HTMLBaseAttributes {
  /**
   * When true, renders child element with group styling instead of `<kbd>`.
   * @default false
   */
  asChild?: boolean
  /**
   * Children to render inside the group.
   */
  children?: Child
}

type KbdPropsWithHydration = KbdProps & {
  __instanceId?: string
  __bfScope?: string
  __bfChild?: boolean
  __bfParentProps?: string
  __bfParent?: string
  __bfMount?: string
  "data-key"?: string | number
}

interface KbdProps extends HTMLBaseAttributes {
  /**
   * When true, renders child element with kbd styling instead of `<kbd>`.
   * Useful for custom elements with keyboard key appearance.
   * @default false
   */
  asChild?: boolean
  /**
   * Children to render inside the kbd element.
   */
  children?: Child
}
interface KbdGroupProps extends HTMLBaseAttributes {
  /**
   * When true, renders child element with group styling instead of `<kbd>`.
   * @default false
   */
  asChild?: boolean
  /**
   * Children to render inside the group.
   */
  children?: Child
}

type KbdGroupPropsWithHydration = KbdGroupProps & {
  __instanceId?: string
  __bfScope?: string
  __bfChild?: boolean
  __bfParentProps?: string
  __bfParent?: string
  __bfMount?: string
  "data-key"?: string | number
}

export type { KbdProps, KbdGroupProps }

export function Kbd({ className = '', asChild = false, children, __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props }: KbdPropsWithHydration = {} as KbdPropsWithHydration) {
  const __scopeId = __instanceId || `Kbd_${Math.random().toString(36).slice(2, 8)}`

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof className !== 'function' && !(typeof className === 'object' && className !== null && 'isEscaped' in className)) __hydrateProps['className'] = className
  if (typeof asChild !== 'function' && !(typeof asChild === 'object' && asChild !== null && 'isEscaped' in asChild)) __hydrateProps['asChild'] = asChild
  if (typeof children !== 'function' && !(typeof children === 'object' && children !== null && 'isEscaped' in children)) __hydrateProps['children'] = children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  if (asChild) {
    return (
      <Slot className={`pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm border bg-muted px-1 font-sans text-xs font-medium text-muted-foreground select-none [&_svg:not([class*=size-])]:size-3 ${className}`} {...props} __instanceId={`${__scopeId}_s1`} __bfParentProps={__bfPropsJson} __bfParent={__scopeId} __bfMount={'s1'} bf-s={__scopeId}>{children}</Slot>
    )
  }
  return (
    <kbd data-slot="kbd" className={`pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm border bg-muted px-1 font-sans text-xs font-medium text-muted-foreground select-none [&_svg:not([class*=size-])]:size-3 ${className}`} {...props} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{children}</kbd>
  )
}

export function KbdGroup({ className = '', asChild = false, children, __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props }: KbdGroupPropsWithHydration = {} as KbdGroupPropsWithHydration) {
  const __scopeId = __instanceId || `KbdGroup_${Math.random().toString(36).slice(2, 8)}`

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof className !== 'function' && !(typeof className === 'object' && className !== null && 'isEscaped' in className)) __hydrateProps['className'] = className
  if (typeof asChild !== 'function' && !(typeof asChild === 'object' && asChild !== null && 'isEscaped' in asChild)) __hydrateProps['asChild'] = asChild
  if (typeof children !== 'function' && !(typeof children === 'object' && children !== null && 'isEscaped' in children)) __hydrateProps['children'] = children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  if (asChild) {
    return (
      <Slot className={`inline-flex items-center gap-1 ${className}`} {...props} __instanceId={`${__scopeId}_s1`} __bfParentProps={__bfPropsJson} __bfParent={__scopeId} __bfMount={'s1'} bf-s={__scopeId}>{children}</Slot>
    )
  }
  return (
    <kbd data-slot="kbd-group" className={`inline-flex items-center gap-1 ${className}`} {...props} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{children}</kbd>
  )
}
