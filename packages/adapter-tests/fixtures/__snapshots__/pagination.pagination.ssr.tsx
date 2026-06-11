/** @jsxImportSource hono/jsx */
import type { AnchorHTMLAttributes, HTMLBaseAttributes } from '@barefootjs/jsx'
import { createMemo } from '@barefootjs/hono/client-shim'
import type { Child } from '../../../types'
import { ChevronLeftIcon, ChevronRightIcon, EllipsisIcon } from '../icon'

interface PaginationProps extends HTMLBaseAttributes {
  children?: Child
}
interface PaginationLinkProps extends AnchorHTMLAttributes {
  isActive?: boolean
  size?: 'default' | 'icon'
  children?: Child
}

type PaginationPropsWithHydration = PaginationProps & {
  __instanceId?: string
  __bfScope?: string
  __bfChild?: boolean
  __bfParentProps?: string
  __bfParent?: string
  __bfMount?: string
  "data-key"?: string | number
}

interface PaginationContentProps extends HTMLBaseAttributes {
  children?: Child
}
interface PaginationLinkProps extends AnchorHTMLAttributes {
  isActive?: boolean
  size?: 'default' | 'icon'
  children?: Child
}

type PaginationContentPropsWithHydration = PaginationContentProps & {
  __instanceId?: string
  __bfScope?: string
  __bfChild?: boolean
  __bfParentProps?: string
  __bfParent?: string
  __bfMount?: string
  "data-key"?: string | number
}

interface PaginationItemProps extends HTMLBaseAttributes {
  children?: Child
}
interface PaginationLinkProps extends AnchorHTMLAttributes {
  isActive?: boolean
  size?: 'default' | 'icon'
  children?: Child
}

type PaginationItemPropsWithHydration = PaginationItemProps & {
  __instanceId?: string
  __bfScope?: string
  __bfChild?: boolean
  __bfParentProps?: string
  __bfParent?: string
  __bfMount?: string
  "data-key"?: string | number
}

interface PaginationLinkProps extends AnchorHTMLAttributes {
  isActive?: boolean
  size?: 'default' | 'icon'
  children?: Child
}

interface PaginationLinkProps extends AnchorHTMLAttributes {
  isActive?: boolean
  size?: 'default' | 'icon'
  children?: Child
}
interface PaginationPrevNextProps extends AnchorHTMLAttributes {
  children?: Child
}

type PaginationPreviousPropsWithHydration = PaginationPrevNextProps & {
  __instanceId?: string
  __bfScope?: string
  __bfChild?: boolean
  __bfParentProps?: string
  __bfParent?: string
  __bfMount?: string
  "data-key"?: string | number
}

interface PaginationLinkProps extends AnchorHTMLAttributes {
  isActive?: boolean
  size?: 'default' | 'icon'
  children?: Child
}
interface PaginationPrevNextProps extends AnchorHTMLAttributes {
  children?: Child
}

type PaginationNextPropsWithHydration = PaginationPrevNextProps & {
  __instanceId?: string
  __bfScope?: string
  __bfChild?: boolean
  __bfParentProps?: string
  __bfParent?: string
  __bfMount?: string
  "data-key"?: string | number
}

interface PaginationLinkProps extends AnchorHTMLAttributes {
  isActive?: boolean
  size?: 'default' | 'icon'
  children?: Child
}
interface PaginationEllipsisProps extends HTMLBaseAttributes {
}

type PaginationEllipsisPropsWithHydration = PaginationEllipsisProps & {
  __instanceId?: string
  __bfScope?: string
  __bfChild?: boolean
  __bfParentProps?: string
  __bfParent?: string
  __bfMount?: string
  "data-key"?: string | number
}

export type { PaginationLinkProps }

export function Pagination({ className = '', children, __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props }: PaginationPropsWithHydration) {
  const __scopeId = __instanceId || `Pagination_${Math.random().toString(36).slice(2, 8)}`

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof className !== 'function' && !(typeof className === 'object' && className !== null && 'isEscaped' in className)) __hydrateProps['className'] = className
  if (typeof children !== 'function' && !(typeof children === 'object' && children !== null && 'isEscaped' in children)) __hydrateProps['children'] = children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <nav role="navigation" aria-label="pagination" data-slot="pagination" className={`mx-auto flex w-full justify-center ${className}`} {...props} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{children}</nav>
  )
}

export function PaginationContent({ className = '', children, __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props }: PaginationContentPropsWithHydration) {
  const __scopeId = __instanceId || `PaginationContent_${Math.random().toString(36).slice(2, 8)}`

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof className !== 'function' && !(typeof className === 'object' && className !== null && 'isEscaped' in className)) __hydrateProps['className'] = className
  if (typeof children !== 'function' && !(typeof children === 'object' && children !== null && 'isEscaped' in children)) __hydrateProps['children'] = children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <ul data-slot="pagination-content" className={`flex flex-row items-center gap-1 ${className}`} {...props} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{children}</ul>
  )
}

