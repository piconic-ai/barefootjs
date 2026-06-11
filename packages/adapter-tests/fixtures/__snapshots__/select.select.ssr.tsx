/** @jsxImportSource hono/jsx */
import { createContext, useContext, createSignal, createMemo, createEffect, createPortal, isSSRPortal, findSiblingSlot, provideContextSSR } from '@barefootjs/hono/client-shim'
import type { HTMLBaseAttributes, ButtonHTMLAttributes } from '@barefootjs/jsx'
import type { Child } from '../../../types'
import { CheckIcon, ChevronDownIcon } from '../icon'
import { bfText, bfTextEnd } from '@barefootjs/hono/utils'

const SelectContext = createContext<SelectContextValue>()

interface SelectProps extends HTMLBaseAttributes {
  /** Controlled value */
  value?: string
  /** Callback when value changes */
  onValueChange?: (value: string) => void
  /** Whether the select is open (controlled) */
  open?: boolean
  /** Callback when open state changes */
  onOpenChange?: (open: boolean) => void
  /** Whether the entire select is disabled */
  disabled?: boolean
  /** SelectTrigger and SelectContent */
  children?: Child
}
interface SelectTriggerProps extends ButtonHTMLAttributes {
  /** Trigger content (typically SelectValue) */
  children?: Child
}
interface SelectValueProps extends HTMLBaseAttributes {
  /** Placeholder text when no value is selected */
  placeholder?: string
}
interface SelectContentProps extends HTMLBaseAttributes {
  /** SelectItem, SelectGroup, SelectLabel, SelectSeparator components */
  children?: Child
  /** Alignment relative to trigger */
  align?: 'start' | 'end'
}
interface SelectItemProps extends HTMLBaseAttributes {
  /** The value for this item */
  value: string
  /** Whether this item is disabled */
  disabled?: boolean
  /** Item content (label text) */
  children?: Child
}
interface SelectGroupProps extends HTMLBaseAttributes {
  /** Grouped items */
  children?: Child
}
interface SelectLabelProps extends HTMLBaseAttributes {
  /** Label text */
  children?: Child
}
interface SelectSeparatorProps extends HTMLBaseAttributes {
}

interface SelectProps extends HTMLBaseAttributes {
  /** Controlled value */
  value?: string
  /** Callback when value changes */
  onValueChange?: (value: string) => void
  /** Whether the select is open (controlled) */
  open?: boolean
  /** Callback when open state changes */
  onOpenChange?: (open: boolean) => void
  /** Whether the entire select is disabled */
  disabled?: boolean
  /** SelectTrigger and SelectContent */
  children?: Child
}
interface SelectTriggerProps extends ButtonHTMLAttributes {
  /** Trigger content (typically SelectValue) */
  children?: Child
}
interface SelectValueProps extends HTMLBaseAttributes {
  /** Placeholder text when no value is selected */
  placeholder?: string
}
interface SelectContentProps extends HTMLBaseAttributes {
  /** SelectItem, SelectGroup, SelectLabel, SelectSeparator components */
  children?: Child
  /** Alignment relative to trigger */
  align?: 'start' | 'end'
}
interface SelectItemProps extends HTMLBaseAttributes {
  /** The value for this item */
  value: string
  /** Whether this item is disabled */
  disabled?: boolean
  /** Item content (label text) */
  children?: Child
}
interface SelectGroupProps extends HTMLBaseAttributes {
  /** Grouped items */
  children?: Child
}
interface SelectLabelProps extends HTMLBaseAttributes {
  /** Label text */
  children?: Child
}
interface SelectSeparatorProps extends HTMLBaseAttributes {
}

type SelectGroupPropsWithHydration = SelectGroupProps & {
  __instanceId?: string
  __bfScope?: string
  __bfChild?: boolean
  __bfParentProps?: string
  __bfParent?: string
  __bfMount?: string
  "data-key"?: string | number
}

interface SelectProps extends HTMLBaseAttributes {
  /** Controlled value */
  value?: string
  /** Callback when value changes */
  onValueChange?: (value: string) => void
  /** Whether the select is open (controlled) */
  open?: boolean
  /** Callback when open state changes */
  onOpenChange?: (open: boolean) => void
  /** Whether the entire select is disabled */
  disabled?: boolean
  /** SelectTrigger and SelectContent */
  children?: Child
}
interface SelectTriggerProps extends ButtonHTMLAttributes {
  /** Trigger content (typically SelectValue) */
  children?: Child
}
interface SelectValueProps extends HTMLBaseAttributes {
  /** Placeholder text when no value is selected */
  placeholder?: string
}
interface SelectContentProps extends HTMLBaseAttributes {
  /** SelectItem, SelectGroup, SelectLabel, SelectSeparator components */
  children?: Child
  /** Alignment relative to trigger */
  align?: 'start' | 'end'
}
interface SelectItemProps extends HTMLBaseAttributes {
  /** The value for this item */
  value: string
  /** Whether this item is disabled */
  disabled?: boolean
  /** Item content (label text) */
  children?: Child
}
interface SelectGroupProps extends HTMLBaseAttributes {
  /** Grouped items */
  children?: Child
}
interface SelectLabelProps extends HTMLBaseAttributes {
  /** Label text */
  children?: Child
}
interface SelectSeparatorProps extends HTMLBaseAttributes {
}

