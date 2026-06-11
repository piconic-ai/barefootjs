/** @jsxImportSource hono/jsx */
import { createContext, useContext, createSignal, createMemo, createEffect, createPortal, isSSRPortal, findSiblingSlot, provideContextSSR } from '@barefootjs/hono/client-shim'
import type { ButtonHTMLAttributes, HTMLBaseAttributes } from '@barefootjs/jsx'
import type { Child } from '../../../types'
import { CheckIcon, ChevronRightIcon } from '../icon'
import { bfComment } from '@barefootjs/hono/utils'

const DropdownMenuContext = createContext<DropdownMenuContextValue>()
const DropdownMenuSubContext = createContext<DropdownMenuSubContextValue>()
const DropdownMenuRadioGroupContext = createContext<DropdownMenuRadioGroupContextValue>()

interface DropdownMenuProps extends HTMLBaseAttributes {
  /** Whether the dropdown menu is open */
  open?: boolean
  /** Callback when open state should change */
  onOpenChange?: (open: boolean) => void
  /** DropdownMenuTrigger and DropdownMenuContent */
  children?: Child
}
interface DropdownMenuTriggerProps extends ButtonHTMLAttributes {
  /** Whether disabled */
  disabled?: boolean
  /** Render child element as trigger instead of built-in button */
  asChild?: boolean
  /** Trigger content (any element: button, avatar, icon, etc.) */
  children?: Child
}
interface DropdownMenuContentProps extends HTMLBaseAttributes {
  /** DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator components */
  children?: Child
  /** Alignment relative to trigger */
  align?: 'start' | 'end'
}
interface DropdownMenuItemProps extends HTMLBaseAttributes {
  /** Whether disabled */
  disabled?: boolean
  /** Callback when item is selected (menu auto-closes) */
  onSelect?: () => void
  /** Visual variant */
  variant?: 'default' | 'destructive'
  /** Item content (text, icons, shortcuts) */
  children?: Child
}
interface DropdownMenuCheckboxItemProps extends HTMLBaseAttributes {
  /** Whether the checkbox is checked */
  checked?: boolean
  /** Callback when checked state changes */
  onCheckedChange?: (checked: boolean) => void
  /** Whether disabled */
  disabled?: boolean
  /** Item content */
  children?: Child
}
interface DropdownMenuRadioGroupProps extends HTMLBaseAttributes {
  /** Currently selected value */
  value?: string
  /** Callback when value changes */
  onValueChange?: (value: string) => void
  /** RadioItem children */
  children?: Child
}
interface DropdownMenuRadioItemProps extends HTMLBaseAttributes {
  /** Value for this radio item */
  value: string
  /** Whether disabled */
  disabled?: boolean
  /** Item content */
  children?: Child
}
interface DropdownMenuSubProps extends HTMLBaseAttributes {
  /** SubTrigger and SubContent */
  children?: Child
}
interface DropdownMenuSubTriggerProps extends HTMLBaseAttributes {
  /** Whether disabled */
  disabled?: boolean
  /** Trigger content */
  children?: Child
}
interface DropdownMenuSubContentProps extends HTMLBaseAttributes {
  /** SubContent items */
  children?: Child
}
interface DropdownMenuLabelProps extends HTMLBaseAttributes {
  /** Label text */
  children?: Child
}
interface DropdownMenuSeparatorProps extends HTMLBaseAttributes {
}
interface DropdownMenuShortcutProps extends HTMLBaseAttributes {
  /** Shortcut text (e.g., "Ctrl+Q") */
  children?: Child
}
interface DropdownMenuGroupProps extends HTMLBaseAttributes {
  /** Grouped menu items */
  children?: Child
}

