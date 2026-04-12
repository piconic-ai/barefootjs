"use client"

/**
 * DropdownMenu Components
 *
 * An action menu triggered by a button, avatar, or any element.
 * Inspired by shadcn/ui DropdownMenu with CSS variable theming support.
 *
 * State management uses createContext/useContext for parent-child communication.
 * Root DropdownMenu manages open state, children consume via context.
 *
 * Features:
 * - ESC key to close
 * - Arrow key navigation
 * - Accessibility (role="menu", role="menuitem")
 * - Submenu support with hover/keyboard navigation
 * - CheckboxItem for multi-select
 * - RadioGroup/RadioItem for single-select
 * - Destructive variant for dangerous actions
 *
 * @example Basic dropdown menu
 * ```tsx
 * const [open, setOpen] = createSignal(false)
 *
 * <DropdownMenu open={open()} onOpenChange={setOpen}>
 *   <DropdownMenuTrigger>
 *     <span>Open Menu</span>
 *   </DropdownMenuTrigger>
 *   <DropdownMenuContent>
 *     <DropdownMenuLabel>My Account</DropdownMenuLabel>
 *     <DropdownMenuSeparator />
 *     <DropdownMenuItem onSelect={() => {}}>Settings</DropdownMenuItem>
 *     <DropdownMenuItem onSelect={() => {}}>Log out</DropdownMenuItem>
 *   </DropdownMenuContent>
 * </DropdownMenu>
 * ```
 */

import { createContext, useContext, createSignal, createMemo, createEffect, createPortal, isSSRPortal, findSiblingSlot } from '@barefootjs/client-runtime'
import type { ButtonHTMLAttributes, HTMLBaseAttributes } from '@barefootjs/jsx'
import type { Child } from '../../../types'
import { CheckIcon, ChevronRightIcon } from '../icon'

// Context for parent-child state sharing
interface DropdownMenuContextValue {
  open: () => boolean
  onOpenChange: (open: boolean) => void
}

const DropdownMenuContext = createContext<DropdownMenuContextValue>()

// Context for Submenu state
interface DropdownMenuSubContextValue {
  subOpen: () => boolean
  onSubOpenChange: (open: boolean) => void
}

const DropdownMenuSubContext = createContext<DropdownMenuSubContextValue>()

// Context for RadioGroup value
interface DropdownMenuRadioGroupContextValue {
  value: () => string
  onValueChange: (value: string) => void
}

const DropdownMenuRadioGroupContext = createContext<DropdownMenuRadioGroupContextValue>()

// Store Content -> Trigger element mapping for MenuItem focus return after portal
const contentTriggerMap = new WeakMap<HTMLElement, HTMLElement>()

// DropdownMenu container classes
const dropdownMenuClasses = 'relative inline-block'

// DropdownMenuTrigger classes (minimal - user styles their own content)
const dropdownMenuTriggerClasses = 'inline-flex items-center disabled:pointer-events-none disabled:opacity-50'

// DropdownMenuContent base classes
const dropdownMenuContentBaseClasses = 'fixed z-50 min-w-[8rem] rounded-md border bg-popover p-1 shadow-md transform-gpu origin-top transition-[opacity,transform] duration-normal ease-out'

// DropdownMenuContent open/closed classes
const dropdownMenuContentOpenClasses = 'opacity-100 scale-100'
const dropdownMenuContentClosedClasses = 'opacity-0 scale-95 pointer-events-none'

// DropdownMenuItem base classes
const dropdownMenuItemBaseClasses = 'relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden'

// DropdownMenuItem state classes
const dropdownMenuItemDefaultClasses = 'text-popover-foreground hover:bg-accent/50 focus:bg-accent focus:text-accent-foreground'
const dropdownMenuItemDisabledClasses = 'pointer-events-none opacity-50'

// DropdownMenuItem destructive variant classes
const dropdownMenuItemDestructiveClasses = 'text-destructive hover:bg-accent/50 focus:bg-accent focus:text-destructive'

// CheckboxItem / RadioItem classes (left padding for indicator)
const dropdownMenuCheckableItemClasses = 'relative flex cursor-pointer select-none items-center gap-2 rounded-sm py-1.5 pl-8 pr-2 text-sm outline-hidden'

