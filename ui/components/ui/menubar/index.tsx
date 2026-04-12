"use client"

/**
 * Menubar Components
 *
 * A visually persistent horizontal menu bar common in desktop applications
 * (File, Edit, View pattern). When one menu is open, hovering another
 * trigger opens that menu instead (roving behavior).
 *
 * Inspired by shadcn/ui Menubar with CSS variable theming support.
 * Built on the same patterns as DropdownMenu with bar-level coordination.
 *
 * Architecture: Bar-level coordination uses MenubarContext (activeMenu signal).
 * MenubarMenu is a pure DOM wrapper with data-value attribute.
 * MenubarTrigger and MenubarContent derive their menu value from the DOM
 * via closest('[data-slot="menubar-menu"]') and access context only in ref handlers.
 *
 * Features:
 * - Roving hover: hovering a trigger opens it if any menu is already open
 * - ArrowLeft/Right navigates between menubar triggers
 * - ESC key to close
 * - Arrow key navigation within menus
 * - Accessibility (role="menubar", role="menu", role="menuitem")
 * - Submenu support with hover/keyboard navigation
 * - CheckboxItem for multi-select
 * - RadioGroup/RadioItem for single-select
 *
 * @example Basic menubar
 * ```tsx
 * <Menubar>
 *   <MenubarMenu value="file">
 *     <MenubarTrigger>File</MenubarTrigger>
 *     <MenubarContent>
 *       <MenubarItem>New Tab</MenubarItem>
 *       <MenubarItem>New Window</MenubarItem>
 *     </MenubarContent>
 *   </MenubarMenu>
 * </Menubar>
 * ```
 */

import { createContext, useContext, createSignal, createMemo, createEffect, createPortal, isSSRPortal } from '@barefootjs/client-runtime'
import type { HTMLBaseAttributes } from '@barefootjs/jsx'
import type { Child } from '../../../types'
import { CheckIcon, ChevronRightIcon } from '../icon'

// Bar-level context: coordinates which menu is active
interface MenubarContextValue {
  activeMenu: () => string
  onActiveMenuChange: (value: string) => void
}

const MenubarContext = createContext<MenubarContextValue>()

// Submenu context (same pattern as DropdownMenu)
interface MenubarSubContextValue {
  subOpen: () => boolean
  onSubOpenChange: (open: boolean) => void
}

const MenubarSubContext = createContext<MenubarSubContextValue>()

// RadioGroup context (same pattern as DropdownMenu)
interface MenubarRadioGroupContextValue {
  value: () => string
  onValueChange: (value: string) => void
}

const MenubarRadioGroupContext = createContext<MenubarRadioGroupContextValue>()

// Store Content -> Trigger element mapping for focus return after portal
const contentTriggerMap = new WeakMap<HTMLElement, HTMLElement>()

// CSS classes
const menubarClasses = 'flex h-9 items-center gap-1 rounded-md border bg-background p-1 shadow-xs'
const menubarTriggerBaseClasses = 'flex items-center rounded-sm px-2 py-1 text-sm font-medium outline-hidden select-none cursor-pointer'
const menubarTriggerDefaultClasses = 'text-foreground hover:bg-accent/50 focus:bg-accent'
const menubarTriggerOpenClasses = 'bg-accent text-accent-foreground'
const menubarContentBaseClasses = 'fixed z-50 min-w-[12rem] rounded-md border bg-popover p-1 shadow-md transform-gpu origin-top transition-[opacity,transform] duration-normal ease-out'
const menubarContentOpenClasses = 'opacity-100 scale-100'
const menubarContentClosedClasses = 'opacity-0 scale-95 pointer-events-none'
const menubarItemBaseClasses = 'relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden'
const menubarItemDefaultClasses = 'text-popover-foreground hover:bg-accent/50 focus:bg-accent focus:text-accent-foreground'
const menubarItemDisabledClasses = 'pointer-events-none opacity-50'
const menubarItemDestructiveClasses = 'text-destructive hover:bg-accent/50 focus:bg-accent focus:text-destructive'
const menubarCheckableItemClasses = 'relative flex cursor-pointer select-none items-center gap-2 rounded-sm py-1.5 pl-8 pr-2 text-sm outline-hidden'
const menubarIndicatorClasses = 'absolute left-2 flex size-3.5 shrink-0 items-center justify-center'
const menubarSubTriggerClasses = 'relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden'
const menubarSubContentBaseClasses = 'absolute z-50 min-w-[8rem] rounded-md border bg-popover p-1 shadow-md'
const menubarLabelClasses = 'px-2 py-1.5 text-sm font-semibold text-foreground'
const menubarSeparatorClasses = '-mx-1 my-1 h-px bg-border'
const menubarShortcutClasses = 'ml-auto text-xs tracking-widest text-muted-foreground'