interface DropdownMenuProps extends HTMLBaseAttributes {
  /** Whether the dropdown menu is open */
  open?: boolean
  /** Callback when open state should change */
  onOpenChange?: (open: boolean) => void
  /** DropdownMenuTrigger and DropdownMenuContent */
  children?: Child
}
interface DropdownMenuTriggerProps extends ButtonHTMLAttributes {
  /** Whether disabled */
  disabled?: boolean
  /** Render child element as trigger instead of built-in button */
  asChild?: boolean
  /** Trigger content (any element: button, avatar, icon, etc.) */
  children?: Child
}
interface DropdownMenuContentProps extends HTMLBaseAttributes {
  /** DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator components */
  children?: Child
  /** Alignment relative to trigger */
  align?: 'start' | 'end'
}
interface DropdownMenuItemProps extends HTMLBaseAttributes {
  /** Whether disabled */
  disabled?: boolean
  /** Callback when item is selected (menu auto-closes) */
  onSelect?: () => void
  /** Visual variant */
  variant?: 'default' | 'destructive'
  /** Item content (text, icons, shortcuts) */
  children?: Child
}
interface DropdownMenuCheckboxItemProps extends HTMLBaseAttributes {
  /** Whether the checkbox is checked */
  checked?: boolean
  /** Callback when checked state changes */
  onCheckedChange?: (checked: boolean) => void
  /** Whether disabled */
  disabled?: boolean
  /** Item content */
  children?: Child
}
interface DropdownMenuRadioGroupProps extends HTMLBaseAttributes {
  /** Currently selected value */
  value?: string
  /** Callback when value changes */
  onValueChange?: (value: string) => void
  /** RadioItem children */
  children?: Child
}
interface DropdownMenuRadioItemProps extends HTMLBaseAttributes {
  /** Value for this radio item */
  value: string
  /** Whether disabled */
  disabled?: boolean
  /** Item content */
  children?: Child
}
interface DropdownMenuSubProps extends HTMLBaseAttributes {
  /** SubTrigger and SubContent */
  children?: Child
}
interface DropdownMenuSubTriggerProps extends HTMLBaseAttributes {
  /** Whether disabled */
  disabled?: boolean
  /** Trigger content */
  children?: Child
}
interface DropdownMenuSubContentProps extends HTMLBaseAttributes {
  /** SubContent items */
  children?: Child
}
interface DropdownMenuLabelProps extends HTMLBaseAttributes {
  /** Label text */
  children?: Child
}
interface DropdownMenuSeparatorProps extends HTMLBaseAttributes {
}
interface DropdownMenuShortcutProps extends HTMLBaseAttributes {
  /** Shortcut text (e.g., "Ctrl+Q") */
  children?: Child
}
interface DropdownMenuGroupProps extends HTMLBaseAttributes {
  /** Grouped menu items */
  children?: Child
}

type DropdownMenuLabelPropsWithHydration = DropdownMenuLabelProps & {
  __instanceId?: string
  __bfScope?: string
  __bfChild?: boolean
  __bfParentProps?: string
  __bfParent?: string
  __bfMount?: string
  "data-key"?: string | number
}

interface DropdownMenuProps extends HTMLBaseAttributes {
  /** Whether the dropdown menu is open */
  open?: boolean
  /** Callback when open state should change */
  onOpenChange?: (open: boolean) => void
  /** DropdownMenuTrigger and DropdownMenuContent */
  children?: Child
}
interface DropdownMenuTriggerProps extends ButtonHTMLAttributes {
  /** Whether disabled */
  disabled?: boolean
  /** Render child element as trigger instead of built-in button */
  asChild?: boolean
  /** Trigger content (any element: button, avatar, icon, etc.) */
  children?: Child
}
interface DropdownMenuContentProps extends HTMLBaseAttributes {
  /** DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator components */
  children?: Child
  /** Alignment relative to trigger */
  align?: 'start' | 'end'
}
interface DropdownMenuItemProps extends HTMLBaseAttributes {
  /** Whether disabled */
  disabled?: boolean
  /** Callback when item is selected (menu auto-closes) */
  onSelect?: () => void
  /** Visual variant */
  variant?: 'default' | 'destructive'
  /** Item content (text, icons, shortcuts) */
  children?: Child
}
interface DropdownMenuCheckboxItemProps extends HTMLBaseAttributes {
  /** Whether the checkbox is checked */
  checked?: boolean
  /** Callback when checked state changes */
  onCheckedChange?: (checked: boolean) => void
  /** Whether disabled */
  disabled?: boolean
  /** Item content */
  children?: Child
}
interface DropdownMenuRadioGroupProps extends HTMLBaseAttributes {
  /** Currently selected value */
  value?: string
  /** Callback when value changes */
  onValueChange?: (value: string) => void
  /** RadioItem children */
  children?: Child
}
interface DropdownMenuRadioItemProps extends HTMLBaseAttributes {
  /** Value for this radio item */
  value: string
  /** Whether disabled */
  disabled?: boolean
  /** Item content */
  children?: Child
}
interface DropdownMenuSubProps extends HTMLBaseAttributes {
  /** SubTrigger and SubContent */
  children?: Child
}
interface DropdownMenuSubTriggerProps extends HTMLBaseAttributes {
  /** Whether disabled */
  disabled?: boolean
  /** Trigger content */
  children?: Child
}
interface DropdownMenuSubContentProps extends HTMLBaseAttributes {
  /** SubContent items */
  children?: Child
}
interface DropdownMenuLabelProps extends HTMLBaseAttributes {
  /** Label text */
  children?: Child
}
interface DropdownMenuSeparatorProps extends HTMLBaseAttributes {
}
interface DropdownMenuShortcutProps extends HTMLBaseAttributes {
  /** Shortcut text (e.g., "Ctrl+Q") */
  children?: Child
}
interface DropdownMenuGroupProps extends HTMLBaseAttributes {
  /** Grouped menu items */
  children?: Child
}

