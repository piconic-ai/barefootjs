import type { AnchorHTMLAttributes, HTMLBaseAttributes } from '@barefootjs/jsx'
import type { Child } from '../../../types'
import { Slot } from '../slot'
import { ChevronRightIcon, EllipsisIcon } from '../icon'

const breadcrumbListClasses = 'text-muted-foreground flex flex-wrap items-center gap-1.5 text-sm break-words'

const breadcrumbItemClasses = 'inline-flex items-center gap-1'

const breadcrumbLinkClasses = 'hover:text-foreground transition-colors'

const breadcrumbPageClasses = 'text-foreground font-normal'

const breadcrumbSeparatorClasses = 'flex items-center [&>svg]:size-3.5'

const breadcrumbEllipsisClasses = 'flex size-5 items-center justify-center [&>svg]:size-4'

interface BreadcrumbProps extends HTMLBaseAttributes {
  /** Breadcrumb content (typically BreadcrumbList) */
  children?: Child
}

interface BreadcrumbListProps extends HTMLBaseAttributes {
  /** List items */
  children?: Child
}

interface BreadcrumbItemProps extends HTMLBaseAttributes {
  /** Item content */
  children?: Child
}

interface BreadcrumbLinkProps extends AnchorHTMLAttributes {
  /** When true, renders child element with link styling instead of `<a>`. */
  asChild?: boolean
  /** Link content */
  children?: Child
}

interface BreadcrumbPageProps extends HTMLBaseAttributes {
  /** Page title */
  children?: Child
}

interface BreadcrumbSeparatorProps extends HTMLBaseAttributes {
  /** Custom separator content. Defaults to ChevronRightIcon. */
  children?: Child
}

interface BreadcrumbEllipsisProps extends HTMLBaseAttributes {
}

type BreadcrumbPropsWithHydration = BreadcrumbProps & {
  __instanceId?: string
  __bfScope?: string
  __bfChild?: boolean
  __bfParentProps?: string
  __bfParent?: string
  __bfMount?: string
  "data-key"?: string | number
}

type BreadcrumbListPropsWithHydration = BreadcrumbListProps & {
  __instanceId?: string
  __bfScope?: string
  __bfChild?: boolean
  __bfParentProps?: string
  __bfParent?: string
  __bfMount?: string
  "data-key"?: string | number
}

type BreadcrumbItemPropsWithHydration = BreadcrumbItemProps & {
  __instanceId?: string
  __bfScope?: string
  __bfChild?: boolean
  __bfParentProps?: string
  __bfParent?: string
  __bfMount?: string
  "data-key"?: string | number
}

type BreadcrumbLinkPropsWithHydration = BreadcrumbLinkProps & {
  __instanceId?: string
  __bfScope?: string
  __bfChild?: boolean
  __bfParentProps?: string
  __bfParent?: string
  __bfMount?: string
  "data-key"?: string | number
}

type BreadcrumbPagePropsWithHydration = BreadcrumbPageProps & {
  __instanceId?: string
  __bfScope?: string
  __bfChild?: boolean
  __bfParentProps?: string
  __bfParent?: string
  __bfMount?: string
  "data-key"?: string | number
}

type BreadcrumbSeparatorPropsWithHydration = BreadcrumbSeparatorProps & {
  __instanceId?: string
  __bfScope?: string
  __bfChild?: boolean
  __bfParentProps?: string
  __bfParent?: string
  __bfMount?: string
  "data-key"?: string | number
}

type BreadcrumbEllipsisPropsWithHydration = BreadcrumbEllipsisProps & {
  __instanceId?: string
  __bfScope?: string
  __bfChild?: boolean
  __bfParentProps?: string
  __bfParent?: string
  __bfMount?: string
  "data-key"?: string | number
}

export type { BreadcrumbProps, BreadcrumbListProps, BreadcrumbItemProps, BreadcrumbLinkProps, BreadcrumbPageProps, BreadcrumbSeparatorProps, BreadcrumbEllipsisProps }

export function Breadcrumb({ children, className = '', __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props }: BreadcrumbPropsWithHydration = {} as BreadcrumbPropsWithHydration) {
  const __scopeId = __instanceId || `Breadcrumb_${Math.random().toString(36).slice(2, 8)}`

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof children !== 'function' && !(typeof children === 'object' && children !== null && 'isEscaped' in children)) __hydrateProps['children'] = children
  if (typeof className !== 'function' && !(typeof className === 'object' && className !== null && 'isEscaped' in className)) __hydrateProps['className'] = className
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <nav data-slot="breadcrumb" aria-label="breadcrumb" className={(className) || undefined} {...props} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{children}</nav>
  )
}