// Indicator container classes (CheckIcon / DotIcon)
const dropdownMenuIndicatorClasses = 'absolute left-2 flex size-3.5 shrink-0 items-center justify-center'

// SubTrigger classes
const dropdownMenuSubTriggerClasses = 'relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden'

// SubContent classes (absolute positioned, similar to Content)
const dropdownMenuSubContentBaseClasses = 'absolute z-50 min-w-[8rem] rounded-md border bg-popover p-1 shadow-md'

// DropdownMenuLabel classes
const dropdownMenuLabelClasses = 'px-2 py-1.5 text-sm font-semibold text-foreground'

// DropdownMenuSeparator classes
const dropdownMenuSeparatorClasses = '-mx-1 my-1 h-px bg-border'

// DropdownMenuShortcut classes
const dropdownMenuShortcutClasses = 'ml-auto text-xs tracking-widest text-muted-foreground'

/**
 * Props for DropdownMenu component.
 */
interface DropdownMenuProps extends HTMLBaseAttributes {
  /** Whether the dropdown menu is open */
  open?: boolean
  /** Callback when open state should change */
  onOpenChange?: (open: boolean) => void
  /** DropdownMenuTrigger and DropdownMenuContent */
  children?: Child
}

/**
 * DropdownMenu root component.
 * Provides open state to children via context.
 *
 * @param props.open - Whether the dropdown menu is open
 * @param props.onOpenChange - Callback when open state should change
 */
function DropdownMenu(props: DropdownMenuProps) {
  return (
    <DropdownMenuContext.Provider value={{
      open: () => props.open ?? false,
      onOpenChange: props.onOpenChange ?? (() => {}),
    }}>
      <div data-slot="dropdown-menu" id={props.id} className={`${dropdownMenuClasses} ${props.className ?? ''}`}>
        {props.children}
      </div>
    </DropdownMenuContext.Provider>
  )
}

/**
 * Props for DropdownMenuTrigger component.
 */
interface DropdownMenuTriggerProps extends ButtonHTMLAttributes {
  /** Whether disabled */
  disabled?: boolean
  /** Render child element as trigger instead of built-in button */
  asChild?: boolean
  /** Trigger content (any element: button, avatar, icon, etc.) */
  children?: Child
}

/**
 * Button that toggles the dropdown menu.
 * Reads open state from context and toggles via onOpenChange.
 *
 * @param props.disabled - Whether disabled
 * @param props.asChild - Render child as trigger
 */
function DropdownMenuTrigger(props: DropdownMenuTriggerProps) {
  const handleMount = (el: HTMLElement) => {
    const ctx = useContext(DropdownMenuContext)

    createEffect(() => {
      el.setAttribute('aria-expanded', String(ctx.open()))
    })

    el.addEventListener('click', () => {
      ctx.onOpenChange(!ctx.open())
    })
  }

  if (props.asChild) {
    return (
      <span
        data-slot="dropdown-menu-trigger"
        aria-expanded="false"
        aria-haspopup="menu"
        style="display:contents"
        ref={handleMount}
      >
        {props.children}
      </span>
    )
  }

  return (
    <button
      data-slot="dropdown-menu-trigger"
      type="button"
      id={props.id}
      aria-expanded="false"
      aria-haspopup="menu"
      disabled={props.disabled ?? false}
      className={`${dropdownMenuTriggerClasses} ${props.className ?? ''}`}
      ref={handleMount}
    >
      {props.children}
    </button>
  )
}

/**
 * Props for DropdownMenuContent component.
 */
interface DropdownMenuContentProps extends HTMLBaseAttributes {
  /** DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator components */
  children?: Child
  /** Alignment relative to trigger */
  align?: 'start' | 'end'
}

/**
 * Content container for dropdown menu items.
 * Portaled to body. Reads open state from context.
 *
 * @param props.align - Alignment ('start' or 'end')
 */
