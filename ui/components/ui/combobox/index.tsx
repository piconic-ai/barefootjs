"use client"

/**
 * Combobox Components
 *
 * An autocomplete input with searchable dropdown.
 * Composes Popover (portal, positioning, click-outside, ESC) with
 * Command-style search filtering and keyboard navigation.
 *
 * State management uses createContext/useContext for parent-child communication.
 * Root Combobox manages open/value/search state, children consume via context.
 *
 * Features:
 * - Search filtering (case-insensitive substring)
 * - Arrow key navigation within filtered results
 * - Enter to select, ESC to close
 * - Click outside to close
 * - Check indicator on selected item
 * - Portal for Content (escape overflow clipping)
 * - Accessibility (role="combobox", role="listbox", role="option")
 * - data-state attribute-driven styling
 *
 * @example Basic usage
 * ```tsx
 * const [value, setValue] = createSignal('')
 *
 * <Combobox value={value()} onValueChange={setValue}>
 *   <ComboboxTrigger>
 *     <ComboboxValue placeholder="Select framework..." />
 *   </ComboboxTrigger>
 *   <ComboboxContent>
 *     <ComboboxInput placeholder="Search..." />
 *     <ComboboxEmpty>No results found.</ComboboxEmpty>
 *     <ComboboxItem value="next">Next.js</ComboboxItem>
 *     <ComboboxItem value="svelte">SvelteKit</ComboboxItem>
 *   </ComboboxContent>
 * </Combobox>
 * ```
 */

import { createContext, useContext, createSignal, createMemo, createEffect, createPortal, isSSRPortal, findSiblingSlot, trackPosition } from '@barefootjs/client'
import type { HTMLBaseAttributes, ButtonHTMLAttributes } from '@barefootjs/jsx'
import type { Child } from '../../../types'
import { CheckIcon, ChevronDownIcon, SearchIcon } from '../icon'

// --- Context ---

interface ComboboxContextValue {
  open: () => boolean
  onOpenChange: (open: boolean) => void
  value: () => string
  onValueChange: (value: string) => void
  search: () => string
  onSearchChange: (value: string) => void
  filter: (value: string, search: string) => boolean
}

const ComboboxContext = createContext<ComboboxContextValue>()

// Store Content -> Trigger element mapping for positioning after portal
const contentTriggerMap = new WeakMap<HTMLElement, HTMLElement>()

// --- CSS Classes ---

// Trigger (same pattern as SelectTrigger)
const triggerBaseClasses = 'flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none'
const triggerFocusClasses = 'focus:border-ring focus:ring-ring/50 focus:ring-[3px]'
const triggerDisabledClasses = 'disabled:cursor-not-allowed disabled:opacity-50'
const triggerDataStateClasses = 'data-[placeholder]:text-muted-foreground'

// Content (portal dropdown)
const contentBaseClasses = 'fixed z-50 max-h-[min(var(--radix-select-content-available-height,384px),384px)] min-w-[8rem] overflow-hidden rounded-md border bg-popover shadow-md transform-gpu origin-top transition-[opacity,transform] duration-normal ease-out'
const contentOpenClasses = 'opacity-100 scale-100'
const contentClosedClasses = 'opacity-0 scale-95 pointer-events-none'

// Input (search)
const inputWrapperClasses = 'flex items-center border-b px-3'
const inputClasses = 'flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50'

// Item
const itemBaseClasses = 'relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-hidden'
const itemDefaultClasses = 'text-popover-foreground hover:bg-accent/50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground'
const itemDisabledClasses = 'pointer-events-none opacity-50'

// Check indicator
const indicatorClasses = 'absolute left-2 flex size-3.5 shrink-0 items-center justify-center'

// Empty
const emptyClasses = 'py-6 text-center text-sm'

