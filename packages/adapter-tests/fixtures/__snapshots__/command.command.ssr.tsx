/** @jsxImportSource hono/jsx */
import { createContext, useContext, createSignal, createMemo, createEffect, provideContextSSR } from '@barefootjs/hono/client-shim'
import { Dialog, DialogOverlay, DialogContent } from '../dialog'
import type { HTMLBaseAttributes } from '@barefootjs/jsx'
import type { Child } from '../../../types'
import { SearchIcon } from '../icon'
import { bfComment, bfText, bfTextEnd } from '@barefootjs/hono/utils'

const CommandContext = createContext<CommandContextValue>()

interface CommandProps extends HTMLBaseAttributes {
  /** Custom filter function */
  filter?: (value: string, search: string, keywords?: string[]) => boolean
  /** Callback when an item is selected */
  onValueChange?: (value: string) => void
  /** Children */
  children?: Child
}
interface CommandInputProps extends HTMLBaseAttributes {
  /** Placeholder text */
  placeholder?: string
  /** Whether disabled */
  disabled?: boolean
}
interface CommandListProps extends HTMLBaseAttributes {
  /** Children */
  children?: Child
}
interface CommandEmptyProps extends HTMLBaseAttributes {
  /** Children */
  children?: Child
}
interface CommandGroupProps extends HTMLBaseAttributes {
  /** Group heading text */
  heading?: string
  /** Children */
  children?: Child
}
interface CommandItemProps extends HTMLBaseAttributes {
  /** Value for filtering and selection (defaults to textContent) */
  value?: string
  /** Keywords for search matching */
  keywords?: string[]
  /** Whether disabled */
  disabled?: boolean
  /** Callback when selected */
  onSelect?: (value: string) => void
  /** Children */
  children?: Child
}
interface CommandSeparatorProps extends HTMLBaseAttributes {
}
interface CommandShortcutProps extends HTMLBaseAttributes {
  /** Children */
  children?: Child
}
interface CommandDialogProps extends HTMLBaseAttributes {
  /** Whether the dialog is open */
  open?: boolean
  /** Callback when open state changes */
  onOpenChange?: (open: boolean) => void
  /** Command filter function */
  filter?: (value: string, search: string, keywords?: string[]) => boolean
  /** Children */
  children?: Child
}

interface CommandProps extends HTMLBaseAttributes {
  /** Custom filter function */
  filter?: (value: string, search: string, keywords?: string[]) => boolean
  /** Callback when an item is selected */
  onValueChange?: (value: string) => void
  /** Children */
  children?: Child
}
interface CommandInputProps extends HTMLBaseAttributes {
  /** Placeholder text */
  placeholder?: string
  /** Whether disabled */
  disabled?: boolean
}
interface CommandListProps extends HTMLBaseAttributes {
  /** Children */
  children?: Child
}
interface CommandEmptyProps extends HTMLBaseAttributes {
  /** Children */
  children?: Child
}
interface CommandGroupProps extends HTMLBaseAttributes {
  /** Group heading text */
  heading?: string
  /** Children */
  children?: Child
}
interface CommandItemProps extends HTMLBaseAttributes {
  /** Value for filtering and selection (defaults to textContent) */
  value?: string
  /** Keywords for search matching */
  keywords?: string[]
  /** Whether disabled */
  disabled?: boolean
  /** Callback when selected */
  onSelect?: (value: string) => void
  /** Children */
  children?: Child
}
interface CommandSeparatorProps extends HTMLBaseAttributes {
}
interface CommandShortcutProps extends HTMLBaseAttributes {
  /** Children */
  children?: Child
}
interface CommandDialogProps extends HTMLBaseAttributes {
  /** Whether the dialog is open */
  open?: boolean
  /** Callback when open state changes */
  onOpenChange?: (open: boolean) => void
  /** Command filter function */
  filter?: (value: string, search: string, keywords?: string[]) => boolean
  /** Children */
  children?: Child
}

type CommandListPropsWithHydration = CommandListProps & {
  __instanceId?: string
  __bfScope?: string
  __bfChild?: boolean
  __bfParentProps?: string
  __bfParent?: string
  __bfMount?: string
  "data-key"?: string | number
}

