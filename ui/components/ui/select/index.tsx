"use client"

/**
 * Select Components
 *
 * A custom select dropdown with multiple sub-components.
 * Inspired by shadcn/ui Select with CSS variable theming support.
 *
 * State management uses createContext/useContext for parent-child communication.
 * Root Select manages open/value state, children consume via context.
 *
 * Features:
 * - ESC key to close
 * - Arrow key navigation
 * - Type-ahead search
 * - Accessibility (role="combobox", role="listbox", role="option")
 * - Controlled/uncontrolled value
 * - Portal for Content (escape overflow clipping)
 * - data-state attribute-driven styling
 *
 * @example Basic usage
 * ```tsx
 * const [value, setValue] = createSignal('')
 *
 * <Select value={value()} onValueChange={setValue}>
 *   <SelectTrigger>
 *     <SelectValue placeholder="Select a fruit..." />
 *   </SelectTrigger>
 *   <SelectContent>
 *     <SelectItem value="apple">Apple</SelectItem>
 *     <SelectItem value="banana">Banana</SelectItem>
 *   </SelectContent>
 * </Select>
 * ```
 */

import { createContext, useContext, createSignal, createEffect, createPortal, isSSRPortal, findSiblingSlot } from '@barefootjs/dom'
import type { HTMLBaseAttributes, ButtonHTMLAttributes } from '@barefootjs/jsx'
import type { Child } from '../../../types'
import { CheckIcon, ChevronDownIcon } from '../icon'

// Context for parent-child state sharing
interface SelectContextValue {
  open: () => boolean
  onOpenChange: (open: boolean) => void
  value: () => string
  onValueChange: (value: string) => void
  disabled: () => boolean
}

const SelectContext = createContext<SelectContextValue>()

// Store Content -> Trigger element mapping for positioning after portal
const contentTriggerMap = new WeakMap<HTMLElement, HTMLElement>()

// SelectTrigger classes (matches shadcn/ui select trigger)
const selectTriggerBaseClasses = 'flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none'
const selectTriggerFocusClasses = 'focus:border-ring focus:ring-ring/50 focus:ring-[3px]'
const selectTriggerDisabledClasses = 'disabled:cursor-not-allowed disabled:opacity-50'
const selectTriggerDataStateClasses = 'data-[placeholder]:text-muted-foreground'

// SelectContent classes
const selectContentBaseClasses = 'fixed z-50 max-h-[min(var(--radix-select-content-available-height,384px),384px)] min-w-[8rem] overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md transform-gpu origin-top transition-[opacity,transform] duration-normal ease-out'
const selectContentOpenClasses = 'opacity-100 scale-100'
const selectContentClosedClasses = 'opacity-0 scale-95 pointer-events-none'

// SelectItem classes
const selectItemBaseClasses = 'relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-hidden'
const selectItemDefaultClasses = 'text-popover-foreground hover:bg-accent/50 focus:bg-accent focus:text-accent-foreground'
const selectItemDisabledClasses = 'pointer-events-none opacity-50'

// Indicator container classes (CheckIcon)
const selectIndicatorClasses = 'absolute left-2 flex size-3.5 shrink-0 items-center justify-center'

// SelectLabel classes
const selectLabelClasses = 'px-2 py-1.5 text-sm font-semibold text-foreground'

// SelectSeparator classes
const selectSeparatorClasses = '-mx-1 my-1 h-px bg-border'

/**
 * Props for Select component.
 */
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

/**
 * Select root component.
 * Provides value/open state to children via context.
 * Open state is managed internally. Value comes from props (parent manages it).
 * Follows the same pattern as DropdownMenu.
 */
function Select(props: SelectProps) {
  // Open state is always internal (like DropdownMenu)
  const [open, setOpen] = createSignal(false)
  // Internal state for uncontrolled mode (when value prop is not provided)
  const [internalValue, setInternalValue] = createSignal(props.value ?? '')
  const isControlled = props.value !== undefined

  return (
    <SelectContext.Provider value={{
      open,
      onOpenChange: (v) => { setOpen(v); props.onOpenChange?.(v) },
      value: () => isControlled ? (props.value ?? '') : internalValue(),
      onValueChange: (v: string) => {
        if (!isControlled) setInternalValue(v)
        if (props.onValueChange) props.onValueChange(v)
      },
      disabled: () => props.disabled ?? false,
    }}>
      <div data-slot="select" id={props.id} className={`relative inline-block ${props.className ?? ''}`}>
        {props.children}
      </div>
    </SelectContext.Provider>
  )
}