// --- Menubar (root) ---

interface MenubarProps extends HTMLBaseAttributes {
  /** MenubarMenu children */
  children?: Child
}

/**
 * Menubar root component.
 * Manages which menu is currently active via a signal.
 */
function Menubar(props: MenubarProps) {
  const [activeMenu, setActiveMenu] = createSignal('')

  const handleMount = (el: HTMLElement) => {
    // Global click-outside handler
    const handleClickOutside = (e: MouseEvent) => {
      if (!el.contains(e.target as Node)) {
        // Also check portaled content
        const openContent = document.querySelector('[data-slot="menubar-content"][data-state="open"]')
        if (openContent && openContent.contains(e.target as Node)) return
        setActiveMenu('')
      }
    }

    // Global ESC handler
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // If a submenu is open, let SubContent handle ESC
        const openSub = document.querySelector('[data-slot="menubar-sub-content"][data-state="open"]')
        if (openSub) return
        if (activeMenu() !== '') {
          const currentValue = activeMenu()
          setActiveMenu('')
          // Focus back to the trigger that was active
          const trigger = el.querySelector(`[data-slot="menubar-trigger"][data-value="${currentValue}"]`) as HTMLElement
          trigger?.focus()
        }
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleGlobalKeyDown)
  }

  return (
    <MenubarContext.Provider value={{
      activeMenu,
      onActiveMenuChange: setActiveMenu,
    }}>
      <div
        data-slot="menubar"
        role="menubar"
        id={props.id}
        className={`${menubarClasses} ${props.className ?? ''}`}
        ref={handleMount}
      >
        {props.children}
      </div>
    </MenubarContext.Provider>
  )
}

// --- MenubarMenu ---

interface MenubarMenuProps extends HTMLBaseAttributes {
  /** Unique value identifying this menu */
  value?: string
  /** MenubarTrigger and MenubarContent */
  children?: Child
}

/**
 * Groups a trigger and its content.
 * Pure DOM wrapper — writes data-value for children to read.
 * No useContext here to avoid SSR issues.
 */
function MenubarMenu(props: MenubarMenuProps) {
  return (
    <div data-slot="menubar-menu" data-value={props.value ?? ''} id={props.id} className={props.className ?? ''}>
      {props.children}
    </div>
  )
}

// --- MenubarTrigger ---

interface MenubarTriggerProps extends HTMLBaseAttributes {
  /** Trigger content (text label) */
  children?: Child
}

/**
 * Button that toggles its menu. Hover opens if any menu is already open.
 * ArrowLeft/Right navigates to adjacent triggers.
 * Derives menu value from parent MenubarMenu's data-value attribute.
 */
