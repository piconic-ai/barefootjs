"use client"

/**
 * ContextMenu Components
 *
 * A menu triggered by right-click (contextmenu event), positioned at mouse coordinates.
 * Inspired by shadcn/ui ContextMenu. Shares sub-component patterns with DropdownMenu.
 *
 * State management uses createContext/useContext for parent-child communication.
 * Root ContextMenu manages open state and mouse position, children consume via context.
 *
 * Features:
 * - Right-click to open at cursor position
 * - ESC key to close
 * - Arrow key navigation
 * - Accessibility (role="menu", role="menuitem")
 * - Submenu support with hover/keyboard navigation
 * - CheckboxItem for multi-select
 * - RadioGroup/RadioItem for single-select
 * - Destructive variant for dangerous actions
 *
 * @example Basic context menu
 * ```tsx
 * const [open, setOpen] = createSignal(false)
 *
 * <ContextMenu open={open()} onOpenChange={setOpen}>
 *   <ContextMenuTrigger>
 *     <div>Right-click here</div>
 *   </ContextMenuTrigger>
 *   <ContextMenuContent>
 *     <ContextMenuItem onSelect={() => {}}>Back</ContextMenuItem>
 *     <ContextMenuItem onSelect={() => {}}>Forward</ContextMenuItem>
 *   </ContextMenuContent>
 * </ContextMenu>
 * ```
 */

import { createContext, useContext, createSignal, createMemo, createEffect, createPortal, isSSRPortal, findSiblingSlot } from '@barefootjs/client-runtime'
import type { HTMLBaseAttributes } from '@barefootjs/jsx'
import type { Child } from '../../../types'
import { CheckIcon, ChevronRightIcon } from '../icon'

// Context for parent-child state sharing
interface ContextMenuContextValue {
  open: () => boolean
  onOpenChange: (open: boolean) => void
  position: () => { x: number; y: number }
  setPosition: (pos: { x: number; y: number }) => void
}

const ContextMenuContext = createContext<ContextMenuContextValue>()

// Context for Submenu state
interface ContextMenuSubContextValue {
  subOpen: () => boolean
  onSubOpenChange: (open: boolean) => void
}

const ContextMenuSubContext = createContext<ContextMenuSubContextValue>()

// Context for RadioGroup value
interface ContextMenuRadioGroupContextValue {
  value: () => string
  onValueChange: (value: string) => void
}

const ContextMenuRadioGroupContext = createContext<ContextMenuRadioGroupContextValue>()

// Store Content -> Trigger element mapping for focus return after portal
const contentTriggerMap = new WeakMap<HTMLElement, HTMLElement>()

// ContextMenuContent base classes
const contextMenuContentBaseClasses = 'fixed z-50 min-w-[8rem] rounded-md border bg-popover p-1 shadow-md transform-gpu origin-top transition-[opacity,transform] duration-normal ease-out'

// ContextMenuContent open/closed classes
const contextMenuContentOpenClasses = 'opacity-100 scale-100'
const contextMenuContentClosedClasses = 'opacity-0 scale-95 pointer-events-none'

// ContextMenuItem base classes
const contextMenuItemBaseClasses = 'relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden'

// ContextMenuItem state classes
const contextMenuItemDefaultClasses = 'text-popover-foreground hover:bg-accent/50 focus:bg-accent focus:text-accent-foreground'
const contextMenuItemDisabledClasses = 'pointer-events-none opacity-50'

// ContextMenuItem destructive variant classes
const contextMenuItemDestructiveClasses = 'text-destructive hover:bg-accent/50 focus:bg-accent focus:text-destructive'

// CheckboxItem / RadioItem classes (left padding for indicator)
const contextMenuCheckableItemClasses = 'relative flex cursor-pointer select-none items-center gap-2 rounded-sm py-1.5 pl-8 pr-2 text-sm outline-hidden'

// Indicator container classes (CheckIcon / DotIcon)
const contextMenuIndicatorClasses = 'absolute left-2 flex size-3.5 shrink-0 items-center justify-center'

// SubTrigger classes
const contextMenuSubTriggerClasses = 'relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden'

