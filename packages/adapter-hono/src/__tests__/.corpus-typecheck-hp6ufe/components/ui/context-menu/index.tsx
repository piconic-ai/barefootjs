import { createContext, useContext, createSignal, createMemo, createEffect, createPortal, isSSRPortal, findSiblingSlot, provideContextSSR } from '@barefootjs/hono/client-shim'
import type { HTMLBaseAttributes } from '@barefootjs/jsx'
import type { Child } from '../../../types'
import { CheckIcon, ChevronRightIcon } from '../icon'
import { bfComment } from '@barefootjs/hono/utils'

interface ContextMenuContextValue {
  open: () => boolean
  onOpenChange: (open: boolean) => void
  position: () => { x: number; y: number }
  setPosition: (pos: { x: number; y: number }) => void
}

const ContextMenuContext = createContext<ContextMenuContextValue>()

interface ContextMenuSubContextValue {
  subOpen: () => boolean
  onSubOpenChange: (open: boolean) => void
}

const ContextMenuSubContext = createContext<ContextMenuSubContextValue>()

interface ContextMenuRadioGroupContextValue {
  value: () => string
  onValueChange: (value: string) => void
}

const ContextMenuRadioGroupContext = createContext<ContextMenuRadioGroupContextValue>()

const contextMenuContentBaseClasses = 'fixed z-50 min-w-[8rem] rounded-md border bg-popover p-1 shadow-md transform-gpu origin-top transition-[opacity,transform] duration-normal ease-out'

const contextMenuContentOpenClasses = 'opacity-100 scale-100'

const contextMenuContentClosedClasses = 'opacity-0 scale-95 pointer-events-none'

const contextMenuItemBaseClasses = 'relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden'

const contextMenuItemDefaultClasses = 'text-popover-foreground hover:bg-accent/50 focus:bg-accent focus:text-accent-foreground'

const contextMenuItemDisabledClasses = 'pointer-events-none opacity-50'

const contextMenuItemDestructiveClasses = 'text-destructive hover:bg-accent/50 focus:bg-accent focus:text-destructive'

const contextMenuCheckableItemClasses = 'relative flex cursor-pointer select-none items-center gap-2 rounded-sm py-1.5 pl-8 pr-2 text-sm outline-hidden'

const contextMenuIndicatorClasses = 'absolute left-2 flex size-3.5 shrink-0 items-center justify-center'

const contextMenuSubTriggerClasses = 'relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden'

const contextMenuSubContentBaseClasses = 'absolute z-50 min-w-[8rem] rounded-md border bg-popover p-1 shadow-md'

const contextMenuLabelClasses = 'px-2 py-1.5 text-sm font-semibold text-foreground'

const contextMenuSeparatorClasses = '-mx-1 my-1 h-px bg-border'

const contextMenuShortcutClasses = 'ml-auto text-xs tracking-widest text-muted-foreground'

interface ContextMenuProps extends HTMLBaseAttributes {
  /** Whether the context menu is open */
  open?: boolean
  /** Callback when open state should change */
  onOpenChange?: (open: boolean) => void
  /** ContextMenuTrigger and ContextMenuContent */
  children?: Child
}

interface ContextMenuTriggerProps extends HTMLBaseAttributes {
  /** Trigger content (the right-clickable area) */
  children?: Child
}

interface ContextMenuContentProps extends HTMLBaseAttributes {
  /** ContextMenuItem, ContextMenuLabel, ContextMenuSeparator components */
  children?: Child
}

interface ContextMenuItemProps extends HTMLBaseAttributes {
  /** Whether disabled */
  disabled?: boolean
  /** Callback when item is selected (menu auto-closes) */
  onSelect?: () => void
  /** Visual variant */
  variant?: 'default' | 'destructive'
  /** Item content (text, icons, shortcuts) */
  children?: Child
}

interface ContextMenuCheckboxItemProps extends HTMLBaseAttributes {
  /** Whether the checkbox is checked */
  checked?: boolean
  /** Callback when checked state changes */
  onCheckedChange?: (checked: boolean) => void
  /** Whether disabled */
  disabled?: boolean
  /** Item content */
  children?: Child
}

interface ContextMenuRadioGroupProps extends HTMLBaseAttributes {
  /** Currently selected value */
  value?: string
  /** Callback when value changes */
  onValueChange?: (value: string) => void
  /** RadioItem children */
  children?: Child
}