function MenubarTrigger(props: MenubarTriggerProps) {
  const handleMount = (el: HTMLElement) => {
    const barCtx = useContext(MenubarContext)
    const menuEl = el.closest('[data-slot="menubar-menu"]')
    const menuValue = menuEl?.getAttribute('data-value') ?? ''
    el.dataset.value = menuValue

    // Reactive styling based on open state
    createEffect(() => {
      const isOpen = barCtx.activeMenu() === menuValue
      el.dataset.state = isOpen ? 'open' : 'closed'
      el.setAttribute('aria-expanded', String(isOpen))
      const baseClasses = `${menubarTriggerBaseClasses} ${isOpen ? menubarTriggerOpenClasses : menubarTriggerDefaultClasses} ${props.className ?? ''}`
      el.className = baseClasses
    })

    // Click to toggle
    el.addEventListener('click', () => {
      const isOpen = barCtx.activeMenu() === menuValue
      barCtx.onActiveMenuChange(isOpen ? '' : menuValue)
    })

    // Hover opens if any menu is already open (roving behavior)
    el.addEventListener('mouseenter', () => {
      if (barCtx.activeMenu() !== '' && barCtx.activeMenu() !== menuValue) {
        barCtx.onActiveMenuChange(menuValue)
      }
    })

    // Keyboard navigation between triggers
    el.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault()
        const bar = el.closest('[data-slot="menubar"]')
        if (!bar) return
        const triggers = Array.from(bar.querySelectorAll('[data-slot="menubar-trigger"]')) as HTMLElement[]
        const currentIndex = triggers.indexOf(el)
        let nextIndex: number
        if (e.key === 'ArrowRight') {
          nextIndex = currentIndex < triggers.length - 1 ? currentIndex + 1 : 0
        } else {
          nextIndex = currentIndex > 0 ? currentIndex - 1 : triggers.length - 1
        }
        const nextTrigger = triggers[nextIndex]
        nextTrigger.focus()
        // If a menu was open, open the new one
        if (barCtx.activeMenu() !== '') {
          const nextValue = nextTrigger.dataset.value ?? ''
          barCtx.onActiveMenuChange(nextValue)
        }
      }
    })
  }

  return (
    <button
      data-slot="menubar-trigger"
      type="button"
      role="menuitem"
      aria-haspopup="menu"
      aria-expanded="false"
      data-state="closed"
      className={`${menubarTriggerBaseClasses} ${menubarTriggerDefaultClasses} ${props.className ?? ''}`}
      id={props.id}
      ref={handleMount}
    >
      {props.children}
    </button>
  )
}

// --- MenubarContent ---

interface MenubarContentProps extends HTMLBaseAttributes {
  /** Menu items */
  children?: Child
  /** Alignment relative to trigger */
  align?: 'start' | 'end'
}

/**
 * Content container for menu items. Portaled to body, positioned below trigger.
 * ArrowLeft/Right navigates to adjacent menubar triggers.
 * Derives menu value from parent MenubarMenu's data-value attribute.
 */