function DropdownMenuContent(props: DropdownMenuContentProps) {
  const handleMount = (el: HTMLElement) => {
    // Get trigger ref before portal (while still inside DropdownMenu container)
    const triggerEl = findSiblingSlot(el, '[data-slot="dropdown-menu-trigger"]')
    if (triggerEl) contentTriggerMap.set(el, triggerEl)

    // Portal to body to escape overflow clipping
    if (el && el.parentNode !== document.body && !isSSRPortal(el)) {
      const ownerScope = el.closest('[bf-s]') ?? undefined
      createPortal(el, document.body, { ownerScope })
    }

    const ctx = useContext(DropdownMenuContext)

    // Position content relative to trigger
    // Resolve through display:contents (asChild wraps in a span with display:contents
    // which returns a zero rect from getBoundingClientRect)
    const positionTarget = triggerEl && getComputedStyle(triggerEl).display === 'contents'
      ? (triggerEl.firstElementChild as HTMLElement | null) ?? triggerEl
      : triggerEl
    const updatePosition = () => {
      if (!positionTarget) return
      const rect = positionTarget.getBoundingClientRect()
      el.style.top = `${rect.bottom + 4}px`
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
      el.className = `${dropdownMenuContentBaseClasses} ${isOpen ? dropdownMenuContentOpenClasses : dropdownMenuContentClosedClasses} ${props.className ?? ''}`

      if (isOpen) {
        updatePosition()

        // Close on click outside (content or trigger)
        const handleClickOutside = (e: MouseEvent) => {
          if (!el.contains(e.target as Node) && !triggerEl?.contains(e.target as Node)) {
            ctx.onOpenChange(false)
          }
        }

        // Close on ESC anywhere in the document
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
          if (e.key === 'Escape') {
            // If a submenu is open, let SubContent handle ESC
            const openSub = el.querySelector('[data-slot="dropdown-menu-sub-content"][data-state="open"]')
            if (openSub) return
            ctx.onOpenChange(false)
            triggerEl?.focus()
          }
        }

        // Reposition on scroll (capture phase for nested scrollable containers) and resize
        const handleScroll = () => updatePosition()

        // Lock body scroll while menu is open
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
      const items = el.querySelectorAll('[data-slot="dropdown-menu-item"]:not([aria-disabled="true"])')
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
        case 'ArrowRight': {
          const focused = document.activeElement as HTMLElement
          if (focused?.dataset.subTrigger === 'true') {
            e.preventDefault()
            focused.click()
            setTimeout(() => {
              const subContent = focused.closest('[data-slot="dropdown-menu-sub"]')?.querySelector('[data-slot="dropdown-menu-sub-content"][data-state="open"]') as HTMLElement
              const firstItem = subContent?.querySelector('[data-slot="dropdown-menu-item"]:not([aria-disabled="true"])') as HTMLElement
              firstItem?.focus()
            }, 50)
          }
          break
        }
        case 'Enter':
        case ' ':
          e.preventDefault()
          if (document.activeElement && (document.activeElement as HTMLElement).dataset.slot === 'dropdown-menu-item') {
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
      }
    })
  }

  return (
    <div
      data-slot="dropdown-menu-content"
      data-state="closed"
      role="menu"
      id={props.id}
      tabindex={-1}
      className={`${dropdownMenuContentBaseClasses} ${dropdownMenuContentClosedClasses} ${props.className ?? ''}`}
      ref={handleMount}
    >
      {props.children}
    </div>
  )
}

/**
 * Props for DropdownMenuItem component.
 */
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

/**
 * Individual dropdown menu item (action).
 * Auto-closes menu and returns focus to trigger on select.
 *
 * @param props.disabled - Whether disabled
 * @param props.onSelect - Selection callback
 * @param props.variant - Visual variant ('default' or 'destructive')
 */
function DropdownMenuItem(props: DropdownMenuItemProps) {
  const handleMount = (el: HTMLElement) => {
    const ctx = useContext(DropdownMenuContext)

    el.addEventListener('click', () => {
      if (el.getAttribute('aria-disabled') === 'true') return
      props.onSelect?.()
      ctx.onOpenChange(false)

      // Focus return: use stored trigger ref
      const content = el.closest('[data-slot="dropdown-menu-content"]') as HTMLElement
      const trigger = content ? contentTriggerMap.get(content) : null
      setTimeout(() => trigger?.focus(), 0)
    })
  }

  const isDisabled = createMemo(() => props.disabled ?? false)
  const isDestructive = createMemo(() => props.variant === 'destructive')
  const stateClasses = createMemo(() => isDisabled()
    ? dropdownMenuItemDisabledClasses
    : isDestructive()
      ? dropdownMenuItemDestructiveClasses
      : dropdownMenuItemDefaultClasses)

  return (
    <div
      data-slot="dropdown-menu-item"
      role="menuitem"
      id={props.id}
      aria-disabled={isDisabled() || undefined}
      tabindex={isDisabled() ? -1 : 0}
      className={`${dropdownMenuItemBaseClasses} ${stateClasses()} ${props.className ?? ''}`}
      ref={handleMount}
    >
      {props.children}
    </div>
  )
}