interface ContextMenuRadioItemProps extends HTMLBaseAttributes {
  /** Value for this radio item */
  value: string
  /** Whether disabled */
  disabled?: boolean
  /** Item content */
  children?: Child
}

interface ContextMenuSubProps extends HTMLBaseAttributes {
  /** SubTrigger and SubContent */
  children?: Child
}

interface ContextMenuSubTriggerProps extends HTMLBaseAttributes {
  /** Whether disabled */
  disabled?: boolean
  /** Trigger content */
  children?: Child
}

interface ContextMenuSubContentProps extends HTMLBaseAttributes {
  /** SubContent items */
  children?: Child
}

interface ContextMenuLabelProps extends HTMLBaseAttributes {
  /** Label text */
  children?: Child
}

interface ContextMenuSeparatorProps extends HTMLBaseAttributes {
}

interface ContextMenuShortcutProps extends HTMLBaseAttributes {
  /** Shortcut text (e.g., "Ctrl+Q") */
  children?: Child
}

interface ContextMenuGroupProps extends HTMLBaseAttributes {
  /** Grouped menu items */
  children?: Child
}

type ContextMenuLabelPropsWithHydration = ContextMenuLabelProps & {
  __instanceId?: string
  __bfScope?: string
  __bfChild?: boolean
  __bfParentProps?: string
  __bfParent?: string
  __bfMount?: string
  "data-key"?: string | number
}

type ContextMenuSeparatorPropsWithHydration = ContextMenuSeparatorProps & {
  __instanceId?: string
  __bfScope?: string
  __bfChild?: boolean
  __bfParentProps?: string
  __bfParent?: string
  __bfMount?: string
  "data-key"?: string | number
}

type ContextMenuShortcutPropsWithHydration = ContextMenuShortcutProps & {
  __instanceId?: string
  __bfScope?: string
  __bfChild?: boolean
  __bfParentProps?: string
  __bfParent?: string
  __bfMount?: string
  "data-key"?: string | number
}

type ContextMenuGroupPropsWithHydration = ContextMenuGroupProps & {
  __instanceId?: string
  __bfScope?: string
  __bfChild?: boolean
  __bfParentProps?: string
  __bfParent?: string
  __bfMount?: string
  "data-key"?: string | number
}

export type { ContextMenuProps, ContextMenuTriggerProps, ContextMenuContentProps, ContextMenuItemProps, ContextMenuCheckboxItemProps, ContextMenuRadioGroupProps, ContextMenuRadioItemProps, ContextMenuSubProps, ContextMenuSubTriggerProps, ContextMenuSubContentProps, ContextMenuLabelProps, ContextMenuSeparatorProps, ContextMenuShortcutProps, ContextMenuGroupProps }

export function ContextMenu(__allProps: ContextMenuProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `ContextMenu_${Math.random().toString(36).slice(2, 8)}`
  const position = () => ({ x: 0, y: 0 })
  const setPosition = (..._args: any[]) => {}

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.open !== 'function' && !(typeof props.open === 'object' && props.open !== null && 'isEscaped' in props.open)) __hydrateProps['open'] = props.open
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <>{provideContextSSR(ContextMenuContext, {
      open: () => props.open ?? false,
      onOpenChange: props.onOpenChange ?? (() => {}),
      position,
      setPosition,
    }, <><div data-slot="context-menu" id={props.id} className={props.className ?? ''} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})}>{props.children}</div></>)}</>
  )
}

export function ContextMenuTrigger(__allProps: ContextMenuTriggerProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `ContextMenuTrigger_${Math.random().toString(36).slice(2, 8)}`

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <span data-slot="context-menu-trigger" id={props.id} style="display:contents" bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{props.children}</span>
  )
}