function MenubarContent(props: MenubarContentProps) {
  const handleMount = (el: HTMLElement) => {
    // Get menu value and trigger ref before portal
    const menuEl = el.closest('[data-slot="menubar-menu"]')
    const menuValue = menuEl?.getAttribute('data-value') ?? ''
    const triggerEl = menuEl?.querySelector('[data-slot="menubar-trigger"]') as HTMLElement
    if (triggerEl) contentTriggerMap.set(el, triggerEl)

    // Portal to body
    if (el && el.parentNode !== document.body && !isSSRPortal(el)) {
      const ownerScope = el.closest('[bf-s]') ?? undefined
      createPortal(el, document.body, { ownerScope })
    }

    const barCtx = useContext(MenubarContext)

    // Position content relative to trigger
    const updatePosition = () => {
      if (!triggerEl) return
      const rect = triggerEl.getBoundingClientRect()
      el.style.top = `${rect.bottom + 8}px`
      if (props.align === 'end') {
        el.style.left = `${rect.right - el.offsetWidth}px`
      } else {
        el.style.left = `${rect.left}px`
      }
    }

    let cleanupFns: Function[] = []

    // Reactive show/hide + positioning
    createEffect(() => {
      for (const fn of cleanupFns) fn()
      cleanupFns = []

      const isOpen = barCtx.activeMenu() === menuValue
      el.dataset.state = isOpen ? 'open' : 'closed'
      el.className = `${menubarContentBaseClasses} ${isOpen ? menubarContentOpenClasses : menubarContentClosedClasses} ${props.className ?? ''}`

      if (isOpen) {
        updatePosition()

        // Reposition on scroll/resize
        const handleScroll = () => updatePosition()

        window.addEventListener('scroll', handleScroll, true)
        window.addEventListener('resize', handleScroll)

        cleanupFns.push(
          () => window.removeEventListener('scroll', handleScroll, true),
          () => window.removeEventListener('resize', handleScroll),
        )
      }
    })

    // Keyboard navigation within content
    el.addEventListener('keydown', (e: KeyboardEvent) => {
      const items = el.querySelectorAll('[data-slot="menubar-item"]:not([aria-disabled="true"])')
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
            // Open submenu
            e.preventDefault()
            focused.click()
            setTimeout(() => {
              const subContent = focused.closest('[data-slot="menubar-sub"]')?.querySelector('[data-slot="menubar-sub-content"][data-state="open"]') as HTMLElement
              const firstItem = subContent?.querySelector('[data-slot="menubar-item"]:not([aria-disabled="true"])') as HTMLElement
              firstItem?.focus()
            }, 50)
          } else {
            // Navigate to next menubar trigger
            e.preventDefault()
            const currentTrigger = contentTriggerMap.get(el)
            const bar = currentTrigger?.closest('[data-slot="menubar"]')
            if (!bar) break
            const triggers = Array.from(bar.querySelectorAll('[data-slot="menubar-trigger"]')) as HTMLElement[]
            const triggerIndex = currentTrigger ? triggers.indexOf(currentTrigger) : -1
            const nextIndex = triggerIndex < triggers.length - 1 ? triggerIndex + 1 : 0
            const nextTrigger = triggers[nextIndex]
            nextTrigger.focus()
            const nextValue = nextTrigger.dataset.value ?? ''
            barCtx.onActiveMenuChange(nextValue)
          }
          break
        }
        case 'ArrowLeft': {
          // Navigate to previous menubar trigger
          e.preventDefault()
          const currentTrigger = contentTriggerMap.get(el)
          const bar = currentTrigger?.closest('[data-slot="menubar"]')
          if (!bar) break
          const triggers = Array.from(bar.querySelectorAll('[data-slot="menubar-trigger"]')) as HTMLElement[]
          const triggerIndex = currentTrigger ? triggers.indexOf(currentTrigger) : -1
          const prevIndex = triggerIndex > 0 ? triggerIndex - 1 : triggers.length - 1
          const prevTrigger = triggers[prevIndex]
          prevTrigger.focus()
          const prevValue = prevTrigger.dataset.value ?? ''
          barCtx.onActiveMenuChange(prevValue)
          break
        }
        case 'Enter':
        case ' ':
          e.preventDefault()
          if (document.activeElement && (document.activeElement as HTMLElement).dataset.slot === 'menubar-item') {
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
      data-slot="menubar-content"
      data-state="closed"
      role="menu"
      tabindex={-1}
      className={`${menubarContentBaseClasses} ${menubarContentClosedClasses} ${props.className ?? ''}`}
      id={props.id}
      ref={handleMount}
    >
      {props.children}
    </div>
  )
}

// --- MenubarItem ---

interface MenubarItemProps extends HTMLBaseAttributes {
  /** Whether disabled */
  disabled?: boolean
  /** Callback when item is selected (menu auto-closes) */
  onSelect?: () => void
  /** Visual variant */
  variant?: 'default' | 'destructive'
  /** Item content */
  children?: Child
}

/**
 * Individual menu item. Auto-closes menu on select.
 */
function MenubarItem(props: MenubarItemProps) {
  const handleMount = (el: HTMLElement) => {
    const barCtx = useContext(MenubarContext)

    // Reactively update disabled state
    createEffect(() => {
      const isDisabled = props.disabled ?? false
      const isDestructive = props.variant === 'destructive'
      const stateClasses = isDisabled
        ? menubarItemDisabledClasses
        : isDestructive
          ? menubarItemDestructiveClasses
          : menubarItemDefaultClasses
      if (isDisabled) {
        el.setAttribute('aria-disabled', 'true')
      } else {
        el.removeAttribute('aria-disabled')
      }
      el.tabIndex = isDisabled ? -1 : 0
      el.className = `${menubarItemBaseClasses} ${stateClasses} ${props.className ?? ''}`
    })

    el.addEventListener('click', () => {
      if (el.getAttribute('aria-disabled') === 'true') return
      props.onSelect?.()
      barCtx.onActiveMenuChange('')

      // Focus return to trigger
      const content = el.closest('[data-slot="menubar-content"]') as HTMLElement
      const trigger = content ? contentTriggerMap.get(content) : null
      setTimeout(() => trigger?.focus(), 0)
    })
  }

  return (
    <div
      data-slot="menubar-item"
      role="menuitem"
      id={props.id}
      aria-disabled={props.disabled || undefined}
      tabindex={props.disabled ? -1 : 0}
      className={`${menubarItemBaseClasses} ${props.disabled ? menubarItemDisabledClasses : props.variant === 'destructive' ? menubarItemDestructiveClasses : menubarItemDefaultClasses} ${props.className ?? ''}`}
      ref={handleMount}
    >
      {props.children}
    </div>
  )
}

// --- MenubarCheckboxItem ---

interface MenubarCheckboxItemProps extends HTMLBaseAttributes {
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
 * Menu item with checkbox behavior. Toggles without closing the menu.
 */
function MenubarCheckboxItem(props: MenubarCheckboxItemProps) {
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
      data-slot="menubar-item"
      role="menuitemcheckbox"
      id={props.id}
      aria-checked={String(props.checked ?? false)}
      aria-disabled={isDisabled() || undefined}
      tabindex={isDisabled() ? -1 : 0}
      className={`${menubarCheckableItemClasses} ${isDisabled() ? menubarItemDisabledClasses : menubarItemDefaultClasses} ${props.className ?? ''}`}
      ref={handleMount}
    >
      <span className={menubarIndicatorClasses}>
        {(props.checked ?? false) ? (
          <CheckIcon className="size-4" />
        ) : null}
      </span>
      {props.children}
    </div>
  )
}

// --- MenubarRadioGroup ---

interface MenubarRadioGroupProps extends HTMLBaseAttributes {
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
function MenubarRadioGroup(props: MenubarRadioGroupProps) {
  return (
    <MenubarRadioGroupContext.Provider value={{
      value: () => props.value ?? '',
      onValueChange: props.onValueChange ?? (() => {}),
    }}>
      <div data-slot="menubar-radio-group" role="group" id={props.id} className={props.className ?? ''}>
        {props.children}
      </div>
    </MenubarRadioGroupContext.Provider>
  )
}

// --- MenubarRadioItem ---

interface MenubarRadioItemProps extends HTMLBaseAttributes {
  /** Value for this radio item */
  value: string
  /** Whether disabled */
  disabled?: boolean
  /** Item content */
  children?: Child
}

/**
 * Menu item with radio behavior. Selects without closing the menu.
 */
function MenubarRadioItem(props: MenubarRadioItemProps) {
  const handleMount = (el: HTMLElement) => {
    const radioCtx = useContext(MenubarRadioGroupContext)

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
      data-slot="menubar-item"
      role="menuitemradio"
      id={props.id}
      aria-checked="false"
      aria-disabled={isDisabled() || undefined}
      tabindex={isDisabled() ? -1 : 0}
      className={`${menubarCheckableItemClasses} ${isDisabled() ? menubarItemDisabledClasses : menubarItemDefaultClasses} ${props.className ?? ''}`}
      ref={handleMount}
    >
      <span className={menubarIndicatorClasses} data-slot="menubar-radio-indicator">
        {/* Dot indicator rendered reactively via effect */}
      </span>
      {props.children}
    </div>
  )
}

// --- MenubarSub ---

interface MenubarSubProps extends HTMLBaseAttributes {
  /** SubTrigger and SubContent */
  children?: Child
}

/**
 * Submenu container. Manages sub-open state internally.
 */
function MenubarSub(props: MenubarSubProps) {
  const [subOpen, setSubOpen] = createSignal(false)

  return (
    <MenubarSubContext.Provider value={{
      subOpen,
      onSubOpenChange: setSubOpen,
    }}>
      <div data-slot="menubar-sub" id={props.id} className={`relative ${props.className ?? ''}`}>
        {props.children}
      </div>
    </MenubarSubContext.Provider>
  )
}

// --- MenubarSubTrigger ---

interface MenubarSubTriggerProps extends HTMLBaseAttributes {
  /** Whether disabled */
  disabled?: boolean
  /** Trigger content */
  children?: Child
}

/**
 * Trigger element for a submenu. Opens on hover with delay.
 */
function MenubarSubTrigger(props: MenubarSubTriggerProps) {
  const handleMount = (el: HTMLElement) => {
    const subCtx = useContext(MenubarSubContext)
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
      const related = e.relatedTarget as HTMLElement
      const subContent = el.closest('[data-slot="menubar-sub"]')?.querySelector('[data-slot="menubar-sub-content"]')
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
      data-slot="menubar-item"
      data-sub-trigger="true"
      role="menuitem"
      aria-haspopup="menu"
      aria-expanded="false"
      aria-disabled={isDisabled || undefined}
      tabindex={isDisabled ? -1 : 0}
      className={`${menubarSubTriggerClasses} ${isDisabled ? menubarItemDisabledClasses : menubarItemDefaultClasses} ${props.className ?? ''}`}
      id={props.id}
      ref={handleMount}
    >
      {props.children}
      <ChevronRightIcon className="ml-auto size-4" />
    </div>
  )
}

// --- MenubarSubContent ---

interface MenubarSubContentProps extends HTMLBaseAttributes {
  /** SubContent items */
  children?: Child
}

/**
 * Content container for a submenu. Positioned to the right of the trigger.
 */
function MenubarSubContent(props: MenubarSubContentProps) {
  const handleMount = (el: HTMLElement) => {
    const subCtx = useContext(MenubarSubContext)

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
      const sub = el.closest('[data-slot="menubar-sub"]')
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
        const sub = el.closest('[data-slot="menubar-sub"]')
        const trigger = sub?.querySelector('[data-sub-trigger="true"]') as HTMLElement
        trigger?.focus()
        return
      }

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        const items = el.querySelectorAll('[data-slot="menubar-item"]:not([aria-disabled="true"])')
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
        if (document.activeElement && (document.activeElement as HTMLElement).dataset.slot === 'menubar-item') {
          ;(document.activeElement as HTMLElement).click()
        }
      }
    })
  }

  return (
    <div
      data-slot="menubar-sub-content"
      data-state="closed"
      role="menu"
      tabindex={-1}
      style="display:none"
      className={`${menubarSubContentBaseClasses} left-full top-0 ${props.className ?? ''}`}
      id={props.id}
      ref={handleMount}
    >
      {props.children}
    </div>
  )
}