// Group
const groupClasses = 'overflow-hidden p-1 text-foreground [&_[data-slot=combobox-group-heading]]:px-2 [&_[data-slot=combobox-group-heading]]:py-1.5 [&_[data-slot=combobox-group-heading]]:text-xs [&_[data-slot=combobox-group-heading]]:font-medium [&_[data-slot=combobox-group-heading]]:text-muted-foreground'

// Separator
const separatorClasses = '-mx-1 my-1 h-px bg-border'

// --- Props ---

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

// --- Components ---

/**
 * Combobox root component.
 * Manages open/value/search state and provides context to children.
 */
function Combobox(props: ComboboxProps) {
  const [open, setOpen] = createSignal(false)
  const [search, setSearch] = createSignal('')
  // Internal state for uncontrolled mode (when value prop is not provided)
  const [internalValue, setInternalValue] = createSignal(props.value ?? '')
  const isControlled = createMemo(() => props.value !== undefined)

  const filterFn = createMemo(() => props.filter ?? ((value: string, search: string) => {
    if (!search) return true
    return value.toLowerCase().includes(search.toLowerCase())
  }))

  return (
    <ComboboxContext.Provider value={{
      open,
      onOpenChange: (v: boolean) => {
        setOpen(v)
        // Clear search when closing
        if (!v) setSearch('')
      },
      value: () => isControlled() ? (props.value ?? '') : internalValue(),
      onValueChange: (v: string) => {
        if (!isControlled()) setInternalValue(v)
        if (props.onValueChange) props.onValueChange(v)
      },
      search,
      onSearchChange: setSearch,
      filter: filterFn(),
    }}>
      <div data-slot="combobox" id={props.id} className={`relative inline-block ${props.className ?? ''}`}>
        {props.children}
      </div>
    </ComboboxContext.Provider>
  )
}

/**
 * Button that toggles the combobox dropdown.
 * Shows a chevron icon and reads state from context.
 */
function ComboboxTrigger(props: ComboboxTriggerProps) {
  const handleMount = (el: HTMLElement) => {
    const ctx = useContext(ComboboxContext)

    createEffect(() => {
      el.setAttribute('aria-expanded', String(ctx.open()))
      el.dataset.state = ctx.open() ? 'open' : 'closed'
    })

    el.addEventListener('click', () => {
      ctx.onOpenChange(!ctx.open())
    })

    // Allow keyboard open
    el.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        if (!ctx.open()) {
          ctx.onOpenChange(true)
        }
      }
    })
  }

  const classes = `${triggerBaseClasses} ${triggerFocusClasses} ${triggerDisabledClasses} ${triggerDataStateClasses} ${props.className ?? ''}`

  return (
    <button
      data-slot="combobox-trigger"
      type="button"
      role="combobox"
      id={props.id}
      aria-expanded="false"
      aria-haspopup="listbox"
      aria-autocomplete="list"
      data-state="closed"
      className={classes}
      ref={handleMount}
    >
      {props.children}
      <ChevronDownIcon className="size-4 shrink-0 opacity-50" />
    </button>
  )
}

/**
 * Displays the selected value label or placeholder.
 * Resolves the display text by querying portaled content DOM.
 */
function ComboboxValue(props: ComboboxValueProps) {
  const handleMount = (el: HTMLElement) => {
    const ctx = useContext(ComboboxContext)

    createEffect(() => {
      const val = ctx.value()
      if (val) {
        // Query the portaled content for the matching item's label
        const itemEl = document.querySelector(`[data-slot="combobox-item"][data-value="${val}"]`) as HTMLElement
        const label = itemEl?.textContent ?? val
        el.textContent = label
        // Remove placeholder attribute when value is selected
        const trigger = el.closest('[data-slot="combobox-trigger"]')
        trigger?.removeAttribute('data-placeholder')
      } else {
        el.textContent = props.placeholder ?? ''
        // Set placeholder attribute for styling
        const trigger = el.closest('[data-slot="combobox-trigger"]')
        if (props.placeholder) {
          trigger?.setAttribute('data-placeholder', '')
        }
      }
    })
  }

  return (
    <span data-slot="combobox-value" id={props.id} className="pointer-events-none truncate" ref={handleMount}>
      {props.placeholder ?? ''}
    </span>
  )
}