type DropdownMenuSeparatorPropsWithHydration = DropdownMenuSeparatorProps & {
  __instanceId?: string
  __bfScope?: string
  __bfChild?: boolean
  __bfParentProps?: string
  __bfParent?: string
  __bfMount?: string
  "data-key"?: string | number
}

interface DropdownMenuProps extends HTMLBaseAttributes {
  /** Whether the dropdown menu is open */
  open?: boolean
  /** Callback when open state should change */
  onOpenChange?: (open: boolean) => void
  /** DropdownMenuTrigger and DropdownMenuContent */
  children?: Child
}
interface DropdownMenuTriggerProps extends ButtonHTMLAttributes {
  /** Whether disabled */
  disabled?: boolean
  /** Render child element as trigger instead of built-in button */
  asChild?: boolean
  /** Trigger content (any element: button, avatar, icon, etc.) */
  children?: Child
}
interface DropdownMenuContentProps extends HTMLBaseAttributes {
  /** DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator components */
  children?: Child
  /** Alignment relative to trigger */
  align?: 'start' | 'end'
}
interface DropdownMenuItemProps extends HTMLBaseAttributes {
  /** Whether disabled */
  disabled?: boolean
  /** Callback when item is selected (menu auto-closes) */
  onSelect?: () => void
  /** Visual variant */
  variant?: 'default' | 'destructive'
  /** Item content (text, icons, shortcuts) */
  children?: Child
}
interface DropdownMenuCheckboxItemProps extends HTMLBaseAttributes {
  /** Whether the checkbox is checked */
  checked?: boolean
  /** Callback when checked state changes */
  onCheckedChange?: (checked: boolean) => void
  /** Whether disabled */
  disabled?: boolean
  /** Item content */
  children?: Child
}
interface DropdownMenuRadioGroupProps extends HTMLBaseAttributes {
  /** Currently selected value */
  value?: string
  /** Callback when value changes */
  onValueChange?: (value: string) => void
  /** RadioItem children */
  children?: Child
}
interface DropdownMenuRadioItemProps extends HTMLBaseAttributes {
  /** Value for this radio item */
  value: string
  /** Whether disabled */
  disabled?: boolean
  /** Item content */
  children?: Child
}
interface DropdownMenuSubProps extends HTMLBaseAttributes {
  /** SubTrigger and SubContent */
  children?: Child
}
interface DropdownMenuSubTriggerProps extends HTMLBaseAttributes {
  /** Whether disabled */
  disabled?: boolean
  /** Trigger content */
  children?: Child
}
interface DropdownMenuSubContentProps extends HTMLBaseAttributes {
  /** SubContent items */
  children?: Child
}
interface DropdownMenuLabelProps extends HTMLBaseAttributes {
  /** Label text */
  children?: Child
}
interface DropdownMenuSeparatorProps extends HTMLBaseAttributes {
}
interface DropdownMenuShortcutProps extends HTMLBaseAttributes {
  /** Shortcut text (e.g., "Ctrl+Q") */
  children?: Child
}
interface DropdownMenuGroupProps extends HTMLBaseAttributes {
  /** Grouped menu items */
  children?: Child
}

type DropdownMenuShortcutPropsWithHydration = DropdownMenuShortcutProps & {
  __instanceId?: string
  __bfScope?: string
  __bfChild?: boolean
  __bfParentProps?: string
  __bfParent?: string
  __bfMount?: string
  "data-key"?: string | number
}

