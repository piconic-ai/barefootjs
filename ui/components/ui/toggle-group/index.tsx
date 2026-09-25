"use client"

/**
 * ToggleGroup Component
 *
 * A group of toggle buttons where selection can be single or multiple.
 * Supports both controlled and uncontrolled modes.
 * Inspired by shadcn/ui with CSS variable theming support.
 *
 * @example Single selection (uncontrolled)
 * ```tsx
 * <ToggleGroup type="single" defaultValue="center">
 *   <ToggleGroupItem value="left">Left</ToggleGroupItem>
 *   <ToggleGroupItem value="center">Center</ToggleGroupItem>
 *   <ToggleGroupItem value="right">Right</ToggleGroupItem>
 * </ToggleGroup>
 * ```
 *
 * @example Multiple selection (controlled)
 * ```tsx
 * <ToggleGroup type="multiple" value={formats()} onValueChange={setFormats}>
 *   <ToggleGroupItem value="bold">Bold</ToggleGroupItem>
 *   <ToggleGroupItem value="italic">Italic</ToggleGroupItem>
 * </ToggleGroup>
 * ```
 */

import type { HTMLBaseAttributes, ButtonHTMLAttributes } from '@barefootjs/jsx'
import { createContext, useContext, createSignal, createEffect, createMemo } from '@barefootjs/client'
import type { Child } from '../../../types'

// Toggle styling (same classes as Toggle component — kept independent for standalone installability)
type ToggleVariant = 'default' | 'outline'
type ToggleSize = 'default' | 'sm' | 'lg'

// Base classes from shadcn/ui toggleVariants
const toggleBaseClasses = 'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4 [&_svg]:shrink-0 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40 aria-[invalid]:border-destructive whitespace-nowrap data-[state=on]:bg-accent data-[state=on]:text-accent-foreground hover:bg-muted hover:text-muted-foreground'

// Variant/size classes key off the GROUP root's `data-variant` / `data-size`
// (`group/toggle-group` + `group-data-[…]/toggle-group:`), which the root
// renders from its own props at SSR. An item cannot know the group's
// variant/size at SSR (context is client-only), so styling off item-level
// attributes written on mount would change every item's size/border at the
// hydrate boundary. Kept as static selectors so they stay in the compiled
// className (with layer-components: prefix), avoiding the CSS @layer
// conflicts classes added via classList.add() would hit.
const toggleVariantClasses = 'bg-transparent group-data-[variant=outline]/toggle-group:border group-data-[variant=outline]/toggle-group:border-input group-data-[variant=outline]/toggle-group:shadow-xs group-data-[variant=outline]/toggle-group:hover:bg-accent group-data-[variant=outline]/toggle-group:hover:text-accent-foreground'

const toggleSizeClasses = 'group-data-[size=default]/toggle-group:h-9 group-data-[size=default]/toggle-group:px-2 group-data-[size=default]/toggle-group:min-w-9 group-data-[size=sm]/toggle-group:h-8 group-data-[size=sm]/toggle-group:px-1.5 group-data-[size=sm]/toggle-group:min-w-8 group-data-[size=lg]/toggle-group:h-10 group-data-[size=lg]/toggle-group:px-2.5 group-data-[size=lg]/toggle-group:min-w-10'

// ToggleGroupItem extra classes from shadcn/ui (applied on top of toggle base)
const toggleGroupItemClasses = 'w-auto min-w-0 shrink-0 rounded-none shadow-none first:rounded-l-md last:rounded-r-md focus:z-10 focus-visible:z-10 group-data-[variant=outline]/toggle-group:border-l-0 group-data-[variant=outline]/toggle-group:first:border-l'

function normalizeToArray(value: string | string[] | undefined): string[] {
  if (value === undefined) return []
  return Array.isArray(value) ? value : value ? [value] : []
}

// Context for parent-child state sharing
interface ToggleGroupContextValue {
  type: () => 'single' | 'multiple'
  value: () => string[]
  onItemToggle: (itemValue: string) => void
  disabled: () => boolean
}

const ToggleGroupContext = createContext<ToggleGroupContextValue>()

/**
 * Props for the ToggleGroup component.
 */
