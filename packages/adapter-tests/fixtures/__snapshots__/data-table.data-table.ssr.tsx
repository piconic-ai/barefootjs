/** @jsxImportSource hono/jsx */
import { bfComment, bfText, bfTextEnd } from '@barefootjs/hono/utils'
import type { HTMLBaseAttributes } from '@barefootjs/jsx'
import type { Child } from '../../../types'
import { ChevronUpIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, ArrowUpDownIcon } from '../icon'

type SortDirection = 'asc' | 'desc' | false
interface DataTableColumnHeaderProps extends HTMLBaseAttributes {
  /** Column title */
  title: string
  /** Current sort direction */
  sorted?: SortDirection
  /** Callback when sort is toggled */
  onSort?: () => void
}
interface DataTablePaginationProps extends HTMLBaseAttributes {
  /** Whether previous page is available */
  canPrev: boolean
  /** Whether next page is available */
  canNext: boolean
  /** Callback for previous page */
  onPrev: () => void
  /** Callback for next page */
  onNext: () => void
  /** Page info label (rendered as children) */
  children?: Child
}

type DataTableColumnHeaderPropsWithHydration = DataTableColumnHeaderProps & {
  __instanceId?: string
  __bfScope?: string
  __bfChild?: boolean
  __bfParentProps?: string
  __bfParent?: string
  __bfMount?: string
  "data-key"?: string | number
}

type SortDirection = 'asc' | 'desc' | false
interface DataTableColumnHeaderProps extends HTMLBaseAttributes {
  /** Column title */
  title: string
  /** Current sort direction */
  sorted?: SortDirection
  /** Callback when sort is toggled */
  onSort?: () => void
}
interface DataTablePaginationProps extends HTMLBaseAttributes {
  /** Whether previous page is available */
  canPrev: boolean
  /** Whether next page is available */
  canNext: boolean
  /** Callback for previous page */
  onPrev: () => void
  /** Callback for next page */
  onNext: () => void
  /** Page info label (rendered as children) */
  children?: Child
}

type DataTablePaginationPropsWithHydration = DataTablePaginationProps & {
  __instanceId?: string
  __bfScope?: string
  __bfChild?: boolean
  __bfParentProps?: string
  __bfParent?: string
  __bfMount?: string
  "data-key"?: string | number
}

export type { DataTableColumnHeaderProps, DataTablePaginationProps, SortDirection }

export function DataTableColumnHeader({ title, sorted = false, onSort, className = '', __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props }: DataTableColumnHeaderPropsWithHydration) {
  const __scopeId = __instanceId || `DataTableColumnHeader_${Math.random().toString(36).slice(2, 8)}`
  const columnHeaderClasses = 'inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer select-none'

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof title !== 'function' && !(typeof title === 'object' && title !== null && 'isEscaped' in title)) __hydrateProps['title'] = title
  if (typeof sorted !== 'function' && !(typeof sorted === 'object' && sorted !== null && 'isEscaped' in sorted)) __hydrateProps['sorted'] = sorted
  if (typeof className !== 'function' && !(typeof className === 'object' && className !== null && 'isEscaped' in className)) __hydrateProps['className'] = className
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <button data-slot="data-table-column-header" type="button" className={`${columnHeaderClasses} ${className}`} {...props} onClick={() => {}} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s6">{bfText("s0")}{title}{bfTextEnd()}{sorted === 'asc' ? <>{bfComment("cond-start:s1")}<ChevronUpIcon size="sm" __instanceId={`${__scopeId}_s2`} __bfChild={true} __bfParent={__scopeId} __bfMount={'s2'} />{bfComment("cond-end:s1")}</> : <>{bfComment("cond-start:s1")}{sorted === 'desc' ? <>{bfComment("cond-start:s3")}<ChevronDownIcon size="sm" __instanceId={`${__scopeId}_s4`} __bfChild={true} __bfParent={__scopeId} __bfMount={'s4'} />{bfComment("cond-end:s3")}</> : <>{bfComment("cond-start:s3")}<ArrowUpDownIcon size="sm" __instanceId={`${__scopeId}_s5`} __bfChild={true} __bfParent={__scopeId} __bfMount={'s5'} />{bfComment("cond-end:s3")}</>}{bfComment("cond-end:s1")}</>}</button>
  )
}

export function DataTablePagination({ canPrev, canNext, onPrev, onNext, children, className = '', __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props }: DataTablePaginationPropsWithHydration) {
  const __scopeId = __instanceId || `DataTablePagination_${Math.random().toString(36).slice(2, 8)}`
  const paginationClasses = 'flex items-center justify-between px-2 py-4'

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof canPrev !== 'function' && !(typeof canPrev === 'object' && canPrev !== null && 'isEscaped' in canPrev)) __hydrateProps['canPrev'] = canPrev
  if (typeof canNext !== 'function' && !(typeof canNext === 'object' && canNext !== null && 'isEscaped' in canNext)) __hydrateProps['canNext'] = canNext
  if (typeof children !== 'function' && !(typeof children === 'object' && children !== null && 'isEscaped' in children)) __hydrateProps['children'] = children
  if (typeof className !== 'function' && !(typeof className === 'object' && className !== null && 'isEscaped' in className)) __hydrateProps['className'] = className
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="data-table-pagination" className={`${paginationClasses} ${className}`} {...props} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s4"><div className="text-sm text-muted-foreground">{children}</div><div className="flex items-center gap-2"><button type="button" className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] border bg-background text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 h-8 px-3 has-[>svg]:px-2`} disabled={(!canPrev) || undefined} onClick={() => {}} bf="s1"><ChevronLeftIcon size="sm" __instanceId={`${__scopeId}_s0`} __bfChild={true} __bfParent={__scopeId} __bfMount={'s0'} /> Previous </button><button type="button" className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] border bg-background text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 h-8 px-3 has-[>svg]:px-2`} disabled={(!canNext) || undefined} onClick={() => {}} bf="s3"> Next <ChevronRightIcon size="sm" __instanceId={`${__scopeId}_s2`} __bfChild={true} __bfParent={__scopeId} __bfMount={'s2'} /></button></div></div>
  )
}