interface DropdownMenuProps extends HTMLBaseAttributes {
  /** Whether the dropdown menu is open */
  open?: boolean
  /** Callback when open state should change */
  onOpenChange?: (open: boolean) => void
  /** DropdownMenuTrigger and DropdownMenuContent */
  children?: Child
}
interface DropdownMenuTriggerProps extends ButtonHTMLAttributes {
  /** Whether disabled */
  disabled?: boolean
  /** Render child element as trigger instead of built-in button */
  asChild?: boolean
  /** Trigger content (any element: button, avatar, icon, etc.) */
  children?: Child
}
interface DropdownMenuContentProps extends HTMLBaseAttributes {
  /** DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator components */
  children?: Child
  /** Alignment relative to trigger */
  align?: 'start' | 'end'
}
interface DropdownMenuItemProps extends HTMLBaseAttributes {
  /** Whether disabled */
  disabled?: boolean
  /** Callback when item is selected (menu auto-closes) */
  onSelect?: () => void
  /** Visual variant */
  variant?: 'default' | 'destructive'
  /** Item content (text, icons, shortcuts) */
  children?: Child
}
interface DropdownMenuCheckboxItemProps extends HTMLBaseAttributes {
  /** Whether the checkbox is checked */
  checked?: boolean
  /** Callback when checked state changes */
  onCheckedChange?: (checked: boolean) => void
  /** Whether disabled */
  disabled?: boolean
  /** Item content */
  children?: Child
}
interface DropdownMenuRadioGroupProps extends HTMLBaseAttributes {
  /** Currently selected value */
  value?: string
  /** Callback when value changes */
  onValueChange?: (value: string) => void
  /** RadioItem children */
  children?: Child
}
interface DropdownMenuRadioItemProps extends HTMLBaseAttributes {
  /** Value for this radio item */
  value: string
  /** Whether disabled */
  disabled?: boolean
  /** Item content */
  children?: Child
}
interface DropdownMenuSubProps extends HTMLBaseAttributes {
  /** SubTrigger and SubContent */
  children?: Child
}
interface DropdownMenuSubTriggerProps extends HTMLBaseAttributes {
  /** Whether disabled */
  disabled?: boolean
  /** Trigger content */
  children?: Child
}
interface DropdownMenuSubContentProps extends HTMLBaseAttributes {
  /** SubContent items */
  children?: Child
}
interface DropdownMenuLabelProps extends HTMLBaseAttributes {
  /** Label text */
  children?: Child
}
interface DropdownMenuSeparatorProps extends HTMLBaseAttributes {
}
interface DropdownMenuShortcutProps extends HTMLBaseAttributes {
  /** Shortcut text (e.g., "Ctrl+Q") */
  children?: Child
}
interface DropdownMenuGroupProps extends HTMLBaseAttributes {
  /** Grouped menu items */
  children?: Child
}

type DropdownMenuGroupPropsWithHydration = DropdownMenuGroupProps & {
  __instanceId?: string
  __bfScope?: string
  __bfChild?: boolean
  __bfParentProps?: string
  __bfParent?: string
  __bfMount?: string
  "data-key"?: string | number
}

export type { DropdownMenuProps, DropdownMenuTriggerProps, DropdownMenuContentProps, DropdownMenuItemProps, DropdownMenuCheckboxItemProps, DropdownMenuRadioGroupProps, DropdownMenuRadioItemProps, DropdownMenuSubProps, DropdownMenuSubTriggerProps, DropdownMenuSubContentProps, DropdownMenuLabelProps, DropdownMenuSeparatorProps, DropdownMenuShortcutProps, DropdownMenuGroupProps }