// SubContent classes (absolute positioned, similar to Content)
const contextMenuSubContentBaseClasses = 'absolute z-50 min-w-[8rem] rounded-md border bg-popover p-1 shadow-md'

// ContextMenuLabel classes
const contextMenuLabelClasses = 'px-2 py-1.5 text-sm font-semibold text-foreground'

// ContextMenuSeparator classes
const contextMenuSeparatorClasses = '-mx-1 my-1 h-px bg-border'

// ContextMenuShortcut classes
const contextMenuShortcutClasses = 'ml-auto text-xs tracking-widest text-muted-foreground'

/**
 * Props for ContextMenu component.
 */
interface ContextMenuProps extends HTMLBaseAttributes {
  /** Whether the context menu is open */
  open?: boolean
  /** Callback when open state should change */
  onOpenChange?: (open: boolean) => void
  /** ContextMenuTrigger and ContextMenuContent */
  children?: Child
}

/**
 * ContextMenu root component.
 * Provides open state to children via context.
 * Mouse position is managed internally.
 *
 * @param props.open - Whether the context menu is open
 * @param props.onOpenChange - Callback when open state should change
 */
function ContextMenu(props: ContextMenuProps) {
  const [position, setPosition] = createSignal({ x: 0, y: 0 })

  return (
    <ContextMenuContext.Provider value={{
      open: () => props.open ?? false,
      onOpenChange: props.onOpenChange ?? (() => {}),
      position,
      setPosition,
    }}>
      <div data-slot="context-menu" id={props.id} className={props.className ?? ''}>
        {props.children}
      </div>
    </ContextMenuContext.Provider>
  )
}

/**
 * Props for ContextMenuTrigger component.
 */
interface ContextMenuTriggerProps extends HTMLBaseAttributes {
  /** Trigger content (the right-clickable area) */
  children?: Child
}

/**
 * Area that listens for right-click to open the context menu.
 * Uses display:contents wrapper to avoid layout interference.
 *
 * @param props.children - Content that triggers context menu on right-click
 */
function ContextMenuTrigger(props: ContextMenuTriggerProps) {
  const handleMount = (el: HTMLElement) => {
    const ctx = useContext(ContextMenuContext)

    el.addEventListener('contextmenu', (e: MouseEvent) => {
      e.preventDefault()
      ctx.setPosition({ x: e.clientX, y: e.clientY })
      ctx.onOpenChange(true)
    })
  }

  return (
    <span
      data-slot="context-menu-trigger"
      id={props.id}
      style="display:contents"
      ref={handleMount}
    >
      {props.children}
    </span>
  )
}

/**
 * Props for ContextMenuContent component.
 */
interface ContextMenuContentProps extends HTMLBaseAttributes {
  /** ContextMenuItem, ContextMenuLabel, ContextMenuSeparator components */
  children?: Child
}

/**
 * Content container for context menu items.
 * Portaled to body. Positioned at stored mouse coordinates.
 */