/**
 * Props for SelectTrigger component.
 */
interface SelectTriggerProps extends ButtonHTMLAttributes {
  /** Trigger content (typically SelectValue) */
  children?: Child
}

/**
 * Button that toggles the select dropdown.
 * Shows a chevron icon and reads state from context.
 */
function SelectTrigger(props: SelectTriggerProps) {
  const handleMount = (el: HTMLElement) => {
    const ctx = useContext(SelectContext)

    createEffect(() => {
      el.setAttribute('aria-expanded', String(ctx.open()))
      el.dataset.state = ctx.open() ? 'open' : 'closed'
    })

    el.addEventListener('click', () => {
      if (ctx.disabled()) return
      ctx.onOpenChange(!ctx.open())
    })

    // Allow keyboard open/close
    el.addEventListener('keydown', (e: KeyboardEvent) => {
      if (ctx.disabled()) return
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        if (!ctx.open()) {
          ctx.onOpenChange(true)
        }
      }
    })
  }

  const classes = `${selectTriggerBaseClasses} ${selectTriggerFocusClasses} ${selectTriggerDisabledClasses} ${selectTriggerDataStateClasses} ${props.className ?? ''}`

  return (
    <button
      data-slot="select-trigger"
      type="button"
      role="combobox"
      id={props.id}
      aria-expanded="false"
      aria-haspopup="listbox"
      aria-autocomplete="none"
      data-state="closed"
      className={classes}
      ref={handleMount}
    >
      {props.children}
      <ChevronDownIcon className="size-4 opacity-50" />
    </button>
  )
}

/**
 * Props for SelectValue component.
 */
interface SelectValueProps extends HTMLBaseAttributes {
  /** Placeholder text when no value is selected */
  placeholder?: string
}

/**
 * Displays the selected value label or placeholder.
 * Resolves the display text by querying portaled content DOM.
 */
function SelectValue(props: SelectValueProps) {
  const handleMount = (el: HTMLElement) => {
    const ctx = useContext(SelectContext)

    createEffect(() => {
      const val = ctx.value()
      if (val) {
        // Query the portaled content for the matching item's label
        const itemEl = document.querySelector(`[data-slot="select-item"][data-value="${val}"]`) as HTMLElement
        const label = itemEl?.textContent ?? val
        el.textContent = label
        // Remove placeholder attribute when value is selected
        const trigger = el.closest('[data-slot="select-trigger"]')
        trigger?.removeAttribute('data-placeholder')
      } else {
        el.textContent = props.placeholder ?? ''
        // Set placeholder attribute for styling
        const trigger = el.closest('[data-slot="select-trigger"]')
        if (props.placeholder) {
          trigger?.setAttribute('data-placeholder', '')
        }
      }
    })
  }

  return (
    <span data-slot="select-value" id={props.id} className="pointer-events-none truncate" ref={handleMount}>
      {props.placeholder ?? ''}
    </span>
  )
}

/**
 * Props for SelectContent component.
 */
interface SelectContentProps extends HTMLBaseAttributes {
  /** SelectItem, SelectGroup, SelectLabel, SelectSeparator components */
  children?: Child
  /** Alignment relative to trigger */
  align?: 'start' | 'end'
}

/**
 * Content container for select items.
 * Portaled to body. Reads open state from context.
 */