type SelectLabelPropsWithHydration = SelectLabelProps & {
  __instanceId?: string
  __bfScope?: string
  __bfChild?: boolean
  __bfParentProps?: string
  __bfParent?: string
  __bfMount?: string
  "data-key"?: string | number
}

interface SelectProps extends HTMLBaseAttributes {
  /** Controlled value */
  value?: string
  /** Callback when value changes */
  onValueChange?: (value: string) => void
  /** Whether the select is open (controlled) */
  open?: boolean
  /** Callback when open state changes */
  onOpenChange?: (open: boolean) => void
  /** Whether the entire select is disabled */
  disabled?: boolean
  /** SelectTrigger and SelectContent */
  children?: Child
}
interface SelectTriggerProps extends ButtonHTMLAttributes {
  /** Trigger content (typically SelectValue) */
  children?: Child
}
interface SelectValueProps extends HTMLBaseAttributes {
  /** Placeholder text when no value is selected */
  placeholder?: string
}
interface SelectContentProps extends HTMLBaseAttributes {
  /** SelectItem, SelectGroup, SelectLabel, SelectSeparator components */
  children?: Child
  /** Alignment relative to trigger */
  align?: 'start' | 'end'
}
interface SelectItemProps extends HTMLBaseAttributes {
  /** The value for this item */
  value: string
  /** Whether this item is disabled */
  disabled?: boolean
  /** Item content (label text) */
  children?: Child
}
interface SelectGroupProps extends HTMLBaseAttributes {
  /** Grouped items */
  children?: Child
}
interface SelectLabelProps extends HTMLBaseAttributes {
  /** Label text */
  children?: Child
}
interface SelectSeparatorProps extends HTMLBaseAttributes {
}

type SelectSeparatorPropsWithHydration = SelectSeparatorProps & {
  __instanceId?: string
  __bfScope?: string
  __bfChild?: boolean
  __bfParentProps?: string
  __bfParent?: string
  __bfMount?: string
  "data-key"?: string | number
}

export type { SelectProps, SelectTriggerProps, SelectValueProps, SelectContentProps, SelectItemProps, SelectGroupProps, SelectLabelProps, SelectSeparatorProps }

export function Select(__allProps: SelectProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `Select_${Math.random().toString(36).slice(2, 8)}`
  const open = () => false
  const setOpen = (..._args: any[]) => {}
  const internalValue = () => props.value ?? ''
  const setInternalValue = (..._args: any[]) => {}
  const isControlled = () => props.value !== undefined

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.value !== 'function' && !(typeof props.value === 'object' && props.value !== null && 'isEscaped' in props.value)) __hydrateProps['value'] = props.value
  if (typeof props.open !== 'function' && !(typeof props.open === 'object' && props.open !== null && 'isEscaped' in props.open)) __hydrateProps['open'] = props.open
  if (typeof props.disabled !== 'function' && !(typeof props.disabled === 'object' && props.disabled !== null && 'isEscaped' in props.disabled)) __hydrateProps['disabled'] = props.disabled
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <>{provideContextSSR(SelectContext, {
      open,
      onOpenChange: (v) => { setOpen(v); props.onOpenChange?.(v) },
      value: () => isControlled() ? (props.value ?? '') : internalValue(),
      onValueChange: (v) => {
        if (!isControlled()) setInternalValue(v)
        if (props.onValueChange) props.onValueChange(v)
      },
      disabled: () => props.disabled ?? false,
    }, <><div data-slot="select" id={props.id} className={`relative inline-block ${props.className ?? ''}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})}>{props.children}</div></>)}</>
  )
}

export function SelectTrigger(__allProps: SelectTriggerProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `SelectTrigger_${Math.random().toString(36).slice(2, 8)}`

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <button data-slot="select-trigger" type="button" role="combobox" id={props.id} aria-expanded="false" aria-haspopup="listbox" aria-autocomplete="none" data-state="closed" className={`flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus:border-ring focus:ring-ring/50 focus:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-muted-foreground ${props.className ?? ''}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s1">{props.children}<ChevronDownIcon className="size-4 opacity-50" __instanceId={`${__scopeId}_s0`} __bfChild={true} __bfParent={__scopeId} __bfMount={'s0'} /></button>
  )
}

export function SelectValue(__allProps: SelectValueProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `SelectValue_${Math.random().toString(36).slice(2, 8)}`

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.placeholder !== 'function' && !(typeof props.placeholder === 'object' && props.placeholder !== null && 'isEscaped' in props.placeholder)) __hydrateProps['placeholder'] = props.placeholder
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <span data-slot="select-value" id={props.id} className="pointer-events-none truncate" bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s1">{bfText("s0")}{props.placeholder ?? ''}{bfTextEnd()}</span>
  )
}