export function DropdownMenu(__allProps: DropdownMenuProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `DropdownMenu_${Math.random().toString(36).slice(2, 8)}`
  const dropdownMenuClasses = 'relative inline-block'

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.open !== 'function' && !(typeof props.open === 'object' && props.open !== null && 'isEscaped' in props.open)) __hydrateProps['open'] = props.open
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <>{provideContextSSR(DropdownMenuContext, {
      open: () => props.open ?? false,
      onOpenChange: props.onOpenChange ?? (() => {}),
    }, <><div data-slot="dropdown-menu" id={props.id} className={`${dropdownMenuClasses} ${props.className ?? ''}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})}>{props.children}</div></>)}</>
  )
}

export function DropdownMenuTrigger(__allProps: DropdownMenuTriggerProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `DropdownMenuTrigger_${Math.random().toString(36).slice(2, 8)}`
  const dropdownMenuTriggerClasses = 'inline-flex items-center disabled:pointer-events-none disabled:opacity-50'

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.disabled !== 'function' && !(typeof props.disabled === 'object' && props.disabled !== null && 'isEscaped' in props.disabled)) __hydrateProps['disabled'] = props.disabled
  if (typeof props.asChild !== 'function' && !(typeof props.asChild === 'object' && props.asChild !== null && 'isEscaped' in props.asChild)) __hydrateProps['asChild'] = props.asChild
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  if (props.asChild) {
    return (
      <span data-slot="dropdown-menu-trigger" aria-expanded="false" aria-haspopup="menu" style="display:contents" bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s1">{props.children}</span>
    )
  }
  return (
    <button data-slot="dropdown-menu-trigger" type="button" id={props.id} aria-expanded="false" aria-haspopup="menu" disabled={(props.disabled ?? false) || undefined} className={`${dropdownMenuTriggerClasses} ${props.className ?? ''}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{props.children}</button>
  )
}

export function DropdownMenuContent(__allProps: DropdownMenuContentProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `DropdownMenuContent_${Math.random().toString(36).slice(2, 8)}`
  const dropdownMenuContentBaseClasses = 'fixed z-50 min-w-[8rem] rounded-md border bg-popover p-1 shadow-md transform-gpu origin-top transition-[opacity,transform] duration-normal ease-out'
  const dropdownMenuContentClosedClasses = 'opacity-0 scale-95 pointer-events-none'

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  if (typeof props.align !== 'function' && !(typeof props.align === 'object' && props.align !== null && 'isEscaped' in props.align)) __hydrateProps['align'] = props.align
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="dropdown-menu-content" data-state="closed" role="menu" id={props.id} tabindex={-1} className={`${dropdownMenuContentBaseClasses} ${dropdownMenuContentClosedClasses} ${props.className ?? ''}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{props.children}</div>
  )
}

export function DropdownMenuItem(__allProps: DropdownMenuItemProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `DropdownMenuItem_${Math.random().toString(36).slice(2, 8)}`
  const isDisabled = () => props.disabled ?? false
  const isDestructive = () => props.variant === 'destructive'
  const stateClasses = () => isDisabled()
    ? dropdownMenuItemDisabledClasses
    : isDestructive()
      ? dropdownMenuItemDestructiveClasses
      : dropdownMenuItemDefaultClasses
  const dropdownMenuItemBaseClasses = 'relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden'
  const dropdownMenuItemDefaultClasses = 'text-popover-foreground hover:bg-accent/50 focus:bg-accent focus:text-accent-foreground'
  const dropdownMenuItemDisabledClasses = 'pointer-events-none opacity-50'
  const dropdownMenuItemDestructiveClasses = 'text-destructive hover:bg-accent/50 focus:bg-accent focus:text-destructive'

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.disabled !== 'function' && !(typeof props.disabled === 'object' && props.disabled !== null && 'isEscaped' in props.disabled)) __hydrateProps['disabled'] = props.disabled
  if (typeof props.variant !== 'function' && !(typeof props.variant === 'object' && props.variant !== null && 'isEscaped' in props.variant)) __hydrateProps['variant'] = props.variant
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="dropdown-menu-item" role="menuitem" id={props.id} aria-disabled={(isDisabled()) || undefined} tabindex={isDisabled() ? -1 : 0} className={`${dropdownMenuItemBaseClasses} ${stateClasses()} ${props.className ?? ''}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{props.children}</div>
  )
}

export function DropdownMenuCheckboxItem(__allProps: DropdownMenuCheckboxItemProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `DropdownMenuCheckboxItem_${Math.random().toString(36).slice(2, 8)}`
  const isDisabled = () => props.disabled ?? false
  const dropdownMenuItemDefaultClasses = 'text-popover-foreground hover:bg-accent/50 focus:bg-accent focus:text-accent-foreground'
  const dropdownMenuItemDisabledClasses = 'pointer-events-none opacity-50'
  const dropdownMenuCheckableItemClasses = 'relative flex cursor-pointer select-none items-center gap-2 rounded-sm py-1.5 pl-8 pr-2 text-sm outline-hidden'

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.checked !== 'function' && !(typeof props.checked === 'object' && props.checked !== null && 'isEscaped' in props.checked)) __hydrateProps['checked'] = props.checked
  if (typeof props.disabled !== 'function' && !(typeof props.disabled === 'object' && props.disabled !== null && 'isEscaped' in props.disabled)) __hydrateProps['disabled'] = props.disabled
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="dropdown-menu-item" role="menuitemcheckbox" id={props.id} aria-checked={String(props.checked ?? false)} aria-disabled={(isDisabled()) || undefined} tabindex={isDisabled() ? -1 : 0} className={`${dropdownMenuCheckableItemClasses} ${isDisabled() ? dropdownMenuItemDisabledClasses : dropdownMenuItemDefaultClasses} ${props.className ?? ''}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s3"><span className={`absolute left-2 flex size-3.5 shrink-0 items-center justify-center`} bf="s2">{(props.checked ?? false) ? <>{bfComment("cond-start:s0")}<CheckIcon className="size-4" __instanceId={`${__scopeId}_s1`} __bfChild={true} __bfParent={__scopeId} __bfMount={'s1'} />{bfComment("cond-end:s0")}</> : <>{bfComment("cond-start:s0")}{bfComment("cond-end:s0")}</>}</span>{props.children}</div>
  )
}

export function DropdownMenuRadioGroup(__allProps: DropdownMenuRadioGroupProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `DropdownMenuRadioGroup_${Math.random().toString(36).slice(2, 8)}`

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.value !== 'function' && !(typeof props.value === 'object' && props.value !== null && 'isEscaped' in props.value)) __hydrateProps['value'] = props.value
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <>{provideContextSSR(DropdownMenuRadioGroupContext, {
      value: () => props.value ?? '',
      onValueChange: props.onValueChange ?? (() => {}),
    }, <><div data-slot="dropdown-menu-radio-group" role="group" id={props.id} className={props.className ?? ''} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})}>{props.children}</div></>)}</>
  )
}

export function DropdownMenuRadioItem(__allProps: DropdownMenuRadioItemProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `DropdownMenuRadioItem_${Math.random().toString(36).slice(2, 8)}`
  const isDisabled = () => props.disabled ?? false
  const dropdownMenuItemDefaultClasses = 'text-popover-foreground hover:bg-accent/50 focus:bg-accent focus:text-accent-foreground'
  const dropdownMenuItemDisabledClasses = 'pointer-events-none opacity-50'
  const dropdownMenuCheckableItemClasses = 'relative flex cursor-pointer select-none items-center gap-2 rounded-sm py-1.5 pl-8 pr-2 text-sm outline-hidden'

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.value !== 'function' && !(typeof props.value === 'object' && props.value !== null && 'isEscaped' in props.value)) __hydrateProps['value'] = props.value
  if (typeof props.disabled !== 'function' && !(typeof props.disabled === 'object' && props.disabled !== null && 'isEscaped' in props.disabled)) __hydrateProps['disabled'] = props.disabled
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="dropdown-menu-item" role="menuitemradio" id={props.id} aria-checked="false" aria-disabled={(isDisabled()) || undefined} tabindex={isDisabled() ? -1 : 0} className={`${dropdownMenuCheckableItemClasses} ${isDisabled() ? dropdownMenuItemDisabledClasses : dropdownMenuItemDefaultClasses} ${props.className ?? ''}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0"><span className={`absolute left-2 flex size-3.5 shrink-0 items-center justify-center`} data-slot="dropdown-menu-radio-indicator" />{props.children}</div>
  )
}