/**
 * Content container for combobox items.
 * Portaled to body. Contains search input and scrollable item list.
 */
function ComboboxContent(props: ComboboxContentProps) {
  const handleMount = (el: HTMLElement) => {
    // Get trigger ref before portal
    const triggerEl = findSiblingSlot(el, '[data-slot="combobox-trigger"]')
    if (triggerEl) contentTriggerMap.set(el, triggerEl)

    // Portal to body to escape overflow clipping
    if (el && el.parentNode !== document.body && !isSSRPortal(el)) {
      const ownerScope = el.closest('[bf-s]') ?? undefined
      createPortal(el, document.body, { ownerScope })
    }

    const ctx = useContext(ComboboxContext)

    // Position content relative to trigger, clamped to viewport
    const updatePosition = () => {
      if (!triggerEl) return
      const rect = triggerEl.getBoundingClientRect()
      const gap = 4
      const top = rect.bottom + gap
      const availableHeight = window.innerHeight - top - gap
      el.style.top = `${top}px`
      el.style.setProperty('--radix-select-content-available-height', `${availableHeight}px`)
      el.style.minWidth = `${rect.width}px`
      if (props.align === 'end') {
        el.style.left = `${rect.right - el.offsetWidth}px`
      } else {
        el.style.left = `${rect.left}px`
      }
    }

    // Track cleanup functions for global listeners
    let cleanupFns: Function[] = []

    // Reactive show/hide + positioning + global listeners
    createEffect(() => {
      // Clean up previous listeners
      for (const fn of cleanupFns) fn()
      cleanupFns = []

      const isOpen = ctx.open()
      el.dataset.state = isOpen ? 'open' : 'closed'
      el.className = `${contentBaseClasses} ${isOpen ? contentOpenClasses : contentClosedClasses} ${props.className ?? ''}`

      if (isOpen) {
        // Anchor to the trigger while open; re-anchors on scroll/resize and
        // once more at close (see trackPosition, #2848).
        cleanupFns.push(trackPosition(updatePosition))

        // Focus the search input when opened
        setTimeout(() => {
          const input = el.querySelector('[data-slot="combobox-input"]') as HTMLInputElement
          input?.focus()
        }, 0)

        // Close on click outside
        const handleClickOutside = (e: MouseEvent) => {
          if (!el.contains(e.target as Node) && !triggerEl?.contains(e.target as Node)) {
            ctx.onOpenChange(false)
          }
        }

        // Keyboard navigation: ESC to close, ArrowDown/Up to move, Enter to select
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
          if (e.key === 'Escape') {
            ctx.onOpenChange(false)
            triggerEl?.focus()
            return
          }

          const items = Array.from(el.querySelectorAll('[data-slot="combobox-item"]:not([hidden]):not([aria-disabled="true"])')) as HTMLElement[]
          if (items.length === 0) return

          const currentSelected = el.querySelector('[data-slot="combobox-item"][data-selected="true"]') as HTMLElement
          const currentIndex = currentSelected ? items.indexOf(currentSelected) : -1

          switch (e.key) {
            case 'ArrowDown': {
              e.preventDefault()
              const nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0
              items.forEach((item, i) => {
                item.setAttribute('data-selected', String(i === nextIndex))
              })
              items[nextIndex].scrollIntoView({ block: 'nearest' })
              break
            }
            case 'ArrowUp': {
              e.preventDefault()
              const prevIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1
              items.forEach((item, i) => {
                item.setAttribute('data-selected', String(i === prevIndex))
              })
              items[prevIndex].scrollIntoView({ block: 'nearest' })
              break
            }
            case 'Enter': {
              e.preventDefault()
              if (currentSelected && currentSelected.getAttribute('aria-disabled') !== 'true') {
                currentSelected.click()
              }
              break
            }
          }
        }

        document.addEventListener('mousedown', handleClickOutside)
        document.addEventListener('keydown', handleGlobalKeyDown)

        cleanupFns.push(
          () => document.removeEventListener('mousedown', handleClickOutside),
          () => document.removeEventListener('keydown', handleGlobalKeyDown),
        )
      }
    })

    // Auto-select visible item when search changes:
    // prefer the currently checked item, fall back to first visible
    createEffect(() => {
      ctx.search() // track dependency
      requestAnimationFrame(() => {
        const visibleItems = Array.from(el.querySelectorAll('[data-slot="combobox-item"]:not([hidden])')) as HTMLElement[]
        const checkedItem = el.querySelector('[data-slot="combobox-item"][data-state="checked"]:not([hidden])') as HTMLElement | null
        const targetItem = checkedItem ?? visibleItems[0] ?? null
        visibleItems.forEach((item) => {
          item.setAttribute('data-selected', String(item === targetItem))
        })
      })
    })

  }

  return (
    <div
      data-slot="combobox-content"
      data-state="closed"
      role="listbox"
      id={props.id}
      tabindex={-1}
      className={`${contentBaseClasses} ${contentClosedClasses} ${props.className ?? ''}`}
      ref={handleMount}
    >
      {props.children}
    </div>
  )
}