export function SelectContent(__allProps: SelectContentProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `SelectContent_${Math.random().toString(36).slice(2, 8)}`
  const selectContentBaseClasses = 'fixed z-50 max-h-[min(var(--radix-select-content-available-height,384px),384px)] min-w-[8rem] overflow-y-auto rounded-md border bg-popover p-1 shadow-md transform-gpu origin-top transition-[opacity,transform] duration-normal ease-out'
  const selectContentClosedClasses = 'opacity-0 scale-95 pointer-events-none'

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  if (typeof props.align !== 'function' && !(typeof props.align === 'object' && props.align !== null && 'isEscaped' in props.align)) __hydrateProps['align'] = props.align
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="select-content" data-state="closed" role="listbox" id={props.id} tabindex={-1} className={`${selectContentBaseClasses} ${selectContentClosedClasses} ${props.className ?? ''}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{props.children}</div>
  )
}

export function SelectItem(__allProps: SelectItemProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `SelectItem_${Math.random().toString(36).slice(2, 8)}`
  const isDisabled = () => props.disabled ?? false
  const stateClasses = () => isDisabled() ? selectItemDisabledClasses : selectItemDefaultClasses
  const selectItemBaseClasses = 'relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-hidden'
  const selectItemDefaultClasses = 'text-popover-foreground hover:bg-accent/50 focus:bg-accent focus:text-accent-foreground'
  const selectItemDisabledClasses = 'pointer-events-none opacity-50'

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.value !== 'function' && !(typeof props.value === 'object' && props.value !== null && 'isEscaped' in props.value)) __hydrateProps['value'] = props.value
  if (typeof props.disabled !== 'function' && !(typeof props.disabled === 'object' && props.disabled !== null && 'isEscaped' in props.disabled)) __hydrateProps['disabled'] = props.disabled
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="select-item" data-value={props.value} data-state="unchecked" role="option" id={props.id} aria-selected="false" aria-disabled={(isDisabled()) || undefined} tabindex={isDisabled() ? -1 : 0} className={`${selectItemBaseClasses} ${stateClasses()} ${props.className ?? ''}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s1"><span data-slot="select-item-indicator" className={`absolute left-2 flex size-3.5 shrink-0 items-center justify-center`} style="display:none"><CheckIcon className="size-4" __instanceId={`${__scopeId}_s0`} __bfChild={true} __bfParent={__scopeId} __bfMount={'s0'} /></span>{props.children}</div>
  )
}

export function SelectGroup({ children, className = '', __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props }: SelectGroupPropsWithHydration) {
  const __scopeId = __instanceId || `SelectGroup_${Math.random().toString(36).slice(2, 8)}`

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof children !== 'function' && !(typeof children === 'object' && children !== null && 'isEscaped' in children)) __hydrateProps['children'] = children
  if (typeof className !== 'function' && !(typeof className === 'object' && className !== null && 'isEscaped' in className)) __hydrateProps['className'] = className
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="select-group" role="group" className={className} {...props} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{children}</div>
  )
}

export function SelectLabel({ children, className = '', __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props }: SelectLabelPropsWithHydration) {
  const __scopeId = __instanceId || `SelectLabel_${Math.random().toString(36).slice(2, 8)}`
  const selectLabelClasses = 'px-2 py-1.5 text-sm font-semibold text-foreground'

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof children !== 'function' && !(typeof children === 'object' && children !== null && 'isEscaped' in children)) __hydrateProps['children'] = children
  if (typeof className !== 'function' && !(typeof className === 'object' && className !== null && 'isEscaped' in className)) __hydrateProps['className'] = className
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="select-label" className={`${selectLabelClasses} ${className}`} {...props} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{children}</div>
  )
}

export function SelectSeparator({ className = '', __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props }: SelectSeparatorPropsWithHydration = {} as SelectSeparatorPropsWithHydration) {
  const __scopeId = __instanceId || `SelectSeparator_${Math.random().toString(36).slice(2, 8)}`
  const selectSeparatorClasses = '-mx-1 my-1 h-px bg-border'

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof className !== 'function' && !(typeof className === 'object' && className !== null && 'isEscaped' in className)) __hydrateProps['className'] = className
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="select-separator" role="separator" className={`${selectSeparatorClasses} ${className}`} {...props} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0" />
  )
}
