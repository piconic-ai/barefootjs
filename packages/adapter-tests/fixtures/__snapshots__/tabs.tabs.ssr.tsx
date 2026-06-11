/** @jsxImportSource hono/jsx */
import type { HTMLBaseAttributes, ButtonHTMLAttributes } from '@barefootjs/jsx'
import type { Child } from '../../../types'

interface TabsProps extends HTMLBaseAttributes {
  /** Currently selected tab value */
  value?: string
  /** Default selected value (uncontrolled) */
  defaultValue?: string
  /** Callback when tab changes */
  onValueChange?: (value: string) => void
  /** Tab components (TabsList and TabsContent) */
  children?: Child
}
interface TabsListProps extends HTMLBaseAttributes {
  /** TabsTrigger components */
  children?: Child
}
interface TabsTriggerProps extends ButtonHTMLAttributes {
  /** Value that identifies this tab */
  value: string
  /** Whether this tab is currently selected */
  selected?: boolean
  /** Whether this tab is disabled */
  disabled?: boolean
  /** Click handler */
  onClick?: () => void
  /** Tab label */
  children?: Child
}
interface TabsContentProps extends HTMLBaseAttributes {
  /** Value that identifies which tab this content belongs to */
  value: string
  /** Whether this content is currently visible */
  selected?: boolean
  /** Content to display */
  children?: Child
}

type TabsPropsWithHydration = TabsProps & {
  __instanceId?: string
  __bfScope?: string
  __bfChild?: boolean
  __bfParentProps?: string
  __bfParent?: string
  __bfMount?: string
  "data-key"?: string | number
}

interface TabsProps extends HTMLBaseAttributes {
  /** Currently selected tab value */
  value?: string
  /** Default selected value (uncontrolled) */
  defaultValue?: string
  /** Callback when tab changes */
  onValueChange?: (value: string) => void
  /** Tab components (TabsList and TabsContent) */
  children?: Child
}
interface TabsListProps extends HTMLBaseAttributes {
  /** TabsTrigger components */
  children?: Child
}
interface TabsTriggerProps extends ButtonHTMLAttributes {
  /** Value that identifies this tab */
  value: string
  /** Whether this tab is currently selected */
  selected?: boolean
  /** Whether this tab is disabled */
  disabled?: boolean
  /** Click handler */
  onClick?: () => void
  /** Tab label */
  children?: Child
}
interface TabsContentProps extends HTMLBaseAttributes {
  /** Value that identifies which tab this content belongs to */
  value: string
  /** Whether this content is currently visible */
  selected?: boolean
  /** Content to display */
  children?: Child
}

type TabsListPropsWithHydration = TabsListProps & {
  __instanceId?: string
  __bfScope?: string
  __bfChild?: boolean
  __bfParentProps?: string
  __bfParent?: string
  __bfMount?: string
  "data-key"?: string | number
}

interface TabsProps extends HTMLBaseAttributes {
  /** Currently selected tab value */
  value?: string
  /** Default selected value (uncontrolled) */
  defaultValue?: string
  /** Callback when tab changes */
  onValueChange?: (value: string) => void
  /** Tab components (TabsList and TabsContent) */
  children?: Child
}
interface TabsListProps extends HTMLBaseAttributes {
  /** TabsTrigger components */
  children?: Child
}
interface TabsTriggerProps extends ButtonHTMLAttributes {
  /** Value that identifies this tab */
  value: string
  /** Whether this tab is currently selected */
  selected?: boolean
  /** Whether this tab is disabled */
  disabled?: boolean
  /** Click handler */
  onClick?: () => void
  /** Tab label */
  children?: Child
}
interface TabsContentProps extends HTMLBaseAttributes {
  /** Value that identifies which tab this content belongs to */
  value: string
  /** Whether this content is currently visible */
  selected?: boolean
  /** Content to display */
  children?: Child
}

export type { TabsProps, TabsListProps, TabsTriggerProps, TabsContentProps }

export function Tabs({ className = '', value, defaultValue, children, __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props }: TabsPropsWithHydration) {
  const __scopeId = __instanceId || `Tabs_${Math.random().toString(36).slice(2, 8)}`
  const tabsClasses = 'flex flex-col gap-2 w-full'

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof className !== 'function' && !(typeof className === 'object' && className !== null && 'isEscaped' in className)) __hydrateProps['className'] = className
  if (typeof value !== 'function' && !(typeof value === 'object' && value !== null && 'isEscaped' in value)) __hydrateProps['value'] = value
  if (typeof defaultValue !== 'function' && !(typeof defaultValue === 'object' && defaultValue !== null && 'isEscaped' in defaultValue)) __hydrateProps['defaultValue'] = defaultValue
  if (typeof children !== 'function' && !(typeof children === 'object' && children !== null && 'isEscaped' in children)) __hydrateProps['children'] = children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="tabs" data-value={value || defaultValue} className={`${tabsClasses} ${className}`} {...props} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{children}</div>
  )
}

export function TabsList({ className = '', children, __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props }: TabsListPropsWithHydration) {
  const __scopeId = __instanceId || `TabsList_${Math.random().toString(36).slice(2, 8)}`
  const tabsListClasses = 'bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px]'

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof className !== 'function' && !(typeof className === 'object' && className !== null && 'isEscaped' in className)) __hydrateProps['className'] = className
  if (typeof children !== 'function' && !(typeof children === 'object' && children !== null && 'isEscaped' in children)) __hydrateProps['children'] = children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="tabs-list" role="tablist" className={`${tabsListClasses} ${className}`} {...props} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{children}</div>
  )
}

export function TabsTrigger(__allProps: TabsTriggerProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `TabsTrigger_${Math.random().toString(36).slice(2, 8)}`

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.value !== 'function' && !(typeof props.value === 'object' && props.value !== null && 'isEscaped' in props.value)) __hydrateProps['value'] = props.value
  if (typeof props.selected !== 'function' && !(typeof props.selected === 'object' && props.selected !== null && 'isEscaped' in props.selected)) __hydrateProps['selected'] = props.selected
  if (typeof props.disabled !== 'function' && !(typeof props.disabled === 'object' && props.disabled !== null && 'isEscaped' in props.disabled)) __hydrateProps['disabled'] = props.disabled
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <button data-slot="tabs-trigger" role="tab" aria-selected={props.selected ?? false} disabled={(props.disabled ?? false) || undefined} data-state={`${(props.selected ?? false) ? 'active' : 'inactive'}`} data-value={props.value} tabindex={(props.selected ?? false) ? 0 : -1} id={props.id} className={`inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] text-foreground data-[state=active]:bg-background data-[state=active]:shadow-sm dark:text-muted-foreground dark:data-[state=active]:text-foreground dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 ${props.className ?? ''}`} onClick={() => {}} onKeyDown={() => {}} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{props.children}</button>
  )
}

export function TabsContent(__allProps: TabsContentProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `TabsContent_${Math.random().toString(36).slice(2, 8)}`

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.value !== 'function' && !(typeof props.value === 'object' && props.value !== null && 'isEscaped' in props.value)) __hydrateProps['value'] = props.value
  if (typeof props.selected !== 'function' && !(typeof props.selected === 'object' && props.selected !== null && 'isEscaped' in props.selected)) __hydrateProps['selected'] = props.selected
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="tabs-content" role="tabpanel" tabindex={0} data-state={`${(props.selected ?? false) ? 'active' : 'inactive'}`} data-value={props.value} id={props.id} className={`flex-1 outline-none ${(props.selected ?? false) ? '' : 'hidden'} ${props.className ?? ''}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{props.children}</div>
  )
}
