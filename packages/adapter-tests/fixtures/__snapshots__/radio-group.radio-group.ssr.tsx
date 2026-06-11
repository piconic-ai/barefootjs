/** @jsxImportSource hono/jsx */
import type { HTMLBaseAttributes, ButtonHTMLAttributes } from '@barefootjs/jsx'
import { createContext, useContext, createSignal, createEffect, createMemo, provideContextSSR } from '@barefootjs/hono/client-shim'
import type { Child } from '../../../types'

const RadioGroupContext = createContext<RadioGroupContextValue>()

interface RadioGroupProps extends HTMLBaseAttributes {
  /** Default selected value (for uncontrolled mode). */
  defaultValue?: string
  /** Controlled selected value. When provided, component is in controlled mode. */
  value?: string
  /** Callback when the selected value changes. */
  onValueChange?: (value: string) => void
  /** Whether the entire group is disabled. */
  disabled?: boolean
  /** RadioGroupItem children. */
  children?: Child
}
interface RadioGroupItemProps extends ButtonHTMLAttributes {
  /** Value for this radio item. */
  value: string
  /** Whether this item is disabled. */
  disabled?: boolean
}

export type { RadioGroupProps, RadioGroupItemProps }

export function RadioGroup(__allProps: RadioGroupProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `RadioGroup_${Math.random().toString(36).slice(2, 8)}`
  const internalValue = () => props.defaultValue ?? ''
  const setInternalValue = (..._args: any[]) => {}
  const controlledValue = () => props.value as string | undefined
  const setControlledValue = (..._args: any[]) => {}
  const isControlled = () => props.value !== undefined
  const currentValue = () => isControlled() ? (controlledValue() ?? '') : internalValue()

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.defaultValue !== 'function' && !(typeof props.defaultValue === 'object' && props.defaultValue !== null && 'isEscaped' in props.defaultValue)) __hydrateProps['defaultValue'] = props.defaultValue
  if (typeof props.value !== 'function' && !(typeof props.value === 'object' && props.value !== null && 'isEscaped' in props.value)) __hydrateProps['value'] = props.value
  if (typeof props.disabled !== 'function' && !(typeof props.disabled === 'object' && props.disabled !== null && 'isEscaped' in props.disabled)) __hydrateProps['disabled'] = props.disabled
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <>{provideContextSSR(RadioGroupContext, {
      value: currentValue,
      onValueChange: (newValue) => {
        if (isControlled()) {
          setControlledValue(newValue)
        } else {
          setInternalValue(newValue)
        }
        props.onValueChange?.(newValue)
      },
      disabled: () => props.disabled ?? false,
    }, <><div data-slot="radio-group" role="radiogroup" id={props.id} className={`grid gap-3 ${props.className ?? ''}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})}>{props.children}</div></>)}</>
  )
}

export function RadioGroupItem(__allProps: RadioGroupItemProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `RadioGroupItem_${Math.random().toString(36).slice(2, 8)}`
  const itemBaseClasses = 'relative flex aspect-square size-4 shrink-0 rounded-full border border-input outline-none transition-[color,box-shadow]'
  const itemFocusClasses = 'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'
  const itemStateClasses = '[&[data-state=checked]]:border-primary [&[data-state=checked]]:bg-primary [&[data-state=checked]]:text-primary-foreground dark:bg-input/30 dark:[&[data-state=checked]]:bg-primary'
  const itemErrorClasses = 'aria-[invalid]:border-destructive aria-[invalid]:ring-3 aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40'
  const itemDisabledClasses = 'disabled:cursor-not-allowed disabled:opacity-50'
  const itemClasses = `${itemBaseClasses} ${itemFocusClasses} ${itemStateClasses} ${itemErrorClasses} ${itemDisabledClasses}`

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.value !== 'function' && !(typeof props.value === 'object' && props.value !== null && 'isEscaped' in props.value)) __hydrateProps['value'] = props.value
  if (typeof props.disabled !== 'function' && !(typeof props.disabled === 'object' && props.disabled !== null && 'isEscaped' in props.disabled)) __hydrateProps['disabled'] = props.disabled
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <button data-slot="radio-group-item" data-state="unchecked" role="radio" aria-checked="false" disabled={(props.disabled ?? false) || undefined} id={props.id} className={`${itemClasses} ${props.className ?? ''}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0"><span data-slot="radio-group-indicator" className="flex size-4 items-center justify-center" style="display:none"><span className="absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-foreground" /></span></button>
  )
}