interface CommandProps extends HTMLBaseAttributes {
  /** Custom filter function */
  filter?: (value: string, search: string, keywords?: string[]) => boolean
  /** Callback when an item is selected */
  onValueChange?: (value: string) => void
  /** Children */
  children?: Child
}
interface CommandInputProps extends HTMLBaseAttributes {
  /** Placeholder text */
  placeholder?: string
  /** Whether disabled */
  disabled?: boolean
}
interface CommandListProps extends HTMLBaseAttributes {
  /** Children */
  children?: Child
}
interface CommandEmptyProps extends HTMLBaseAttributes {
  /** Children */
  children?: Child
}
interface CommandGroupProps extends HTMLBaseAttributes {
  /** Group heading text */
  heading?: string
  /** Children */
  children?: Child
}
interface CommandItemProps extends HTMLBaseAttributes {
  /** Value for filtering and selection (defaults to textContent) */
  value?: string
  /** Keywords for search matching */
  keywords?: string[]
  /** Whether disabled */
  disabled?: boolean
  /** Callback when selected */
  onSelect?: (value: string) => void
  /** Children */
  children?: Child
}
interface CommandSeparatorProps extends HTMLBaseAttributes {
}
interface CommandShortcutProps extends HTMLBaseAttributes {
  /** Children */
  children?: Child
}
interface CommandDialogProps extends HTMLBaseAttributes {
  /** Whether the dialog is open */
  open?: boolean
  /** Callback when open state changes */
  onOpenChange?: (open: boolean) => void
  /** Command filter function */
  filter?: (value: string, search: string, keywords?: string[]) => boolean
  /** Children */
  children?: Child
}

type CommandSeparatorPropsWithHydration = CommandSeparatorProps & {
  __instanceId?: string
  __bfScope?: string
  __bfChild?: boolean
  __bfParentProps?: string
  __bfParent?: string
  __bfMount?: string
  "data-key"?: string | number
}

interface CommandProps extends HTMLBaseAttributes {
  /** Custom filter function */
  filter?: (value: string, search: string, keywords?: string[]) => boolean
  /** Callback when an item is selected */
  onValueChange?: (value: string) => void
  /** Children */
  children?: Child
}
interface CommandInputProps extends HTMLBaseAttributes {
  /** Placeholder text */
  placeholder?: string
  /** Whether disabled */
  disabled?: boolean
}
interface CommandListProps extends HTMLBaseAttributes {
  /** Children */
  children?: Child
}
interface CommandEmptyProps extends HTMLBaseAttributes {
  /** Children */
  children?: Child
}
interface CommandGroupProps extends HTMLBaseAttributes {
  /** Group heading text */
  heading?: string
  /** Children */
  children?: Child
}
interface CommandItemProps extends HTMLBaseAttributes {
  /** Value for filtering and selection (defaults to textContent) */
  value?: string
  /** Keywords for search matching */
  keywords?: string[]
  /** Whether disabled */
  disabled?: boolean
  /** Callback when selected */
  onSelect?: (value: string) => void
  /** Children */
  children?: Child
}
interface CommandSeparatorProps extends HTMLBaseAttributes {
}
interface CommandShortcutProps extends HTMLBaseAttributes {
  /** Children */
  children?: Child
}
interface CommandDialogProps extends HTMLBaseAttributes {
  /** Whether the dialog is open */
  open?: boolean
  /** Callback when open state changes */
  onOpenChange?: (open: boolean) => void
  /** Command filter function */
  filter?: (value: string, search: string, keywords?: string[]) => boolean
  /** Children */
  children?: Child
}

type CommandShortcutPropsWithHydration = CommandShortcutProps & {
  __instanceId?: string
  __bfScope?: string
  __bfChild?: boolean
  __bfParentProps?: string
  __bfParent?: string
  __bfMount?: string
  "data-key"?: string | number
}

export type { CommandProps, CommandInputProps, CommandListProps, CommandEmptyProps, CommandGroupProps, CommandItemProps, CommandSeparatorProps, CommandShortcutProps, CommandDialogProps }

