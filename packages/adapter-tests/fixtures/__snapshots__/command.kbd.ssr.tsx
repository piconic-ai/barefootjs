/** @jsxImportSource hono/jsx */
import { serializeHydrationProps } from '@barefootjs/hono/utils'
import type { HTMLBaseAttributes } from '@barefootjs/jsx'
import type { Child } from '../../../types'
import { Slot } from '../slot'

const kbdBaseClasses = 'pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm border bg-muted px-1 font-sans text-xs font-medium text-muted-foreground select-none [&_svg:not([class*=size-])]:size-3'

const kbdGroupBaseClasses = 'inline-flex items-center gap-1'

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

  // Serialize props for client hydration — ROOT MOUNTS ONLY (Move C, Prop
  // Boundary Contract). A child mount's __bfPropsJson is never read (bf-p is
  // only emitted when !__bfChild, see hydrationAttrs below) — children receive
  // props live via initChild(), so serialization is skipped entirely for a
  // child mount rather than computed and discarded. This also means a child
  // carrying an otherwise-unserializable prop (a Map, a live function) never
  // spuriously fails SSR: unreachable-ness is a RUNTIME fact (__bfChild), not
  // decidable at codegen time.
  let __bfPropsJson = __bfParentProps
  if (!__bfChild) {
    const __hydrateProps: Record<string, unknown> = {}
    if (!(typeof className === 'object' && className !== null && 'isEscaped' in className)) __hydrateProps['className'] = className
    if (!(typeof asChild === 'object' && asChild !== null && 'isEscaped' in asChild)) __hydrateProps['asChild'] = asChild
    if (!(typeof children === 'object' && children !== null && 'isEscaped' in children)) __hydrateProps['children'] = children
    __bfPropsJson = __bfParentProps || serializeHydrationProps(__hydrateProps, 'Kbd', {})
  }

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

  // Serialize props for client hydration — ROOT MOUNTS ONLY (Move C, Prop
  // Boundary Contract). A child mount's __bfPropsJson is never read (bf-p is
  // only emitted when !__bfChild, see hydrationAttrs below) — children receive
  // props live via initChild(), so serialization is skipped entirely for a
  // child mount rather than computed and discarded. This also means a child
  // carrying an otherwise-unserializable prop (a Map, a live function) never
  // spuriously fails SSR: unreachable-ness is a RUNTIME fact (__bfChild), not
  // decidable at codegen time.
  let __bfPropsJson = __bfParentProps
  if (!__bfChild) {
    const __hydrateProps: Record<string, unknown> = {}
    if (!(typeof className === 'object' && className !== null && 'isEscaped' in className)) __hydrateProps['className'] = className
    if (!(typeof asChild === 'object' && asChild !== null && 'isEscaped' in asChild)) __hydrateProps['asChild'] = asChild
    if (!(typeof children === 'object' && children !== null && 'isEscaped' in children)) __hydrateProps['children'] = children
    __bfPropsJson = __bfParentProps || serializeHydrationProps(__hydrateProps, 'KbdGroup', {})
  }

  if (asChild) {
    return (
      <Slot className={`inline-flex items-center gap-1 ${className}`} {...props} __instanceId={`${__scopeId}_s1`} __bfParentProps={__bfPropsJson} __bfParent={__scopeId} __bfMount={'s1'} bf-s={__scopeId}>{children}</Slot>
    )
  }
  return (
    <kbd data-slot="kbd-group" className={`inline-flex items-center gap-1 ${className}`} {...props} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{children}</kbd>
  )
}