/**
 * Props for DropdownMenuCheckboxItem component.
 */
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

/**
 * Menu item with checkbox behavior.
 * Toggles on click without closing the menu.
 */
function DropdownMenuCheckboxItem(props: DropdownMenuCheckboxItemProps) {
  const handleMount = (el: HTMLElement) => {
    createEffect(() => {
      el.setAttribute('aria-checked', String(props.checked ?? false))
    })

    el.addEventListener('click', () => {
      if (el.getAttribute('aria-disabled') === 'true') return
      props.onCheckedChange?.(!(props.checked ?? false))
    })
  }

  const isDisabled = createMemo(() => props.disabled ?? false)

  return (
    <div
      data-slot="dropdown-menu-item"
      role="menuitemcheckbox"
      id={props.id}
      aria-checked={String(props.checked ?? false)}
      aria-disabled={isDisabled() || undefined}
      tabindex={isDisabled() ? -1 : 0}
      className={`${dropdownMenuCheckableItemClasses} ${isDisabled() ? dropdownMenuItemDisabledClasses : dropdownMenuItemDefaultClasses} ${props.className ?? ''}`}
      ref={handleMount}
    >
      <span className={dropdownMenuIndicatorClasses}>
        {(props.checked ?? false) ? (
          <CheckIcon className="size-4" />
        ) : null}
      </span>
      {props.children}
    </div>
  )
}

/**
 * Props for DropdownMenuRadioGroup component.
 */
interface DropdownMenuRadioGroupProps extends HTMLBaseAttributes {
  /** Currently selected value */
  value?: string
  /** Callback when value changes */
  onValueChange?: (value: string) => void
  /** RadioItem children */
  children?: Child
}

/**
 * Group of radio items for single selection.
 */
function DropdownMenuRadioGroup(props: DropdownMenuRadioGroupProps) {
  return (
    <DropdownMenuRadioGroupContext.Provider value={{
      value: () => props.value ?? '',
      onValueChange: props.onValueChange ?? (() => {}),
    }}>
      <div data-slot="dropdown-menu-radio-group" role="group" id={props.id} className={props.className ?? ''}>
        {props.children}
      </div>
    </DropdownMenuRadioGroupContext.Provider>
  )
}

/**
 * Props for DropdownMenuRadioItem component.
 */
interface DropdownMenuRadioItemProps extends HTMLBaseAttributes {
  /** Value for this radio item */
  value: string
  /** Whether disabled */
  disabled?: boolean
  /** Item content */
  children?: Child
}

/**
 * Menu item with radio behavior.
 * Selects on click without closing the menu.
 */
function DropdownMenuRadioItem(props: DropdownMenuRadioItemProps) {
  const handleMount = (el: HTMLElement) => {
    const radioCtx = useContext(DropdownMenuRadioGroupContext)

    createEffect(() => {
      el.setAttribute('aria-checked', String(radioCtx.value() === props.value))
    })

    el.addEventListener('click', () => {
      if (el.getAttribute('aria-disabled') === 'true') return
      radioCtx.onValueChange(props.value)
    })
  }

  const isDisabled = createMemo(() => props.disabled ?? false)

  return (
    <div
      data-slot="dropdown-menu-item"
      role="menuitemradio"
      id={props.id}
      aria-checked="false"
      aria-disabled={isDisabled() || undefined}
      tabindex={isDisabled() ? -1 : 0}
      className={`${dropdownMenuCheckableItemClasses} ${isDisabled() ? dropdownMenuItemDisabledClasses : dropdownMenuItemDefaultClasses} ${props.className ?? ''}`}
      ref={handleMount}
    >
      <span className={dropdownMenuIndicatorClasses} data-slot="dropdown-menu-radio-indicator">
        {/* Dot indicator rendered reactively via effect */}
      </span>
      {props.children}
    </div>
  )
}