export function ContextMenuContent(__allProps: ContextMenuContentProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `ContextMenuContent_${Math.random().toString(36).slice(2, 8)}`

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="context-menu-content" data-state="closed" role="menu" id={props.id} tabindex={-1} className={`${contextMenuContentBaseClasses} ${contextMenuContentClosedClasses} ${props.className ?? ''}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{props.children}</div>
  )
}

export function ContextMenuItem(__allProps: ContextMenuItemProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `ContextMenuItem_${Math.random().toString(36).slice(2, 8)}`
  const isDisabled = () => props.disabled ?? false
  const isDestructive = () => props.variant === 'destructive'
  const stateClasses = () => isDisabled()
    ? contextMenuItemDisabledClasses
    : isDestructive()
      ? contextMenuItemDestructiveClasses
      : contextMenuItemDefaultClasses

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.disabled !== 'function' && !(typeof props.disabled === 'object' && props.disabled !== null && 'isEscaped' in props.disabled)) __hydrateProps['disabled'] = props.disabled
  if (typeof props.variant !== 'function' && !(typeof props.variant === 'object' && props.variant !== null && 'isEscaped' in props.variant)) __hydrateProps['variant'] = props.variant
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="context-menu-item" role="menuitem" id={props.id} aria-disabled={(isDisabled()) || undefined} tabindex={isDisabled() ? -1 : 0} className={`${contextMenuItemBaseClasses} ${stateClasses()} ${props.className ?? ''}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{props.children}</div>
  )
}

export function ContextMenuCheckboxItem(__allProps: ContextMenuCheckboxItemProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `ContextMenuCheckboxItem_${Math.random().toString(36).slice(2, 8)}`
  const isDisabled = () => props.disabled ?? false

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.checked !== 'function' && !(typeof props.checked === 'object' && props.checked !== null && 'isEscaped' in props.checked)) __hydrateProps['checked'] = props.checked
  if (typeof props.disabled !== 'function' && !(typeof props.disabled === 'object' && props.disabled !== null && 'isEscaped' in props.disabled)) __hydrateProps['disabled'] = props.disabled
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="context-menu-item" role="menuitemcheckbox" id={props.id} aria-checked={String(props.checked ?? false)} aria-disabled={(isDisabled()) || undefined} tabindex={isDisabled() ? -1 : 0} className={`${contextMenuCheckableItemClasses} ${isDisabled() ? contextMenuItemDisabledClasses : contextMenuItemDefaultClasses} ${props.className ?? ''}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s3"><span className={`absolute left-2 flex size-3.5 shrink-0 items-center justify-center`} bf="s2">{(props.checked ?? false) ? <>{bfComment("cond-start:s0")}<CheckIcon className="size-4" __instanceId={`${__scopeId}_s1`} __bfChild={true} __bfParent={__scopeId} __bfMount={'s1'} />{bfComment("cond-end:s0")}</> : <>{bfComment("cond-start:s0")}{bfComment("cond-end:s0")}</>}</span>{props.children}</div>
  )
}

export function ContextMenuRadioGroup(__allProps: ContextMenuRadioGroupProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `ContextMenuRadioGroup_${Math.random().toString(36).slice(2, 8)}`

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.value !== 'function' && !(typeof props.value === 'object' && props.value !== null && 'isEscaped' in props.value)) __hydrateProps['value'] = props.value
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <>{provideContextSSR(ContextMenuRadioGroupContext, {
      value: () => props.value ?? '',
      onValueChange: props.onValueChange ?? (() => {}),
    }, <><div data-slot="context-menu-radio-group" role="group" id={props.id} className={props.className ?? ''} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})}>{props.children}</div></>)}</>
  )
}

export function ContextMenuRadioItem(__allProps: ContextMenuRadioItemProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `ContextMenuRadioItem_${Math.random().toString(36).slice(2, 8)}`
  const isDisabled = () => props.disabled ?? false

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.value !== 'function' && !(typeof props.value === 'object' && props.value !== null && 'isEscaped' in props.value)) __hydrateProps['value'] = props.value
  if (typeof props.disabled !== 'function' && !(typeof props.disabled === 'object' && props.disabled !== null && 'isEscaped' in props.disabled)) __hydrateProps['disabled'] = props.disabled
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="context-menu-item" role="menuitemradio" id={props.id} aria-checked="false" aria-disabled={(isDisabled()) || undefined} tabindex={isDisabled() ? -1 : 0} className={`${contextMenuCheckableItemClasses} ${isDisabled() ? contextMenuItemDisabledClasses : contextMenuItemDefaultClasses} ${props.className ?? ''}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0"><span className={`absolute left-2 flex size-3.5 shrink-0 items-center justify-center`} data-slot="context-menu-radio-indicator" />{props.children}</div>
  )
}