function ContextMenuContent(props: ContextMenuContentProps) {
  const handleMount = (el: HTMLElement) => {
    // Get trigger ref before portal (while still inside ContextMenu container)
    const triggerEl = findSiblingSlot(el, '[data-slot="context-menu-trigger"]')
    if (triggerEl) contentTriggerMap.set(el, triggerEl)

    // Portal to body to escape overflow clipping
    if (el && el.parentNode !== document.body && !isSSRPortal(el)) {
      const ownerScope = el.closest('[bf-s]') ?? undefined
      createPortal(el, document.body, { ownerScope })
    }

    const ctx = useContext(ContextMenuContext)

    // Position content at mouse coordinates
    const updatePosition = () => {
      const menuWidth = el.offsetWidth
      const menuHeight = el.offsetHeight
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight

      // Flip horizontally if menu would overflow right edge
      let x = ctx.position().x
      if (x + menuWidth > viewportWidth) {
        x = Math.max(0, viewportWidth - menuWidth)
      }

      // Flip vertically if menu would overflow bottom edge
      let y = ctx.position().y
      if (y + menuHeight > viewportHeight) {
        y = Math.max(0, viewportHeight - menuHeight)
      }

      el.style.top = `${y}px`
      el.style.left = `${x}px`
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
      el.className = `${contextMenuContentBaseClasses} ${isOpen ? contextMenuContentOpenClasses : contextMenuContentClosedClasses} ${props.className ?? ''}`

      if (isOpen) {
        updatePosition()

        // Close on click outside
        const handleClickOutside = (e: MouseEvent) => {
          if (!el.contains(e.target as Node)) {
            ctx.onOpenChange(false)
          }
        }

        // Close on ESC anywhere in the document
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
          if (e.key === 'Escape') {
            // If a submenu is open, let SubContent handle ESC
            const openSub = el.querySelector('[data-slot="context-menu-sub-content"][data-state="open"]')
            if (openSub) return
            ctx.onOpenChange(false)
          }
        }

        // Close on contextmenu outside (another right-click elsewhere)
        const handleContextMenu = (e: MouseEvent) => {
          if (!el.contains(e.target as Node) && !triggerEl?.contains(e.target as Node)) {
            ctx.onOpenChange(false)
          }
        }

        // Lock body scroll while menu is open
        const originalOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'

        document.addEventListener('mousedown', handleClickOutside)
        document.addEventListener('keydown', handleGlobalKeyDown)
        document.addEventListener('contextmenu', handleContextMenu)

        cleanupFns.push(
          () => { document.body.style.overflow = originalOverflow },
          () => document.removeEventListener('mousedown', handleClickOutside),
          () => document.removeEventListener('keydown', handleGlobalKeyDown),
          () => document.removeEventListener('contextmenu', handleContextMenu),
        )
      }
    })

    // Keyboard navigation within content
    el.addEventListener('keydown', (e: KeyboardEvent) => {
      const items = el.querySelectorAll('[data-slot="context-menu-item"]:not([aria-disabled="true"])')
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
              const subContent = focused.closest('[data-slot="context-menu-sub"]')?.querySelector('[data-slot="context-menu-sub-content"][data-state="open"]') as HTMLElement
              const firstItem = subContent?.querySelector('[data-slot="context-menu-item"]:not([aria-disabled="true"])') as HTMLElement
              firstItem?.focus()
            }, 50)
          }
          break
        }
        case 'Enter':
        case ' ':
          e.preventDefault()
          if (document.activeElement && (document.activeElement as HTMLElement).dataset.slot === 'context-menu-item') {
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
      data-slot="context-menu-content"
      data-state="closed"
      role="menu"
      id={props.id}
      tabindex={-1}
      className={`${contextMenuContentBaseClasses} ${contextMenuContentClosedClasses} ${props.className ?? ''}`}
      ref={handleMount}
    >
      {props.children}
    </div>
  )
}

/**
 * Props for ContextMenuItem component.
 */
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

/**
 * Individual context menu item (action).
 * Auto-closes menu on select.
 *
 * @param props.disabled - Whether disabled
 * @param props.onSelect - Selection callback
 * @param props.variant - Visual variant ('default' or 'destructive')
 */
function ContextMenuItem(props: ContextMenuItemProps) {
  const handleMount = (el: HTMLElement) => {
    const ctx = useContext(ContextMenuContext)

    el.addEventListener('click', () => {
      if (el.getAttribute('aria-disabled') === 'true') return
      props.onSelect?.()
      ctx.onOpenChange(false)
    })
  }

  const isDisabled = createMemo(() => props.disabled ?? false)
  const isDestructive = createMemo(() => props.variant === 'destructive')
  const stateClasses = createMemo(() => isDisabled()
    ? contextMenuItemDisabledClasses
    : isDestructive()
      ? contextMenuItemDestructiveClasses
      : contextMenuItemDefaultClasses)

  return (
    <div
      data-slot="context-menu-item"
      role="menuitem"
      id={props.id}
      aria-disabled={isDisabled() || undefined}
      tabindex={isDisabled() ? -1 : 0}
      className={`${contextMenuItemBaseClasses} ${stateClasses()} ${props.className ?? ''}`}
      ref={handleMount}
    >
      {props.children}
    </div>
  )
}

/**
 * Props for ContextMenuCheckboxItem component.
 */
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

/**
 * Menu item with checkbox behavior.
 * Toggles on click without closing the menu.
 */