/**
 * Props for DropdownMenuSub component.
 */
interface DropdownMenuSubProps extends HTMLBaseAttributes {
  /** SubTrigger and SubContent */
  children?: Child
}

/**
 * Submenu container. Manages sub-open state internally.
 */
function DropdownMenuSub(props: DropdownMenuSubProps) {
  const [subOpen, setSubOpen] = createSignal(false)

  return (
    <DropdownMenuSubContext.Provider value={{
      subOpen,
      onSubOpenChange: setSubOpen,
    }}>
      <div data-slot="dropdown-menu-sub" id={props.id} className={`relative ${props.className ?? ''}`}>
        {props.children}
      </div>
    </DropdownMenuSubContext.Provider>
  )
}

/**
 * Props for DropdownMenuSubTrigger component.
 */
interface DropdownMenuSubTriggerProps extends HTMLBaseAttributes {
  /** Whether disabled */
  disabled?: boolean
  /** Trigger content */
  children?: Child
}

/**
 * Trigger element for a submenu.
 * Opens submenu on hover with delay.
 */
function DropdownMenuSubTrigger(props: DropdownMenuSubTriggerProps) {
  const handleMount = (el: HTMLElement) => {
    const subCtx = useContext(DropdownMenuSubContext)
    let hoverTimer: ReturnType<typeof setTimeout> | null = null

    createEffect(() => {
      el.setAttribute('aria-expanded', String(subCtx.subOpen()))
    })

    el.addEventListener('mouseenter', () => {
      if (el.getAttribute('aria-disabled') === 'true') return
      hoverTimer = setTimeout(() => subCtx.onSubOpenChange(true), 100)
    })

    el.addEventListener('mouseleave', (e: MouseEvent) => {
      if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null }
      // Don't close if moving to subcontent
      const related = e.relatedTarget as HTMLElement
      const subContent = el.closest('[data-slot="dropdown-menu-sub"]')?.querySelector('[data-slot="dropdown-menu-sub-content"]')
      if (subContent?.contains(related)) return
      subCtx.onSubOpenChange(false)
    })

    el.addEventListener('click', () => {
      if (el.getAttribute('aria-disabled') === 'true') return
      subCtx.onSubOpenChange(!subCtx.subOpen())
    })
  }

  const isDisabled = props.disabled ?? false

  return (
    <div
      data-slot="dropdown-menu-item"
      data-sub-trigger="true"
      role="menuitem"
      id={props.id}
      aria-haspopup="menu"
      aria-expanded="false"
      aria-disabled={isDisabled || undefined}
      tabindex={isDisabled ? -1 : 0}
      className={`${dropdownMenuSubTriggerClasses} ${isDisabled ? dropdownMenuItemDisabledClasses : dropdownMenuItemDefaultClasses} ${props.className ?? ''}`}
      ref={handleMount}
    >
      {props.children}
      <ChevronRightIcon className="ml-auto size-4" />
    </div>
  )
}

/**
 * Props for DropdownMenuSubContent component.
 */
interface DropdownMenuSubContentProps extends HTMLBaseAttributes {
  /** SubContent items */
  children?: Child
}

/**
 * Content container for a submenu.
 * Positioned to the right of the parent sub trigger.
 */