export function Command(__allProps: CommandProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `Command_${Math.random().toString(36).slice(2, 8)}`
  const search = () => ''
  const setSearch = (..._args: any[]) => {}
  const selectedValue = () => ''
  const setSelectedValue = (..._args: any[]) => {}
  const filterFn = () => props.filter ?? ((value: string, search: string) => {
    if (!search) return true
    return value.toLowerCase().includes(search.toLowerCase())
  })
  const commandRootClasses = 'flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground'
  const items = new Set<HTMLElement>()

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.filter !== 'function' && !(typeof props.filter === 'object' && props.filter !== null && 'isEscaped' in props.filter)) __hydrateProps['filter'] = props.filter
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <>{provideContextSSR(CommandContext, {
      search,
      onSearchChange: setSearch,
      selectedValue,
      onSelect: (value) => {
        setSelectedValue(value)
        props.onValueChange?.(value)
      },
      registerItem: (el) => items.add(el),
      unregisterItem: (el) => items.delete(el),
      filter: filterFn(),
    }, <><div data-slot="command" id={props.id} className={`${commandRootClasses} ${props.className ?? ''}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{props.children}</div></>)}</>
  )
}

export function CommandInput(__allProps: CommandInputProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `CommandInput_${Math.random().toString(36).slice(2, 8)}`
  const commandInputClasses = 'flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50'

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.placeholder !== 'function' && !(typeof props.placeholder === 'object' && props.placeholder !== null && 'isEscaped' in props.placeholder)) __hydrateProps['placeholder'] = props.placeholder
  if (typeof props.disabled !== 'function' && !(typeof props.disabled === 'object' && props.disabled !== null && 'isEscaped' in props.disabled)) __hydrateProps['disabled'] = props.disabled
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="command-input-wrapper" className={`flex items-center border-b px-3`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s2"><SearchIcon className="mr-2 size-4 shrink-0 opacity-50" __instanceId={`${__scopeId}_s0`} __bfChild={true} __bfParent={__scopeId} __bfMount={'s0'} /><input data-slot="command-input" id={props.id} type="text" placeholder={props.placeholder} disabled={(props.disabled ?? false) || undefined} className={`${commandInputClasses} ${props.className ?? ''}`} autocomplete="off" bf="s1" /></div>
  )
}

export function CommandList({ className = '', children, __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props }: CommandListPropsWithHydration) {
  const __scopeId = __instanceId || `CommandList_${Math.random().toString(36).slice(2, 8)}`
  const commandListClasses = 'max-h-[300px] overflow-y-auto overflow-x-hidden'

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof className !== 'function' && !(typeof className === 'object' && className !== null && 'isEscaped' in className)) __hydrateProps['className'] = className
  if (typeof children !== 'function' && !(typeof children === 'object' && children !== null && 'isEscaped' in children)) __hydrateProps['children'] = children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="command-list" role="listbox" className={`${commandListClasses} ${className}`} {...props} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{children}</div>
  )
}

export function CommandEmpty(__allProps: CommandEmptyProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `CommandEmpty_${Math.random().toString(36).slice(2, 8)}`
  const commandEmptyClasses = 'py-6 text-center text-sm'

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="command-empty" id={props.id} hidden className={`${commandEmptyClasses} ${props.className ?? ''}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{props.children}</div>
  )
}

export function CommandGroup(__allProps: CommandGroupProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `CommandGroup_${Math.random().toString(36).slice(2, 8)}`
  const commandGroupClasses = 'overflow-hidden p-1 text-foreground [&_[data-slot=command-group-heading]]:px-2 [&_[data-slot=command-group-heading]]:py-1.5 [&_[data-slot=command-group-heading]]:text-xs [&_[data-slot=command-group-heading]]:font-medium [&_[data-slot=command-group-heading]]:text-muted-foreground'

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.heading !== 'function' && !(typeof props.heading === 'object' && props.heading !== null && 'isEscaped' in props.heading)) __hydrateProps['heading'] = props.heading
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="command-group" id={props.id} role="group" className={`${commandGroupClasses} ${props.className ?? ''}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s3">{props.heading ? <div bf-c="s0" data-slot="command-group-heading" aria-hidden="true" bf="s2">{bfText("s1")}{props.heading}{bfTextEnd()}</div> : <>{bfComment("cond-start:s0")}{bfComment("cond-end:s0")}</>}{props.children}</div>
  )
}

export function CommandItem(__allProps: CommandItemProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `CommandItem_${Math.random().toString(36).slice(2, 8)}`
  const isDisabled = () => props.disabled ?? false
  const commandItemClasses = 'relative flex cursor-default gap-2 select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[disabled=true]:pointer-events-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0'

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.value !== 'function' && !(typeof props.value === 'object' && props.value !== null && 'isEscaped' in props.value)) __hydrateProps['value'] = props.value
  if (typeof props.keywords !== 'function' && !(typeof props.keywords === 'object' && props.keywords !== null && 'isEscaped' in props.keywords)) __hydrateProps['keywords'] = props.keywords
  if (typeof props.disabled !== 'function' && !(typeof props.disabled === 'object' && props.disabled !== null && 'isEscaped' in props.disabled)) __hydrateProps['disabled'] = props.disabled
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="command-item" id={props.id} role="option" data-disabled={(isDisabled()) || undefined} data-selected="false" className={`${commandItemClasses} ${props.className ?? ''}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{props.children}</div>
  )
}