// --- MenubarLabel ---

interface MenubarLabelProps extends HTMLBaseAttributes {
  /** Label text */
  children?: Child
}

/**
 * Section label inside the menu.
 */
function MenubarLabel({ children, className = '', ...props }: MenubarLabelProps) {
  return (
    <div data-slot="menubar-label" className={`${menubarLabelClasses} ${className}`} {...props}>
      {children}
    </div>
  )
}

// --- MenubarSeparator ---

interface MenubarSeparatorProps extends HTMLBaseAttributes {
}

/**
 * Visual separator between menu item groups.
 */
function MenubarSeparator({ className = '', ...props }: MenubarSeparatorProps) {
  return (
    <div data-slot="menubar-separator" role="separator" className={`${menubarSeparatorClasses} ${className}`} {...props} />
  )
}

// --- MenubarShortcut ---

interface MenubarShortcutProps extends HTMLBaseAttributes {
  /** Shortcut text (e.g., "Ctrl+T") */
  children?: Child
}

/**
 * Keyboard shortcut indicator displayed inside a menu item.
 */
function MenubarShortcut({ children, className = '', ...props }: MenubarShortcutProps) {
  return (
    <span data-slot="menubar-shortcut" className={`${menubarShortcutClasses} ${className}`} {...props}>
      {children}
    </span>
  )
}

// --- MenubarGroup ---

interface MenubarGroupProps extends HTMLBaseAttributes {
  /** Grouped menu items */
  children?: Child
}

/**
 * Semantic grouping of related menu items.
 */
function MenubarGroup({ children, className = '', ...props }: MenubarGroupProps) {
  return (
    <div data-slot="menubar-group" role="group" className={className} {...props}>
      {children}
    </div>
  )
}

export {
  Menubar,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarCheckboxItem,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent,
  MenubarLabel,
  MenubarSeparator,
  MenubarShortcut,
  MenubarGroup,
}

export type {
  MenubarProps,
  MenubarMenuProps,
  MenubarTriggerProps,
  MenubarContentProps,
  MenubarItemProps,
  MenubarCheckboxItemProps,
  MenubarRadioGroupProps,
  MenubarRadioItemProps,
  MenubarSubProps,
  MenubarSubTriggerProps,
  MenubarSubContentProps,
  MenubarLabelProps,
  MenubarSeparatorProps,
  MenubarShortcutProps,
  MenubarGroupProps,
}