function SelectContent(props: SelectContentProps) {
  const handleMount = (el: HTMLElement) => {
    // Get trigger ref before portal
    const triggerEl = findSiblingSlot(el, '[data-slot="select-trigger"]')
    if (triggerEl) contentTriggerMap.set(el, triggerEl)

    // Portal to body to escape overflow clipping
    if (el && el.parentNode !== document.body && !isSSRPortal(el)) {
      const ownerScope = el.closest('[bf-s]') ?? undefined
      createPortal(el, document.body, { ownerScope })
    }

    const ctx = useContext(SelectContext)

    // Position content relative to trigger, clamped to viewport
    const updatePosition = () => {
      if (!triggerEl) return
      const rect = triggerEl.getBoundingClientRect()
      const gap = 4
      const top = rect.bottom + gap
      const availableHeight = window.innerHeight - top - gap
      el.style.top = `${top}px`
      el.style.setProperty('--radix-select-content-available-height', `${availableHeight}px`)
      // At least as wide as trigger, but can expand for longer items
      el.style.minWidth = `${rect.width}px`
      if (props.align === 'end') {
        el.style.left = `${rect.right - el.offsetWidth}px`
      } else {
        el.style.left = `${rect.left}px`
      }
    }

    // Type-ahead search state
    let typeAheadQuery = ''
    let typeAheadTimer: ReturnType<typeof setTimeout> | null = null

    // Track cleanup functions for global listeners
    let cleanupFns: Function[] = []

    // Reactive show/hide + positioning + global listeners
    createEffect(() => {
      // Clean up previous listeners
      for (const fn of cleanupFns) fn()
      cleanupFns = []

      const isOpen = ctx.open()
      el.dataset.state = isOpen ? 'open' : 'closed'
      el.className = `${selectContentBaseClasses} ${isOpen ? selectContentOpenClasses : selectContentClosedClasses} ${props.className ?? ''}`

      if (isOpen) {
        updatePosition()

        // Focus the currently selected item or first item
        setTimeout(() => {
          const selectedItem = el.querySelector(`[data-slot="select-item"][data-state="checked"]`) as HTMLElement
          const firstItem = el.querySelector('[data-slot="select-item"]:not([aria-disabled="true"])') as HTMLElement
          ;(selectedItem ?? firstItem)?.focus()
        }, 0)

        // Close on click outside
        const handleClickOutside = (e: MouseEvent) => {
          if (!el.contains(e.target as Node) && !triggerEl?.contains(e.target as Node)) {
            ctx.onOpenChange(false)
          }
        }

        // Close on ESC
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
          if (e.key === 'Escape') {
            ctx.onOpenChange(false)
            triggerEl?.focus()
          }
        }

        // Reposition on scroll and resize
        const handleScroll = () => updatePosition()

        // Lock body scroll while open
        const originalOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'

        document.addEventListener('mousedown', handleClickOutside)
        document.addEventListener('keydown', handleGlobalKeyDown)
        window.addEventListener('scroll', handleScroll, true)
        window.addEventListener('resize', handleScroll)

        cleanupFns.push(
          () => { document.body.style.overflow = originalOverflow },
          () => document.removeEventListener('mousedown', handleClickOutside),
          () => document.removeEventListener('keydown', handleGlobalKeyDown),
          () => window.removeEventListener('scroll', handleScroll, true),
          () => window.removeEventListener('resize', handleScroll),
        )
      }
    })

    // Keyboard navigation within content
    el.addEventListener('keydown', (e: KeyboardEvent) => {
      const items = el.querySelectorAll('[data-slot="select-item"]:not([aria-disabled="true"])')
      const currentIndex = Array.from(items).findIndex(item => item === document.activeElement)

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          if (items.length > 0) {
            const nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0
            ;(items[nextIndex] as HTMLElement).focus()
          }
          break
        case 'ArrowUp':
          e.preventDefault()
          if (items.length > 0) {
            const prevIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1
            ;(items[prevIndex] as HTMLElement).focus()
          }
          break
        case 'Enter':
        case ' ':
          e.preventDefault()
          if (document.activeElement && (document.activeElement as HTMLElement).dataset.slot === 'select-item') {
            ;(document.activeElement as HTMLElement).click()
          }
          break
        case 'Home':
          e.preventDefault()
          if (items.length > 0) {
            ;(items[0] as HTMLElement).focus()
          }
          break
        case 'End':
          e.preventDefault()
          if (items.length > 0) {
            ;(items[items.length - 1] as HTMLElement).focus()
          }
          break
        default:
          // Type-ahead search
          if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
            e.preventDefault()
            typeAheadQuery += e.key.toLowerCase()
            if (typeAheadTimer) clearTimeout(typeAheadTimer)
            typeAheadTimer = setTimeout(() => { typeAheadQuery = '' }, 500)

            const match = Array.from(items).find(item => {
              const text = (item as HTMLElement).textContent?.toLowerCase() ?? ''
              return text.startsWith(typeAheadQuery)
            }) as HTMLElement
            match?.focus()
          }
          break
      }
    })
  }

  return (
    <div
      data-slot="select-content"
      data-state="closed"
      role="listbox"
      id={props.id}
      tabindex={-1}
      className={`${selectContentBaseClasses} ${selectContentClosedClasses} ${props.className ?? ''}`}
      ref={handleMount}
    >
      {props.children}
    </div>
  )
}