/**
 * Search input inside the combobox dropdown.
 * Writes to context's search state.
 */
function ComboboxInput(props: ComboboxInputProps) {
  const handleMount = (el: HTMLElement) => {
    const ctx = useContext(ComboboxContext)
    const input = el.querySelector('input') as HTMLInputElement
    if (!input) return

    input.addEventListener('input', () => {
      ctx.onSearchChange(input.value)
    })

    // Keep input in sync with search state (e.g., cleared on close)
    createEffect(() => {
      const val = ctx.search()
      if (input.value !== val) {
        input.value = val
      }
    })
  }

  return (
    <div
      data-slot="combobox-input-wrapper"
      className={inputWrapperClasses}
      ref={handleMount}
    >
      <SearchIcon className="mr-2 size-4 shrink-0 opacity-50" />
      <input
        data-slot="combobox-input"
        id={props.id}
        type="text"
        placeholder={props.placeholder}
        disabled={props.disabled ?? false}
        className={`${inputClasses} ${props.className ?? ''}`}
        autocomplete="off"
      />
    </div>
  )
}

/**
 * "No results" message. Auto-shows when no items are visible.
 */
function ComboboxEmpty(props: ComboboxEmptyProps) {
  const handleMount = (el: HTMLElement) => {
    const ctx = useContext(ComboboxContext)

    createEffect(() => {
      ctx.search() // track dependency
      // Check after items have updated their visibility
      requestAnimationFrame(() => {
        const container = el.closest('[data-slot="combobox-content"]')
        if (!container) return
        const visibleItems = container.querySelectorAll('[data-slot="combobox-item"]:not([hidden])')
        el.hidden = visibleItems.length > 0
      })
    })
  }

  return (
    <div
      data-slot="combobox-empty"
      id={props.id}
      hidden
      className={`${emptyClasses} ${props.className ?? ''}`}
      ref={handleMount}
    >
      {props.children}
    </div>
  )
}

/**
 * Individual selectable item in the combobox.
 * Self-filters based on search. Shows check indicator when selected.
 * On select: update value, close dropdown.
 */