function ContextMenuCheckboxItem(props: ContextMenuCheckboxItemProps) {
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
      data-slot="context-menu-item"
      role="menuitemcheckbox"
      id={props.id}
      aria-checked={String(props.checked ?? false)}
      aria-disabled={isDisabled() || undefined}
      tabindex={isDisabled() ? -1 : 0}
      className={`${contextMenuCheckableItemClasses} ${isDisabled() ? contextMenuItemDisabledClasses : contextMenuItemDefaultClasses} ${props.className ?? ''}`}
      ref={handleMount}
    >
      <span className={contextMenuIndicatorClasses}>
        {(props.checked ?? false) ? (
          <CheckIcon className="size-4" />
        ) : null}
      </span>
      {props.children}
    </div>
  )
}

/**
 * Props for ContextMenuRadioGroup component.
 */
interface ContextMenuRadioGroupProps extends HTMLBaseAttributes {
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
function ContextMenuRadioGroup(props: ContextMenuRadioGroupProps) {
  return (
    <ContextMenuRadioGroupContext.Provider value={{
      value: () => props.value ?? '',
      onValueChange: props.onValueChange ?? (() => {}),
    }}>
      <div data-slot="context-menu-radio-group" role="group" id={props.id} className={props.className ?? ''}>
        {props.children}
      </div>
    </ContextMenuRadioGroupContext.Provider>
  )
}

/**
 * Props for ContextMenuRadioItem component.
 */
interface ContextMenuRadioItemProps extends HTMLBaseAttributes {
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
function ContextMenuRadioItem(props: ContextMenuRadioItemProps) {
  const handleMount = (el: HTMLElement) => {
    const radioCtx = useContext(ContextMenuRadioGroupContext)

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
      data-slot="context-menu-item"
      role="menuitemradio"
      id={props.id}
      aria-checked="false"
      aria-disabled={isDisabled() || undefined}
      tabindex={isDisabled() ? -1 : 0}
      className={`${contextMenuCheckableItemClasses} ${isDisabled() ? contextMenuItemDisabledClasses : contextMenuItemDefaultClasses} ${props.className ?? ''}`}
      ref={handleMount}
    >
      <span className={contextMenuIndicatorClasses} data-slot="context-menu-radio-indicator">
        {/* Dot indicator rendered reactively via effect */}
      </span>
      {props.children}
    </div>
  )
}

/**
 * Props for ContextMenuSub component.
 */
interface ContextMenuSubProps extends HTMLBaseAttributes {
  /** SubTrigger and SubContent */
  children?: Child
}

/**
 * Submenu container. Manages sub-open state internally.
 */
function ContextMenuSub(props: ContextMenuSubProps) {
  const [subOpen, setSubOpen] = createSignal(false)

  return (
    <ContextMenuSubContext.Provider value={{
      subOpen,
      onSubOpenChange: setSubOpen,
    }}>
      <div data-slot="context-menu-sub" id={props.id} className={`relative ${props.className ?? ''}`}>
        {props.children}
      </div>
    </ContextMenuSubContext.Provider>
  )
}

/**
 * Props for ContextMenuSubTrigger component.
 */
interface ContextMenuSubTriggerProps extends HTMLBaseAttributes {
  /** Whether disabled */
  disabled?: boolean
  /** Trigger content */
  children?: Child
}

/**
 * Trigger element for a submenu.
 * Opens submenu on hover with delay.
 */
function ContextMenuSubTrigger(props: ContextMenuSubTriggerProps) {
  const handleMount = (el: HTMLElement) => {
    const subCtx = useContext(ContextMenuSubContext)
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
      const subContent = el.closest('[data-slot="context-menu-sub"]')?.querySelector('[data-slot="context-menu-sub-content"]')
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
      data-slot="context-menu-item"
      data-sub-trigger="true"
      role="menuitem"
      id={props.id}
      aria-haspopup="menu"
      aria-expanded="false"
      aria-disabled={isDisabled || undefined}
      tabindex={isDisabled ? -1 : 0}
      className={`${contextMenuSubTriggerClasses} ${isDisabled ? contextMenuItemDisabledClasses : contextMenuItemDefaultClasses} ${props.className ?? ''}`}
      ref={handleMount}
    >
      {props.children}
      <ChevronRightIcon className="ml-auto size-4" />
    </div>
  )
}

/**
 * Props for ContextMenuSubContent component.
 */
interface ContextMenuSubContentProps extends HTMLBaseAttributes {
  /** SubContent items */
  children?: Child
}

/**
 * Content container for a submenu.
 * Positioned to the right of the parent sub trigger.
 */
function ContextMenuSubContent(props: ContextMenuSubContentProps) {
  const handleMount = (el: HTMLElement) => {
    const subCtx = useContext(ContextMenuSubContext)

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
      const sub = el.closest('[data-slot="context-menu-sub"]')
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
        const sub = el.closest('[data-slot="context-menu-sub"]')
        const trigger = sub?.querySelector('[data-sub-trigger="true"]') as HTMLElement
        trigger?.focus()
        return
      }

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        const items = el.querySelectorAll('[data-slot="context-menu-item"]:not([aria-disabled="true"])')
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
        if (document.activeElement && (document.activeElement as HTMLElement).dataset.slot === 'context-menu-item') {
          ;(document.activeElement as HTMLElement).click()
        }
      }
    })
  }

  return (
    <div
      data-slot="context-menu-sub-content"
      data-state="closed"
      role="menu"
      id={props.id}
      tabindex={-1}
      style="display:none"
      className={`${contextMenuSubContentBaseClasses} left-full top-0 ${props.className ?? ''}`}
      ref={handleMount}
    >
      {props.children}
    </div>
  )
}