interface ToggleGroupProps extends HTMLBaseAttributes {
  /** Selection mode: 'single' allows one item, 'multiple' allows many. */
  type: 'single' | 'multiple'
  /** Default selected value(s) for uncontrolled mode. */
  defaultValue?: string | string[]
  /** Controlled selected value(s). */
  value?: string | string[]
  /** Callback when value changes. */
  onValueChange?: (value: string | string[]) => void
  /** Whether the entire group is disabled. */
  disabled?: boolean
  /** Visual variant applied to all items. */
  variant?: ToggleVariant
  /** Size applied to all items. */
  size?: ToggleSize
  /** ToggleGroupItem children. */
  children?: Child
}

/**
 * ToggleGroup component.
 * Manages selection state and provides context to ToggleGroupItem children.
 */
function ToggleGroup(props: ToggleGroupProps) {
  // Internal state for uncontrolled mode
  const [internalValue, setInternalValue] = createSignal(normalizeToArray(props.defaultValue))

  // Controlled state
  const [controlledValue, setControlledValue] = createSignal<string[] | undefined>(
    props.value !== undefined ? normalizeToArray(props.value) : undefined
  )

  // Track if component is in controlled mode
  const isControlled = createMemo(() => props.value !== undefined)

  // Determine current value
  const currentValue = createMemo(() => isControlled() ? (controlledValue() ?? []) : internalValue())

  const groupClasses = `group/toggle-group flex w-fit items-center rounded-md ${(props.variant ?? 'default') === 'outline' ? 'shadow-xs' : ''} ${props.className ?? ''}`

  const handleItemToggle = (itemValue: string) => {
    const current = currentValue()
    let newValue: string[]

    if (props.type === 'single') {
      // Single mode: toggle off if same, otherwise select new
      newValue = current.includes(itemValue) ? [] : [itemValue]
    } else {
      // Multiple mode: toggle item in/out
      newValue = current.includes(itemValue)
        ? current.filter((v: string) => v !== itemValue)
        : [...current, itemValue]
    }

    if (isControlled()) {
      setControlledValue(newValue)
    } else {
      setInternalValue(newValue)
    }

    // Notify parent with appropriate type
    if (props.onValueChange) {
      if (props.type === 'single') {
        props.onValueChange(newValue[0] ?? '')
      } else {
        props.onValueChange(newValue)
      }
    }
  }

  return (
    <ToggleGroupContext.Provider value={{
      type: () => props.type,
      value: currentValue,
      onItemToggle: handleItemToggle,
      disabled: () => props.disabled ?? false,
    }}>
      <div
        data-slot="toggle-group"
        data-variant={props.variant ?? 'default'}
        data-size={props.size ?? 'default'}
        role="group"
        id={props.id}
        className={groupClasses}
      >
        {props.children}
      </div>
    </ToggleGroupContext.Provider>
  )
}

/**
 * Props for the ToggleGroupItem component.
 */
interface ToggleGroupItemProps extends ButtonHTMLAttributes {
  /** Value for this toggle item. */
  value: string
  /** Whether this item is disabled. */
  disabled?: boolean
  /** Children to render inside the toggle item. */
  children?: Child
}

/**
 * ToggleGroupItem component.
 * A single toggle button within a ToggleGroup.
 */
function ToggleGroupItem(props: ToggleGroupItemProps) {
  const handleMount = (el: HTMLElement) => {
    const ctx = useContext(ToggleGroupContext)

    createEffect(() => {
      const isSelected = ctx.value().includes(props.value)

      // Update selection state. Variant/size styling needs no per-item
      // attribute: it keys off the group root (see toggleVariantClasses).
      el.setAttribute('aria-pressed', String(isSelected))
      el.setAttribute('data-state', isSelected ? 'on' : 'off')
    })

    el.addEventListener('click', () => {
      if (el.hasAttribute('disabled') || ctx.disabled()) return
      ctx.onItemToggle(props.value)
    })
  }

  return (
    <button
      data-slot="toggle-group-item"
      data-state="off"
      aria-pressed="false"
      disabled={props.disabled ?? false}
      id={props.id}
      className={`${toggleBaseClasses} ${toggleVariantClasses} ${toggleSizeClasses} ${toggleGroupItemClasses} ${props.className ?? ''}`}
      ref={handleMount}
    >
      {props.children}
    </button>
  )
}

export { ToggleGroup, ToggleGroupItem }
export type { ToggleGroupProps, ToggleGroupItemProps, ToggleVariant, ToggleSize }
