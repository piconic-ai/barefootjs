/** @jsxImportSource hono/jsx */
import { createContext, useContext, createSignal, createMemo, createEffect, createPortal, isSSRPortal, findSiblingSlot, provideContextSSR } from '@barefootjs/hono/client-shim'
import type { HTMLBaseAttributes, ButtonHTMLAttributes } from '@barefootjs/jsx'
import type { Child } from '../../../types'
import { CheckIcon, ChevronDownIcon, SearchIcon } from '../icon'
import { bfText, bfTextEnd, bfComment } from '@barefootjs/hono/utils'

const ComboboxContext = createContext<ComboboxContextValue>()

interface ComboboxProps extends HTMLBaseAttributes {
  /** Controlled selected value */
  value?: string
  /** Callback when the selected value changes */
  onValueChange?: (value: string) => void
  /** Custom filter function */
  filter?: (value: string, search: string) => boolean
  /** Children */
  children?: Child
}
interface ComboboxTriggerProps extends ButtonHTMLAttributes {
  /** Trigger content (typically ComboboxValue) */
  children?: Child
}
interface ComboboxValueProps extends HTMLBaseAttributes {
  /** Placeholder text when no value is selected */
  placeholder?: string
}
interface ComboboxContentProps extends HTMLBaseAttributes {
  /** Content children */
  children?: Child
  /** Alignment relative to trigger */
  align?: 'start' | 'end'
}
interface ComboboxInputProps extends HTMLBaseAttributes {
  /** Placeholder text */
  placeholder?: string
  /** Whether disabled */
  disabled?: boolean
}
interface ComboboxEmptyProps extends HTMLBaseAttributes {
  /** Children */
  children?: Child
}
interface ComboboxItemProps extends HTMLBaseAttributes {
  /** The value for this item */
  value: string
  /** Whether this item is disabled */
  disabled?: boolean
  /** Item content (label text) */
  children?: Child
}
interface ComboboxGroupProps extends HTMLBaseAttributes {
  /** Group heading text */
  heading?: string
  /** Children */
  children?: Child
}
interface ComboboxSeparatorProps extends HTMLBaseAttributes {
}

interface ComboboxProps extends HTMLBaseAttributes {
  /** Controlled selected value */
  value?: string
  /** Callback when the selected value changes */
  onValueChange?: (value: string) => void
  /** Custom filter function */
  filter?: (value: string, search: string) => boolean
  /** Children */
  children?: Child
}
interface ComboboxTriggerProps extends ButtonHTMLAttributes {
  /** Trigger content (typically ComboboxValue) */
  children?: Child
}
interface ComboboxValueProps extends HTMLBaseAttributes {
  /** Placeholder text when no value is selected */
  placeholder?: string
}
interface ComboboxContentProps extends HTMLBaseAttributes {
  /** Content children */
  children?: Child
  /** Alignment relative to trigger */
  align?: 'start' | 'end'
}
interface ComboboxInputProps extends HTMLBaseAttributes {
  /** Placeholder text */
  placeholder?: string
  /** Whether disabled */
  disabled?: boolean
}
interface ComboboxEmptyProps extends HTMLBaseAttributes {
  /** Children */
  children?: Child
}
interface ComboboxItemProps extends HTMLBaseAttributes {
  /** The value for this item */
  value: string
  /** Whether this item is disabled */
  disabled?: boolean
  /** Item content (label text) */
  children?: Child
}
interface ComboboxGroupProps extends HTMLBaseAttributes {
  /** Group heading text */
  heading?: string
  /** Children */
  children?: Child
}
interface ComboboxSeparatorProps extends HTMLBaseAttributes {
}

type ComboboxSeparatorPropsWithHydration = ComboboxSeparatorProps & {
  __instanceId?: string
  __bfScope?: string
  __bfChild?: boolean
  __bfParentProps?: string
  __bfParent?: string
  __bfMount?: string
  "data-key"?: string | number
}

export type { ComboboxProps, ComboboxTriggerProps, ComboboxValueProps, ComboboxContentProps, ComboboxInputProps, ComboboxEmptyProps, ComboboxItemProps, ComboboxGroupProps, ComboboxSeparatorProps }

