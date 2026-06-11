/** @jsxImportSource hono/jsx */
import { bfComment } from '@barefootjs/hono/utils'
import type { ButtonHTMLAttributes } from '@barefootjs/jsx'
import { createSignal, createMemo } from '@barefootjs/hono/client-shim'
import { CheckIcon } from '../icon'

interface CheckboxProps extends ButtonHTMLAttributes {
  /**
   * Default checked state (for uncontrolled mode).
   * @default false
   */
  defaultChecked?: boolean
  /**
   * Controlled checked state. When provided, component is in controlled mode.
   */
  checked?: boolean
  /**
   * Whether the checkbox is in an error state.
   * @default false
   */
  error?: boolean
  /**
   * Callback when the checked state changes.
   */
  onCheckedChange?: (checked: boolean) => void
}

export type { CheckboxProps }

export function Checkbox(__allProps: CheckboxProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `Checkbox_${Math.random().toString(36).slice(2, 8)}`
  const internalChecked = () => props.defaultChecked ?? false
  const controlledChecked = () => props.checked as boolean | undefined
  const isControlled = () => props.checked !== undefined
  const isChecked = () => isControlled() ? controlledChecked() : internalChecked()
  const classes = () =>
    `${baseClasses} ${focusClasses} ${errorClasses} ${stateClasses} ${props.className ?? ''} grid place-content-center`
  const baseClasses = 'peer size-4 shrink-0 rounded-[4px] border border-input shadow-xs transition-shadow outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50'
  const focusClasses = 'focus-visible:border-ring focus-visible:ring-ring/50'
  const errorClasses = 'aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40 aria-[invalid]:border-destructive'
  const stateClasses = [
  // Unchecked state
  '[&[data-state=unchecked]]:border-input',
  'dark:[&[data-state=unchecked]]:bg-input/30',
  '[&[data-state=unchecked]]:bg-background',
  // Checked state
  '[&[data-state=checked]]:bg-primary',
  '[&[data-state=checked]]:text-primary-foreground',
  '[&[data-state=checked]]:border-primary',
].join(' ')

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.defaultChecked !== 'function' && !(typeof props.defaultChecked === 'object' && props.defaultChecked !== null && 'isEscaped' in props.defaultChecked)) __hydrateProps['defaultChecked'] = props.defaultChecked
  if (typeof props.checked !== 'function' && !(typeof props.checked === 'object' && props.checked !== null && 'isEscaped' in props.checked)) __hydrateProps['checked'] = props.checked
  if (typeof props.error !== 'function' && !(typeof props.error === 'object' && props.error !== null && 'isEscaped' in props.error)) __hydrateProps['error'] = props.error
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <button data-slot="checkbox" data-state={`${isChecked() ? 'checked' : 'unchecked'}`} role="checkbox" id={props.id} aria-checked={isChecked()} aria-invalid={(props.error) || undefined} disabled={(props.disabled ?? false) || undefined} className={classes()} onClick={() => {}} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s2">{isChecked() ? <>{bfComment("cond-start:s0")}<CheckIcon data-slot="checkbox-indicator" className="size-3.5 text-current" __instanceId={`${__scopeId}_s1`} __bfChild={true} __bfParent={__scopeId} __bfMount={'s1'} />{bfComment("cond-end:s0")}</> : <>{bfComment("cond-start:s0")}{bfComment("cond-end:s0")}</>}</button>
  )
}