function ComboboxItem(props: ComboboxItemProps) {
  const handleMount = (el: HTMLElement) => {
    const ctx = useContext(ComboboxContext)

    // Set data-value for querying
    el.setAttribute('data-value', props.value)

    // Self-filter based on search
    createEffect(() => {
      const s = ctx.search()
      const label = el.textContent?.trim() ?? props.value
      const visible = ctx.filter(label, s)
      el.hidden = !visible
    })

    // Selected (checked) state + data-selected highlight
    createEffect(() => {
      const isChecked = ctx.value() === props.value
      el.setAttribute('aria-selected', String(isChecked))
      el.dataset.state = isChecked ? 'checked' : 'unchecked'

      // Update check indicator visibility
      const indicator = el.querySelector('[data-slot="combobox-item-indicator"]') as HTMLElement
      if (indicator) {
        indicator.style.display = isChecked ? '' : 'none'
      }
    })

    // Click handler: select value, close dropdown, focus trigger
    el.addEventListener('click', () => {
      if (el.getAttribute('aria-disabled') === 'true') return
      ctx.onValueChange(props.value)
      ctx.onOpenChange(false)

      // Focus return to trigger
      const content = el.closest('[data-slot="combobox-content"]') as HTMLElement
      const trigger = content ? contentTriggerMap.get(content) : null
      setTimeout(() => trigger?.focus(), 0)
    })

    // Hover to highlight
    el.addEventListener('pointerenter', () => {
      if (el.getAttribute('aria-disabled') === 'true') return
      const container = el.closest('[data-slot="combobox-content"]')
      if (!container) return
      const allItems = container.querySelectorAll('[data-slot="combobox-item"]:not([hidden])')
      allItems.forEach(item => item.setAttribute('data-selected', 'false'))
      el.setAttribute('data-selected', 'true')
    })
  }

  const isDisabled = createMemo(() => props.disabled ?? false)
  const stateClasses = createMemo(() => isDisabled() ? itemDisabledClasses : itemDefaultClasses)

  return (
    <div
      data-slot="combobox-item"
      data-value={props.value}
      data-state="unchecked"
      data-selected="false"
      role="option"
      id={props.id}
      aria-selected="false"
      aria-disabled={isDisabled() || undefined}
      tabindex={-1}
      className={`${itemBaseClasses} ${stateClasses()} ${props.className ?? ''}`}
      ref={handleMount}
    >
      <span data-slot="combobox-item-indicator" className={indicatorClasses} style="display:none">
        <CheckIcon className="size-4" />
      </span>
      {props.children}
    </div>
  )
}

/**
 * Group of related combobox items with an optional heading.
 * Auto-hides when all items within are filtered out.
 */
function ComboboxGroup(props: ComboboxGroupProps) {
  const handleMount = (el: HTMLElement) => {
    const ctx = useContext(ComboboxContext)

    createEffect(() => {
      ctx.search() // track dependency
      requestAnimationFrame(() => {
        const items = el.querySelectorAll('[data-slot="combobox-item"]')
        const visibleItems = el.querySelectorAll('[data-slot="combobox-item"]:not([hidden])')
        el.hidden = items.length > 0 && visibleItems.length === 0
      })
    })
  }

  return (
    <div
      data-slot="combobox-group"
      id={props.id}
      role="group"
      className={`${groupClasses} ${props.className ?? ''}`}
      ref={handleMount}
    >
      {props.heading && (
        <div data-slot="combobox-group-heading" aria-hidden="true">
          {props.heading}
        </div>
      )}
      {props.children}
    </div>
  )
}

/**
 * Visual separator between combobox groups.
 */
function ComboboxSeparator({ className = '', ...props }: ComboboxSeparatorProps) {
  return (
    <div
      data-slot="combobox-separator"
      role="separator"
      className={`${separatorClasses} ${className}`}
      {...props}
    />
  )
}

export {
  Combobox,
  ComboboxTrigger,
  ComboboxValue,
  ComboboxContent,
  ComboboxInput,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxGroup,
  ComboboxSeparator,
}

export type {
  ComboboxProps,
  ComboboxTriggerProps,
  ComboboxValueProps,
  ComboboxContentProps,
  ComboboxInputProps,
  ComboboxEmptyProps,
  ComboboxItemProps,
  ComboboxGroupProps,
  ComboboxSeparatorProps,
}