export function Combobox(__allProps: ComboboxProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `Combobox_${Math.random().toString(36).slice(2, 8)}`
  const open = () => false
  const setOpen = (..._args: any[]) => {}
  const search = () => ''
  const setSearch = (..._args: any[]) => {}
  const internalValue = () => props.value ?? ''
  const setInternalValue = (..._args: any[]) => {}
  const isControlled = () => props.value !== undefined
  const filterFn = () => props.filter ?? ((value: string, search: string) => {
    if (!search) return true
    return value.toLowerCase().includes(search.toLowerCase())
  })

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.value !== 'function' && !(typeof props.value === 'object' && props.value !== null && 'isEscaped' in props.value)) __hydrateProps['value'] = props.value
  if (typeof props.filter !== 'function' && !(typeof props.filter === 'object' && props.filter !== null && 'isEscaped' in props.filter)) __hydrateProps['filter'] = props.filter
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <>{provideContextSSR(ComboboxContext, {
      open,
      onOpenChange: (v) => {
        setOpen(v)
        // Clear search when closing
        if (!v) setSearch('')
      },
      value: () => isControlled() ? (props.value ?? '') : internalValue(),
      onValueChange: (v) => {
        if (!isControlled()) setInternalValue(v)
        if (props.onValueChange) props.onValueChange(v)
      },
      search,
      onSearchChange: setSearch,
      filter: filterFn(),
    }, <><div data-slot="combobox" id={props.id} className={`relative inline-block ${props.className ?? ''}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})}>{props.children}</div></>)}</>
  )
}

export function ComboboxTrigger(__allProps: ComboboxTriggerProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `ComboboxTrigger_${Math.random().toString(36).slice(2, 8)}`

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <button data-slot="combobox-trigger" type="button" role="combobox" id={props.id} aria-expanded="false" aria-haspopup="listbox" aria-autocomplete="list" data-state="closed" className={`flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus:border-ring focus:ring-ring/50 focus:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-muted-foreground ${props.className ?? ''}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s1">{props.children}<ChevronDownIcon className="size-4 shrink-0 opacity-50" __instanceId={`${__scopeId}_s0`} __bfChild={true} __bfParent={__scopeId} __bfMount={'s0'} /></button>
  )
}

export function ComboboxValue(__allProps: ComboboxValueProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `ComboboxValue_${Math.random().toString(36).slice(2, 8)}`

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.placeholder !== 'function' && !(typeof props.placeholder === 'object' && props.placeholder !== null && 'isEscaped' in props.placeholder)) __hydrateProps['placeholder'] = props.placeholder
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <span data-slot="combobox-value" id={props.id} className="pointer-events-none truncate" bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s1">{bfText("s0")}{props.placeholder ?? ''}{bfTextEnd()}</span>
  )
}

export function ComboboxContent(__allProps: ComboboxContentProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `ComboboxContent_${Math.random().toString(36).slice(2, 8)}`
  const contentBaseClasses = 'fixed z-50 max-h-[min(var(--radix-select-content-available-height,384px),384px)] min-w-[8rem] overflow-hidden rounded-md border bg-popover shadow-md transform-gpu origin-top transition-[opacity,transform] duration-normal ease-out'
  const contentClosedClasses = 'opacity-0 scale-95 pointer-events-none'

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  if (typeof props.align !== 'function' && !(typeof props.align === 'object' && props.align !== null && 'isEscaped' in props.align)) __hydrateProps['align'] = props.align
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="combobox-content" data-state="closed" role="listbox" id={props.id} tabindex={-1} className={`${contentBaseClasses} ${contentClosedClasses} ${props.className ?? ''}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{props.children}</div>
  )
}

export function ComboboxInput(__allProps: ComboboxInputProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `ComboboxInput_${Math.random().toString(36).slice(2, 8)}`
  const inputClasses = 'flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50'

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.placeholder !== 'function' && !(typeof props.placeholder === 'object' && props.placeholder !== null && 'isEscaped' in props.placeholder)) __hydrateProps['placeholder'] = props.placeholder
  if (typeof props.disabled !== 'function' && !(typeof props.disabled === 'object' && props.disabled !== null && 'isEscaped' in props.disabled)) __hydrateProps['disabled'] = props.disabled
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="combobox-input-wrapper" className={`flex items-center border-b px-3`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s2"><SearchIcon className="mr-2 size-4 shrink-0 opacity-50" __instanceId={`${__scopeId}_s0`} __bfChild={true} __bfParent={__scopeId} __bfMount={'s0'} /><input data-slot="combobox-input" id={props.id} type="text" placeholder={props.placeholder} disabled={(props.disabled ?? false) || undefined} className={`${inputClasses} ${props.className ?? ''}`} autocomplete="off" bf="s1" /></div>
  )
}

export function ComboboxEmpty(__allProps: ComboboxEmptyProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `ComboboxEmpty_${Math.random().toString(36).slice(2, 8)}`
  const emptyClasses = 'py-6 text-center text-sm'

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="combobox-empty" id={props.id} hidden className={`${emptyClasses} ${props.className ?? ''}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{props.children}</div>
  )
}