export function BreadcrumbList({ children, className = '', __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props }: BreadcrumbListPropsWithHydration = {} as BreadcrumbListPropsWithHydration) {
  const __scopeId = __instanceId || `BreadcrumbList_${Math.random().toString(36).slice(2, 8)}`

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof children !== 'function' && !(typeof children === 'object' && children !== null && 'isEscaped' in children)) __hydrateProps['children'] = children
  if (typeof className !== 'function' && !(typeof className === 'object' && className !== null && 'isEscaped' in className)) __hydrateProps['className'] = className
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <ol data-slot="breadcrumb-list" className={`${breadcrumbListClasses} ${className}`} {...props} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{children}</ol>
  )
}

export function BreadcrumbItem({ children, className = '', __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props }: BreadcrumbItemPropsWithHydration = {} as BreadcrumbItemPropsWithHydration) {
  const __scopeId = __instanceId || `BreadcrumbItem_${Math.random().toString(36).slice(2, 8)}`

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof children !== 'function' && !(typeof children === 'object' && children !== null && 'isEscaped' in children)) __hydrateProps['children'] = children
  if (typeof className !== 'function' && !(typeof className === 'object' && className !== null && 'isEscaped' in className)) __hydrateProps['className'] = className
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <li data-slot="breadcrumb-item" className={`${breadcrumbItemClasses} ${className}`} {...props} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{children}</li>
  )
}

export function BreadcrumbLink({ className = '', asChild = false, children, __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props }: BreadcrumbLinkPropsWithHydration = {} as BreadcrumbLinkPropsWithHydration) {
  const __scopeId = __instanceId || `BreadcrumbLink_${Math.random().toString(36).slice(2, 8)}`

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof className !== 'function' && !(typeof className === 'object' && className !== null && 'isEscaped' in className)) __hydrateProps['className'] = className
  if (typeof asChild !== 'function' && !(typeof asChild === 'object' && asChild !== null && 'isEscaped' in asChild)) __hydrateProps['asChild'] = asChild
  if (typeof children !== 'function' && !(typeof children === 'object' && children !== null && 'isEscaped' in children)) __hydrateProps['children'] = children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  if (asChild) {
    return (
      <Slot className={`hover:text-foreground transition-colors ${className}`} {...props} __instanceId={`${__scopeId}_s1`} __bfParentProps={__bfPropsJson} __bfParent={__scopeId} __bfMount={'s1'} bf-s={__scopeId}>{children}</Slot>
    )
  }
  return (
    <a data-slot="breadcrumb-link" className={`hover:text-foreground transition-colors ${className}`} {...props} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{children}</a>
  )
}

export function BreadcrumbPage({ children, className = '', __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props }: BreadcrumbPagePropsWithHydration = {} as BreadcrumbPagePropsWithHydration) {
  const __scopeId = __instanceId || `BreadcrumbPage_${Math.random().toString(36).slice(2, 8)}`

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof children !== 'function' && !(typeof children === 'object' && children !== null && 'isEscaped' in children)) __hydrateProps['children'] = children
  if (typeof className !== 'function' && !(typeof className === 'object' && className !== null && 'isEscaped' in className)) __hydrateProps['className'] = className
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <span data-slot="breadcrumb-page" role="link" aria-disabled="true" aria-current="page" className={`${breadcrumbPageClasses} ${className}`} {...props} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{children}</span>
  )
}

export function BreadcrumbSeparator({ children, className = '', __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props }: BreadcrumbSeparatorPropsWithHydration = {} as BreadcrumbSeparatorPropsWithHydration) {
  const __scopeId = __instanceId || `BreadcrumbSeparator_${Math.random().toString(36).slice(2, 8)}`

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof children !== 'function' && !(typeof children === 'object' && children !== null && 'isEscaped' in children)) __hydrateProps['children'] = children
  if (typeof className !== 'function' && !(typeof className === 'object' && className !== null && 'isEscaped' in className)) __hydrateProps['className'] = className
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <li data-slot="breadcrumb-separator" role="presentation" aria-hidden="true" className={`${breadcrumbSeparatorClasses} ${className}`} {...props} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s1">{children != null ? children : <ChevronRightIcon __instanceId={`${__scopeId}_s0`} __bfChild={true} __bfParent={__scopeId} __bfMount={'s0'} />}</li>
  )
}

export function BreadcrumbEllipsis({ className = '', __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props }: BreadcrumbEllipsisPropsWithHydration = {} as BreadcrumbEllipsisPropsWithHydration) {
  const __scopeId = __instanceId || `BreadcrumbEllipsis_${Math.random().toString(36).slice(2, 8)}`

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof className !== 'function' && !(typeof className === 'object' && className !== null && 'isEscaped' in className)) __hydrateProps['className'] = className
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <span data-slot="breadcrumb-ellipsis" role="presentation" aria-hidden="true" className={`${breadcrumbEllipsisClasses} ${className}`} {...props} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s1"><EllipsisIcon __instanceId={`${__scopeId}_s0`} __bfChild={true} __bfParent={__scopeId} __bfMount={'s0'} /><span className="sr-only">More</span></span>
  )
}