export function DropdownMenuSub(__allProps: DropdownMenuSubProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `DropdownMenuSub_${Math.random().toString(36).slice(2, 8)}`
  const subOpen = () => false
  const setSubOpen = (..._args: any[]) => {}

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <>{provideContextSSR(DropdownMenuSubContext, {
      subOpen,
      onSubOpenChange: setSubOpen,
    }, <><div data-slot="dropdown-menu-sub" id={props.id} className={`relative ${props.className ?? ''}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})}>{props.children}</div></>)}</>
  )
}

export function DropdownMenuSubTrigger(__allProps: DropdownMenuSubTriggerProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `DropdownMenuSubTrigger_${Math.random().toString(36).slice(2, 8)}`
  const dropdownMenuItemDefaultClasses = 'text-popover-foreground hover:bg-accent/50 focus:bg-accent focus:text-accent-foreground'
  const dropdownMenuItemDisabledClasses = 'pointer-events-none opacity-50'
  const dropdownMenuSubTriggerClasses = 'relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden'
  const isDisabled = props.disabled ?? false

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.disabled !== 'function' && !(typeof props.disabled === 'object' && props.disabled !== null && 'isEscaped' in props.disabled)) __hydrateProps['disabled'] = props.disabled
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="dropdown-menu-item" data-sub-trigger="true" role="menuitem" id={props.id} aria-haspopup="menu" aria-expanded="false" aria-disabled={(isDisabled) || undefined} tabindex={isDisabled ? -1 : 0} className={`${dropdownMenuSubTriggerClasses} ${isDisabled ? dropdownMenuItemDisabledClasses : dropdownMenuItemDefaultClasses} ${props.className ?? ''}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s1">{props.children}<ChevronRightIcon className="ml-auto size-4" __instanceId={`${__scopeId}_s0`} __bfChild={true} __bfParent={__scopeId} __bfMount={'s0'} /></div>
  )
}

export function DropdownMenuSubContent(__allProps: DropdownMenuSubContentProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `DropdownMenuSubContent_${Math.random().toString(36).slice(2, 8)}`
  const dropdownMenuSubContentBaseClasses = 'absolute z-50 min-w-[8rem] rounded-md border bg-popover p-1 shadow-md'

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="dropdown-menu-sub-content" data-state="closed" role="menu" id={props.id} tabindex={-1} style="display:none" className={`${dropdownMenuSubContentBaseClasses} left-full top-0 ${props.className ?? ''}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{props.children}</div>
  )
}

export function DropdownMenuLabel({ children, className = '', __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props }: DropdownMenuLabelPropsWithHydration) {
  const __scopeId = __instanceId || `DropdownMenuLabel_${Math.random().toString(36).slice(2, 8)}`
  const dropdownMenuLabelClasses = 'px-2 py-1.5 text-sm font-semibold text-foreground'

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof children !== 'function' && !(typeof children === 'object' && children !== null && 'isEscaped' in children)) __hydrateProps['children'] = children
  if (typeof className !== 'function' && !(typeof className === 'object' && className !== null && 'isEscaped' in className)) __hydrateProps['className'] = className
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="dropdown-menu-label" className={`${dropdownMenuLabelClasses} ${className}`} {...props} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{children}</div>
  )
}

export function DropdownMenuSeparator({ className = '', __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props }: DropdownMenuSeparatorPropsWithHydration = {} as DropdownMenuSeparatorPropsWithHydration) {
  const __scopeId = __instanceId || `DropdownMenuSeparator_${Math.random().toString(36).slice(2, 8)}`
  const dropdownMenuSeparatorClasses = '-mx-1 my-1 h-px bg-border'

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof className !== 'function' && !(typeof className === 'object' && className !== null && 'isEscaped' in className)) __hydrateProps['className'] = className
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="dropdown-menu-separator" role="separator" className={`${dropdownMenuSeparatorClasses} ${className}`} {...props} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0" />
  )
}

export function DropdownMenuShortcut({ children, className = '', __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props }: DropdownMenuShortcutPropsWithHydration) {
  const __scopeId = __instanceId || `DropdownMenuShortcut_${Math.random().toString(36).slice(2, 8)}`
  const dropdownMenuShortcutClasses = 'ml-auto text-xs tracking-widest text-muted-foreground'

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof children !== 'function' && !(typeof children === 'object' && children !== null && 'isEscaped' in children)) __hydrateProps['children'] = children
  if (typeof className !== 'function' && !(typeof className === 'object' && className !== null && 'isEscaped' in className)) __hydrateProps['className'] = className
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <span data-slot="dropdown-menu-shortcut" className={`${dropdownMenuShortcutClasses} ${className}`} {...props} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{children}</span>
  )
}

export function DropdownMenuGroup({ children, className = '', __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props }: DropdownMenuGroupPropsWithHydration) {
  const __scopeId = __instanceId || `DropdownMenuGroup_${Math.random().toString(36).slice(2, 8)}`

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof children !== 'function' && !(typeof children === 'object' && children !== null && 'isEscaped' in children)) __hydrateProps['children'] = children
  if (typeof className !== 'function' && !(typeof className === 'object' && className !== null && 'isEscaped' in className)) __hydrateProps['className'] = className
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="dropdown-menu-group" role="group" className={className} {...props} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{children}</div>
  )
}