export function ComboboxItem(__allProps: ComboboxItemProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `ComboboxItem_${Math.random().toString(36).slice(2, 8)}`
  const isDisabled = () => props.disabled ?? false
  const stateClasses = () => isDisabled() ? itemDisabledClasses : itemDefaultClasses
  const itemBaseClasses = 'relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-hidden'
  const itemDefaultClasses = 'text-popover-foreground hover:bg-accent/50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground'
  const itemDisabledClasses = 'pointer-events-none opacity-50'

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.value !== 'function' && !(typeof props.value === 'object' && props.value !== null && 'isEscaped' in props.value)) __hydrateProps['value'] = props.value
  if (typeof props.disabled !== 'function' && !(typeof props.disabled === 'object' && props.disabled !== null && 'isEscaped' in props.disabled)) __hydrateProps['disabled'] = props.disabled
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="combobox-item" data-value={props.value} data-state="unchecked" data-selected="false" role="option" id={props.id} aria-selected="false" aria-disabled={(isDisabled()) || undefined} tabindex={-1} className={`${itemBaseClasses} ${stateClasses()} ${props.className ?? ''}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s1"><span data-slot="combobox-item-indicator" className={`absolute left-2 flex size-3.5 shrink-0 items-center justify-center`} style="display:none"><CheckIcon className="size-4" __instanceId={`${__scopeId}_s0`} __bfChild={true} __bfParent={__scopeId} __bfMount={'s0'} /></span>{props.children}</div>
  )
}

export function ComboboxGroup(__allProps: ComboboxGroupProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `ComboboxGroup_${Math.random().toString(36).slice(2, 8)}`
  const groupClasses = 'overflow-hidden p-1 text-foreground [&_[data-slot=combobox-group-heading]]:px-2 [&_[data-slot=combobox-group-heading]]:py-1.5 [&_[data-slot=combobox-group-heading]]:text-xs [&_[data-slot=combobox-group-heading]]:font-medium [&_[data-slot=combobox-group-heading]]:text-muted-foreground'

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.heading !== 'function' && !(typeof props.heading === 'object' && props.heading !== null && 'isEscaped' in props.heading)) __hydrateProps['heading'] = props.heading
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="combobox-group" id={props.id} role="group" className={`${groupClasses} ${props.className ?? ''}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s3">{props.heading ? <div bf-c="s0" data-slot="combobox-group-heading" aria-hidden="true" bf="s2">{bfText("s1")}{props.heading}{bfTextEnd()}</div> : <>{bfComment("cond-start:s0")}{bfComment("cond-end:s0")}</>}{props.children}</div>
  )
}

export function ComboboxSeparator({ className = '', __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props }: ComboboxSeparatorPropsWithHydration = {} as ComboboxSeparatorPropsWithHydration) {
  const __scopeId = __instanceId || `ComboboxSeparator_${Math.random().toString(36).slice(2, 8)}`
  const separatorClasses = '-mx-1 my-1 h-px bg-border'

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof className !== 'function' && !(typeof className === 'object' && className !== null && 'isEscaped' in className)) __hydrateProps['className'] = className
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="combobox-separator" role="separator" className={`${separatorClasses} ${className}`} {...props} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0" />
  )
}