/**
 * Props for ContextMenuLabel component.
 */
interface ContextMenuLabelProps extends HTMLBaseAttributes {
  /** Label text */
  children?: Child
}

/**
 * Section label inside the context menu.
 *
 * @param props.children - Label content
 */
function ContextMenuLabel({ children, className = '', ...props }: ContextMenuLabelProps) {
  return (
    <div data-slot="context-menu-label" className={`${contextMenuLabelClasses} ${className}`} {...props}>
      {children}
    </div>
  )
}

/**
 * Props for ContextMenuSeparator component.
 */
interface ContextMenuSeparatorProps extends HTMLBaseAttributes {
}

/**
 * Visual separator between menu item groups.
 */
function ContextMenuSeparator({ className = '', ...props }: ContextMenuSeparatorProps) {
  return (
    <div data-slot="context-menu-separator" role="separator" className={`${contextMenuSeparatorClasses} ${className}`} {...props} />
  )
}

/**
 * Props for ContextMenuShortcut component.
 */
interface ContextMenuShortcutProps extends HTMLBaseAttributes {
  /** Shortcut text (e.g., "Ctrl+Q") */
  children?: Child
}

/**
 * Keyboard shortcut indicator displayed inside a menu item.
 *
 * @param props.children - Shortcut text
 */
function ContextMenuShortcut({ children, className = '', ...props }: ContextMenuShortcutProps) {
  return (
    <span data-slot="context-menu-shortcut" className={`${contextMenuShortcutClasses} ${className}`} {...props}>
      {children}
    </span>
  )
}

/**
 * Props for ContextMenuGroup component.
 */
interface ContextMenuGroupProps extends HTMLBaseAttributes {
  /** Grouped menu items */
  children?: Child
}

/**
 * Semantic grouping of related menu items.
 *
 * @param props.children - Grouped items
 */
function ContextMenuGroup({ children, className = '', ...props }: ContextMenuGroupProps) {
  return (
    <div data-slot="context-menu-group" role="group" className={className} {...props}>
      {children}
    </div>
  )
}

export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuCheckboxItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuGroup,
}

export type {
  ContextMenuProps,
  ContextMenuTriggerProps,
  ContextMenuContentProps,
  ContextMenuItemProps,
  ContextMenuCheckboxItemProps,
  ContextMenuRadioGroupProps,
  ContextMenuRadioItemProps,
  ContextMenuSubProps,
  ContextMenuSubTriggerProps,
  ContextMenuSubContentProps,
  ContextMenuLabelProps,
  ContextMenuSeparatorProps,
  ContextMenuShortcutProps,
  ContextMenuGroupProps,
}