export function ContextMenuSub(__allProps: ContextMenuSubProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `ContextMenuSub_${Math.random().toString(36).slice(2, 8)}`
  const subOpen = () => false
  const setSubOpen = (..._args: any[]) => {}

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <>{provideContextSSR(ContextMenuSubContext, {
      subOpen,
      onSubOpenChange: setSubOpen,
    }, <><div data-slot="context-menu-sub" id={props.id} className={`relative ${props.className ?? ''}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})}>{props.children}</div></>)}</>
  )
}

export function ContextMenuSubTrigger(__allProps: ContextMenuSubTriggerProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `ContextMenuSubTrigger_${Math.random().toString(36).slice(2, 8)}`
  const isDisabled = props.disabled ?? false

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.disabled !== 'function' && !(typeof props.disabled === 'object' && props.disabled !== null && 'isEscaped' in props.disabled)) __hydrateProps['disabled'] = props.disabled
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="context-menu-item" data-sub-trigger="true" role="menuitem" id={props.id} aria-haspopup="menu" aria-expanded="false" aria-disabled={(isDisabled) || undefined} tabindex={isDisabled ? -1 : 0} className={`${contextMenuSubTriggerClasses} ${isDisabled ? contextMenuItemDisabledClasses : contextMenuItemDefaultClasses} ${props.className ?? ''}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s1">{props.children}<ChevronRightIcon className="ml-auto size-4" __instanceId={`${__scopeId}_s0`} __bfChild={true} __bfParent={__scopeId} __bfMount={'s0'} /></div>
  )
}

export function ContextMenuSubContent(__allProps: ContextMenuSubContentProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `ContextMenuSubContent_${Math.random().toString(36).slice(2, 8)}`

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="context-menu-sub-content" data-state="closed" role="menu" id={props.id} tabindex={-1} style="display:none" className={`${contextMenuSubContentBaseClasses} left-full top-0 ${props.className ?? ''}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{props.children}</div>
  )
}

export function ContextMenuLabel({ children, className = '', __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props }: ContextMenuLabelPropsWithHydration = {} as ContextMenuLabelPropsWithHydration) {
  const __scopeId = __instanceId || `ContextMenuLabel_${Math.random().toString(36).slice(2, 8)}`

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof children !== 'function' && !(typeof children === 'object' && children !== null && 'isEscaped' in children)) __hydrateProps['children'] = children
  if (typeof className !== 'function' && !(typeof className === 'object' && className !== null && 'isEscaped' in className)) __hydrateProps['className'] = className
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="context-menu-label" className={`${contextMenuLabelClasses} ${className}`} {...props} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{children}</div>
  )
}

export function ContextMenuSeparator({ className = '', __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props }: ContextMenuSeparatorPropsWithHydration = {} as ContextMenuSeparatorPropsWithHydration) {
  const __scopeId = __instanceId || `ContextMenuSeparator_${Math.random().toString(36).slice(2, 8)}`

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof className !== 'function' && !(typeof className === 'object' && className !== null && 'isEscaped' in className)) __hydrateProps['className'] = className
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="context-menu-separator" role="separator" className={`${contextMenuSeparatorClasses} ${className}`} {...props} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0" />
  )
}

export function ContextMenuShortcut({ children, className = '', __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props }: ContextMenuShortcutPropsWithHydration = {} as ContextMenuShortcutPropsWithHydration) {
  const __scopeId = __instanceId || `ContextMenuShortcut_${Math.random().toString(36).slice(2, 8)}`

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof children !== 'function' && !(typeof children === 'object' && children !== null && 'isEscaped' in children)) __hydrateProps['children'] = children
  if (typeof className !== 'function' && !(typeof className === 'object' && className !== null && 'isEscaped' in className)) __hydrateProps['className'] = className
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <span data-slot="context-menu-shortcut" className={`${contextMenuShortcutClasses} ${className}`} {...props} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{children}</span>
  )
}

export function ContextMenuGroup({ children, className = '', __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props }: ContextMenuGroupPropsWithHydration = {} as ContextMenuGroupPropsWithHydration) {
  const __scopeId = __instanceId || `ContextMenuGroup_${Math.random().toString(36).slice(2, 8)}`

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof children !== 'function' && !(typeof children === 'object' && children !== null && 'isEscaped' in children)) __hydrateProps['children'] = children
  if (typeof className !== 'function' && !(typeof className === 'object' && className !== null && 'isEscaped' in className)) __hydrateProps['className'] = className
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="context-menu-group" role="group" className={className} {...props} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{children}</div>
  )
}