export function PaginationItem({ className = '', children, __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props }: PaginationItemPropsWithHydration) {
  const __scopeId = __instanceId || `PaginationItem_${Math.random().toString(36).slice(2, 8)}`

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof className !== 'function' && !(typeof className === 'object' && className !== null && 'isEscaped' in className)) __hydrateProps['className'] = className
  if (typeof children !== 'function' && !(typeof children === 'object' && children !== null && 'isEscaped' in children)) __hydrateProps['children'] = children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <li data-slot="pagination-item" className={className} {...props} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{children}</li>
  )
}

export function PaginationLink(__allProps: PaginationLinkProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `PaginationLink_${Math.random().toString(36).slice(2, 8)}`
  const size = () => props.size ?? 'icon'
  const variantClasses = {
  outline: 'border border-input bg-background text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:hover:bg-input/50',
  ghost: 'text-foreground hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50',
}

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.isActive !== 'function' && !(typeof props.isActive === 'object' && props.isActive !== null && 'isEscaped' in props.isActive)) __hydrateProps['isActive'] = props.isActive
  if (typeof props.size !== 'function' && !(typeof props.size === 'object' && props.size !== null && 'isEscaped' in props.size)) __hydrateProps['size'] = props.size
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <a aria-current={props.isActive ? 'page' : undefined} data-slot="pagination-link" data-active={props.isActive} id={props.id} className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] ${props.isActive ? variantClasses.outline : variantClasses.ghost} ${({"default": "h-9 px-4 py-2 has-[>svg]:px-3", "icon": "size-9"})[size()]} ${props.className ?? ''}`} href={props.href} onClick={() => {}} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{props.children}</a>
  )
}

export function PaginationPrevious({ className = '', children, __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props }: PaginationPreviousPropsWithHydration) {
  const __scopeId = __instanceId || `PaginationPrevious_${Math.random().toString(36).slice(2, 8)}`
  const buttonBaseClasses = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]'
  const variantClasses = {
  outline: 'border border-input bg-background text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:hover:bg-input/50',
  ghost: 'text-foreground hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50',
}
  const sizeClasses = {
  default: 'h-9 px-4 py-2 has-[>svg]:px-3',
  icon: 'size-9',
}

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof className !== 'function' && !(typeof className === 'object' && className !== null && 'isEscaped' in className)) __hydrateProps['className'] = className
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <a aria-label="Go to previous page" data-slot="pagination-link" className={`${buttonBaseClasses} ${variantClasses.ghost} ${sizeClasses.default} gap-1 px-2.5 sm:pl-2.5 ${className}`} {...props} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s1"><ChevronLeftIcon size="sm" __instanceId={`${__scopeId}_s0`} __bfChild={true} __bfParent={__scopeId} __bfMount={'s0'} /><span className="hidden sm:block">Previous</span></a>
  )
}

export function PaginationNext({ className = '', children, __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props }: PaginationNextPropsWithHydration) {
  const __scopeId = __instanceId || `PaginationNext_${Math.random().toString(36).slice(2, 8)}`
  const buttonBaseClasses = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]'
  const variantClasses = {
  outline: 'border border-input bg-background text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:hover:bg-input/50',
  ghost: 'text-foreground hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50',
}
  const sizeClasses = {
  default: 'h-9 px-4 py-2 has-[>svg]:px-3',
  icon: 'size-9',
}

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof className !== 'function' && !(typeof className === 'object' && className !== null && 'isEscaped' in className)) __hydrateProps['className'] = className
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <a aria-label="Go to next page" data-slot="pagination-link" className={`${buttonBaseClasses} ${variantClasses.ghost} ${sizeClasses.default} gap-1 px-2.5 sm:pr-2.5 ${className}`} {...props} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s1"><span className="hidden sm:block">Next</span><ChevronRightIcon size="sm" __instanceId={`${__scopeId}_s0`} __bfChild={true} __bfParent={__scopeId} __bfMount={'s0'} /></a>
  )
}

export function PaginationEllipsis({ className = '', __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props }: PaginationEllipsisPropsWithHydration = {} as PaginationEllipsisPropsWithHydration) {
  const __scopeId = __instanceId || `PaginationEllipsis_${Math.random().toString(36).slice(2, 8)}`

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof className !== 'function' && !(typeof className === 'object' && className !== null && 'isEscaped' in className)) __hydrateProps['className'] = className
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <span aria-hidden data-slot="pagination-ellipsis" className={`flex size-9 items-center justify-center ${className}`} {...props} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s1"><EllipsisIcon size="sm" __instanceId={`${__scopeId}_s0`} __bfChild={true} __bfParent={__scopeId} __bfMount={'s0'} /><span className="sr-only">More pages</span></span>
  )
}