/**
 * Props for SelectItem component.
 */
interface SelectItemProps extends HTMLBaseAttributes {
  /** The value for this item */
  value: string
  /** Whether this item is disabled */
  disabled?: boolean
  /** Item content (label text) */
  children?: Child
}

/**
 * Individual selectable option.
 * Shows a check indicator when selected.
 * Auto-closes the dropdown on select.
 */
function SelectItem(props: SelectItemProps) {
  const handleMount = (el: HTMLElement) => {
    const ctx = useContext(SelectContext)

    createEffect(() => {
      const isSelected = ctx.value() === props.value
      el.setAttribute('aria-selected', String(isSelected))
      el.dataset.state = isSelected ? 'checked' : 'unchecked'

      // Update check indicator visibility
      const indicator = el.querySelector('[data-slot="select-item-indicator"]') as HTMLElement
      if (indicator) {
        indicator.style.display = isSelected ? '' : 'none'
      }
    })

    el.addEventListener('click', () => {
      if (el.getAttribute('aria-disabled') === 'true') return
      ctx.onValueChange(props.value)
      ctx.onOpenChange(false)

      // Focus return to trigger
      const content = el.closest('[data-slot="select-content"]') as HTMLElement
      const trigger = content ? contentTriggerMap.get(content) : null
      setTimeout(() => trigger?.focus(), 0)
    })
  }

  const isDisabled = props.disabled ?? false
  const stateClasses = isDisabled ? selectItemDisabledClasses : selectItemDefaultClasses

  return (
    <div
      data-slot="select-item"
      data-value={props.value}
      data-state="unchecked"
      role="option"
      id={props.id}
      aria-selected="false"
      aria-disabled={isDisabled || undefined}
      tabindex={isDisabled ? -1 : 0}
      className={`${selectItemBaseClasses} ${stateClasses} ${props.className ?? ''}`}
      ref={handleMount}
    >
      <span data-slot="select-item-indicator" className={selectIndicatorClasses} style="display:none">
        <CheckIcon className="size-4" />
      </span>
      {props.children}
    </div>
  )
}

/**
 * Props for SelectGroup component.
 */
interface SelectGroupProps extends HTMLBaseAttributes {
  /** Grouped items */
  children?: Child
}

/**
 * Semantic grouping of related select items.
 */
function SelectGroup({ children, className = '', ...props }: SelectGroupProps) {
  return (
    <div data-slot="select-group" role="group" className={className} {...props}>
      {children}
    </div>
  )
}

/**
 * Props for SelectLabel component.
 */
interface SelectLabelProps extends HTMLBaseAttributes {
  /** Label text */
  children?: Child
}

/**
 * Section label inside the select dropdown.
 */
function SelectLabel({ children, className = '', ...props }: SelectLabelProps) {
  return (
    <div data-slot="select-label" className={`${selectLabelClasses} ${className}`} {...props}>
      {children}
    </div>
  )
}

/**
 * Props for SelectSeparator component.
 */
interface SelectSeparatorProps extends HTMLBaseAttributes {
}

/**
 * Visual separator between select item groups.
 */
function SelectSeparator({ className = '', ...props }: SelectSeparatorProps) {
  return (
    <div data-slot="select-separator" role="separator" className={`${selectSeparatorClasses} ${className}`} {...props} />
  )
}

export {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
  SelectSeparator,
}

export type {
  SelectProps,
  SelectTriggerProps,
  SelectValueProps,
  SelectContentProps,
  SelectItemProps,
  SelectGroupProps,
  SelectLabelProps,
  SelectSeparatorProps,
}