function DropdownMenuSubContent(props: DropdownMenuSubContentProps) {
  const handleMount = (el: HTMLElement) => {
    const subCtx = useContext(DropdownMenuSubContext)

    createEffect(() => {
      const isOpen = subCtx.subOpen()
      el.dataset.state = isOpen ? 'open' : 'closed'
      if (isOpen) {
        el.style.display = ''
      } else {
        el.style.display = 'none'
      }
    })

    // Close submenu on mouseleave (if not moving to trigger)
    el.addEventListener('mouseleave', (e: MouseEvent) => {
      const related = e.relatedTarget as HTMLElement
      const sub = el.closest('[data-slot="dropdown-menu-sub"]')
      const trigger = sub?.querySelector('[data-sub-trigger="true"]')
      if (trigger?.contains(related)) return
      subCtx.onSubOpenChange(false)
    })

    // Keyboard navigation within subcontent
    el.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'ArrowLeft') {
        e.preventDefault()
        e.stopPropagation()
        subCtx.onSubOpenChange(false)
        // Focus back to sub trigger
        const sub = el.closest('[data-slot="dropdown-menu-sub"]')
        const trigger = sub?.querySelector('[data-sub-trigger="true"]') as HTMLElement
        trigger?.focus()
        return
      }

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        const items = el.querySelectorAll('[data-slot="dropdown-menu-item"]:not([aria-disabled="true"])')
        const currentIndex = Array.from(items).findIndex(item => item === document.activeElement)
        if (e.key === 'ArrowDown') {
          const nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0
          ;(items[nextIndex] as HTMLElement).focus()
        } else {
          const prevIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1
          ;(items[prevIndex] as HTMLElement).focus()
        }
        return
      }

      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        e.stopPropagation()
        if (document.activeElement && (document.activeElement as HTMLElement).dataset.slot === 'dropdown-menu-item') {
          ;(document.activeElement as HTMLElement).click()
        }
      }
    })
  }

  return (
    <div
      data-slot="dropdown-menu-sub-content"
      data-state="closed"
      role="menu"
      id={props.id}
      tabindex={-1}
      style="display:none"
      className={`${dropdownMenuSubContentBaseClasses} left-full top-0 ${props.className ?? ''}`}
      ref={handleMount}
    >
      {props.children}
    </div>
  )
}

/**
 * Props for DropdownMenuLabel component.
 */
interface DropdownMenuLabelProps extends HTMLBaseAttributes {
  /** Label text */
  children?: Child
}

/**
 * Section label inside the dropdown menu.
 *
 * @param props.children - Label content
 */
function DropdownMenuLabel({ children, className = '', ...props }: DropdownMenuLabelProps) {
  return (
    <div data-slot="dropdown-menu-label" className={`${dropdownMenuLabelClasses} ${className}`} {...props}>
      {children}
    </div>
  )
}

/**
 * Props for DropdownMenuSeparator component.
 */
interface DropdownMenuSeparatorProps extends HTMLBaseAttributes {
}

/**
 * Visual separator between menu item groups.
 */
function DropdownMenuSeparator({ className = '', ...props }: DropdownMenuSeparatorProps) {
  return (
    <div data-slot="dropdown-menu-separator" role="separator" className={`${dropdownMenuSeparatorClasses} ${className}`} {...props} />
  )
}

/**
 * Props for DropdownMenuShortcut component.
 */
interface DropdownMenuShortcutProps extends HTMLBaseAttributes {
  /** Shortcut text (e.g., "Ctrl+Q") */
  children?: Child
}

/**
 * Keyboard shortcut indicator displayed inside a menu item.
 *
 * @param props.children - Shortcut text
 */
function DropdownMenuShortcut({ children, className = '', ...props }: DropdownMenuShortcutProps) {
  return (
    <span data-slot="dropdown-menu-shortcut" className={`${dropdownMenuShortcutClasses} ${className}`} {...props}>
      {children}
    </span>
  )
}

/**
 * Props for DropdownMenuGroup component.
 */
interface DropdownMenuGroupProps extends HTMLBaseAttributes {
  /** Grouped menu items */
  children?: Child
}

/**
 * Semantic grouping of related menu items.
 *
 * @param props.children - Grouped items
 */
function DropdownMenuGroup({ children, className = '', ...props }: DropdownMenuGroupProps) {
  return (
    <div data-slot="dropdown-menu-group" role="group" className={className} {...props}>
      {children}
    </div>
  )
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
}

export type {
  DropdownMenuProps,
  DropdownMenuTriggerProps,
  DropdownMenuContentProps,
  DropdownMenuItemProps,
  DropdownMenuCheckboxItemProps,
  DropdownMenuRadioGroupProps,
  DropdownMenuRadioItemProps,
  DropdownMenuSubProps,
  DropdownMenuSubTriggerProps,
  DropdownMenuSubContentProps,
  DropdownMenuLabelProps,
  DropdownMenuSeparatorProps,
  DropdownMenuShortcutProps,
  DropdownMenuGroupProps,
}