export function CommandSeparator({ className = '', __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props }: CommandSeparatorPropsWithHydration = {} as CommandSeparatorPropsWithHydration) {
  const __scopeId = __instanceId || `CommandSeparator_${Math.random().toString(36).slice(2, 8)}`
  const commandSeparatorClasses = '-mx-1 h-px bg-border'

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof className !== 'function' && !(typeof className === 'object' && className !== null && 'isEscaped' in className)) __hydrateProps['className'] = className
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="command-separator" role="separator" className={`${commandSeparatorClasses} ${className}`} {...props} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0" />
  )
}

export function CommandShortcut({ className = '', children, __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props }: CommandShortcutPropsWithHydration) {
  const __scopeId = __instanceId || `CommandShortcut_${Math.random().toString(36).slice(2, 8)}`
  const commandShortcutClasses = 'ml-auto text-xs tracking-widest text-muted-foreground'

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof className !== 'function' && !(typeof className === 'object' && className !== null && 'isEscaped' in className)) __hydrateProps['className'] = className
  if (typeof children !== 'function' && !(typeof children === 'object' && children !== null && 'isEscaped' in children)) __hydrateProps['children'] = children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <span data-slot="command-shortcut" className={`${commandShortcutClasses} ${className}`} {...props} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{children}</span>
  )
}

export function CommandDialog(__allProps: CommandDialogProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": _dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `CommandDialog_${Math.random().toString(36).slice(2, 8)}`
  const commandDialogContentClasses = 'overflow-hidden p-0'

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.open !== 'function' && !(typeof props.open === 'object' && props.open !== null && 'isEscaped' in props.open)) __hydrateProps['open'] = props.open
  if (typeof props.filter !== 'function' && !(typeof props.filter === 'object' && props.filter !== null && 'isEscaped' in props.filter)) __hydrateProps['filter'] = props.filter
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <>{bfComment(`scope:${__scopeId}${__bfParent ? `|h=${__bfParent}|m=${__bfMount}` : ""}${__bfPropsJson ? `|${__bfPropsJson}` : ""}`)}<Dialog open={props.open ?? false} onOpenChange={props.onOpenChange ?? (() => {})} __instanceId={`${__scopeId}_s3`} __bfParentProps={__bfPropsJson} __bfParent={__scopeId} __bfMount={'s3'} bf-s={__scopeId}><DialogOverlay __instanceId={`${__scopeId}_s0`} __bfChild={true} __bfParent={__scopeId} __bfMount={'s0'} /><DialogContent className={`${commandDialogContentClasses} max-w-lg p-0`} __instanceId={`${__scopeId}_s2`} __bfChild={true} __bfParent={__scopeId} __bfMount={'s2'}><Command id={props.id} filter={props.filter} className={`[&_[data-slot=command-input-wrapper]]:h-12`} __instanceId={`${__scopeId}_s1`} __bfChild={true} __bfParent={__scopeId} __bfMount={'s1'}>{props.children}</Command></DialogContent></Dialog></>
  )
}
