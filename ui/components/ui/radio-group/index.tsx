"use client"

/**
 * RadioGroup Component
 *
 * A set of checkable buttons where only one can be checked at a time.
 * Supports both controlled and uncontrolled modes.
 * Inspired by shadcn/ui with CSS variable theming support.
 *
 * @example Uncontrolled (internal state)
 * ```tsx
 * <RadioGroup defaultValue="default">
 *   <RadioGroupItem value="default" />
 *   <RadioGroupItem value="comfortable" />
 *   <RadioGroupItem value="compact" />
 * </RadioGroup>
 * ```
 *
 * @example Controlled (external state)
 * ```tsx
 * <RadioGroup value={selected()} onValueChange={setSelected}>
 *   <RadioGroupItem value="option-1" />
 *   <RadioGroupItem value="option-2" />
 * </RadioGroup>
 * ```
 */

import type { HTMLBaseAttributes, ButtonHTMLAttributes } from '@barefootjs/jsx'
import { createContext, useContext, createSignal, createEffect, createMemo } from '@barefootjs/client'
import type { Child } from '../../../types'

// Context for parent-child state sharing
interface RadioGroupContextValue {
  value: () => string
  onValueChange: (value: string) => void
  disabled: () => boolean
}

const RadioGroupContext = createContext<RadioGroupContextValue>()

// CSS classes for RadioGroupItem (matching shadcn/ui)
const itemBaseClasses = 'relative flex aspect-square size-4 shrink-0 rounded-full border border-input outline-none transition-[color,box-shadow]'
const itemFocusClasses = 'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'
const itemStateClasses = '[&[data-state=checked]]:border-primary [&[data-state=checked]]:bg-primary [&[data-state=checked]]:text-primary-foreground dark:bg-input/30 dark:[&[data-state=checked]]:bg-primary'
const itemErrorClasses = 'aria-[invalid]:border-destructive aria-[invalid]:ring-3 aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40'
const itemDisabledClasses = 'disabled:cursor-not-allowed disabled:opacity-50'
const itemClasses = `${itemBaseClasses} ${itemFocusClasses} ${itemStateClasses} ${itemErrorClasses} ${itemDisabledClasses}`

/**
 * Props for the RadioGroup component.
 */
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

/**
 * RadioGroup component for single selection.
 * Manages value state and provides context to RadioGroupItem children.
 */
function RadioGroup(props: RadioGroupProps) {
  // Internal state for uncontrolled mode
  const [internalValue, setInternalValue] = createSignal(props.defaultValue ?? '')

  // Controlled state
  const [controlledValue, setControlledValue] = createSignal<string | undefined>(props.value)

  // Track if component is in controlled mode
  const isControlled = createMemo(() => props.value !== undefined)

  // Determine current value
  const currentValue = createMemo(() => isControlled() ? (controlledValue() ?? '') : internalValue())

  return (
    <RadioGroupContext.Provider value={{
      value: currentValue,
      onValueChange: (newValue: string) => {
        if (isControlled()) {
          setControlledValue(newValue)
        } else {
          setInternalValue(newValue)
        }
        props.onValueChange?.(newValue)
      },
      disabled: () => props.disabled ?? false,
    }}>
      <div
        data-slot="radio-group"
        role="radiogroup"
        id={props.id}
        className={`grid gap-3 ${props.className ?? ''}`}
      >
        {props.children}
      </div>
    </RadioGroupContext.Provider>
  )
}

/**
 * Props for the RadioGroupItem component.
 */
interface RadioGroupItemProps extends ButtonHTMLAttributes {
  /** Value for this radio item. */
  value: string
  /** Whether this item is disabled. */
  disabled?: boolean
  /**
   * Whether this item is the group's initial selection. Pass `true` on
   * the item whose `value` matches the parent RadioGroup's `defaultValue`
   * (or its initial `value` in controlled mode) so `aria-checked` /
   * `data-state` / the indicator dot render correctly in the
   * server-rendered HTML, instead of "unchecked" being corrected by the
   * `ref`-mount effect only after hydration.
   */
  defaultChecked?: boolean
}

/**
 * RadioGroupItem component.
 * A single radio button within a RadioGroup.
 */
function RadioGroupItem(props: RadioGroupItemProps) {
  const handleMount = (el: HTMLElement) => {
    const ctx = useContext(RadioGroupContext)

    createEffect(() => {
      const isSelected = ctx.value() === props.value
      el.setAttribute('aria-checked', String(isSelected))
      el.setAttribute('data-state', isSelected ? 'checked' : 'unchecked')

      // Reflect group-level disabled onto the button element
      const isDisabled = props.disabled || ctx.disabled()
      if (isDisabled) {
        el.setAttribute('disabled', '')
      } else {
        el.removeAttribute('disabled')
      }

      // Update indicator dot visibility
      const indicator = el.querySelector('[data-slot="radio-group-indicator"]') as HTMLElement
      if (indicator) {
        indicator.style.display = isSelected ? 'flex' : 'none'
      }
    })

    el.addEventListener('click', () => {
      if (el.hasAttribute('disabled') || ctx.disabled()) return
      ctx.onValueChange(props.value)
    })
  }

  return (
    <button
      data-slot="radio-group-item"
      data-state={props.defaultChecked ? 'checked' : 'unchecked'}
      role="radio"
      aria-checked={props.defaultChecked ? 'true' : 'false'}
      disabled={props.disabled ?? false}
      id={props.id}
      className={`${itemClasses} ${props.className ?? ''}`}
      ref={handleMount}
    >
      <span data-slot="radio-group-indicator" className="flex size-4 items-center justify-center" style={props.defaultChecked ? 'display:flex' : 'display:none'}>
        <span className="absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-foreground" />
      </span>
    </button>
  )
}

export { RadioGroup, RadioGroupItem }
export type { RadioGroupProps, RadioGroupItemProps }
