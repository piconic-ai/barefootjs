"use client"

/**
 * Navigation Menu Components
 *
 * A collection of links for navigating websites. Typically displayed
 * horizontally at the top of pages. Uses hover-with-delay to show
 * content panels, unlike Menubar which is click-to-open.
 *
 * Architecture: Root-level context with activeValue signal coordinates
 * which menu is open. Timer IDs stored on root element dataset for
 * portal-safe access. WeakMap captures trigger refs before portal.
 *
 * Features:
 * - Hover to open with configurable delay (200ms default)
 * - Close delay (300ms default) allows moving to content
 * - Click to toggle
 * - ArrowLeft/Right keyboard navigation between triggers
 * - ESC to close
 * - Portal content to body for overflow escape
 * - NavigationMenuLink with active page support
 *
 * @example Basic navigation menu
 * ```tsx
 * <NavigationMenu>
 *   <NavigationMenuList>
 *     <NavigationMenuItem>
 *       <NavigationMenuTrigger>Getting Started</NavigationMenuTrigger>
 *       <NavigationMenuContent>
 *         <NavigationMenuLink href="/docs">Documentation</NavigationMenuLink>
 *       </NavigationMenuContent>
 *     </NavigationMenuItem>
 *   </NavigationMenuList>
 * </NavigationMenu>
 * ```
 */

import { createContext, useContext, createSignal, createMemo, createEffect, createPortal, isSSRPortal } from '@barefootjs/client-runtime'
import type { HTMLBaseAttributes } from '@barefootjs/jsx'
import type { Child } from '../../../types'
import { ChevronDownIcon } from '../icon'

// Root-level context: coordinates which item is active
interface NavigationMenuContextValue {
  activeValue: () => string
  onActiveValueChange: (value: string) => void
}

const NavigationMenuContext = createContext<NavigationMenuContextValue>()

// Store Content -> Trigger element mapping for positioning after portal
const contentTriggerMap = new WeakMap<HTMLElement, HTMLElement>()

// Store Content -> Root element mapping for timer access after portal
const contentRootMap = new WeakMap<HTMLElement, HTMLElement>()

// CSS classes
const navigationMenuClasses = 'relative'
const navigationMenuListClasses = 'group flex flex-1 list-none items-center justify-center gap-1'
const navigationMenuTriggerBaseClasses = 'group inline-flex h-9 w-max items-center justify-center gap-1 rounded-md bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-hidden disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none'
const navigationMenuTriggerOpenClasses = 'bg-accent/50 text-accent-foreground'
const navigationMenuContentBaseClasses = 'fixed z-50 rounded-md border bg-popover p-4 text-popover-foreground shadow-md transform-gpu origin-top transition-[opacity,transform] duration-normal ease-out'
const navigationMenuContentOpenClasses = 'opacity-100 scale-100'
const navigationMenuContentClosedClasses = 'opacity-0 scale-95 pointer-events-none'
const navigationMenuLinkBaseClasses = 'block select-none rounded-sm px-2 py-1.5 text-sm no-underline outline-hidden transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground'
const navigationMenuLinkActiveClasses = 'bg-accent/50 text-accent-foreground'

// --- NavigationMenu (root) ---

interface NavigationMenuProps extends HTMLBaseAttributes {
  /** NavigationMenuList children */
  children?: Child
  /**
   * Delay in ms before opening on hover.
   * @default 200
   */
  delayDuration?: number
  /**
   * Delay in ms before closing after mouse leave.
   * @default 300
   */
  closeDelay?: number
}

/**
 * Navigation menu root component.
 * Manages which item is currently active via a signal.
 * Stores timer config and IDs in dataset for portal-safe access.
 */
function NavigationMenu(props: NavigationMenuProps) {
  const [activeValue, setActiveValue] = createSignal('')

  const handleMount = (el: HTMLElement) => {
    // Store delay config on root for timer helpers (reactive)
    createEffect(() => {
      el.dataset.nmOpenDelay = String(props.delayDuration ?? 200)
      el.dataset.nmCloseDelay = String(props.closeDelay ?? 300)
    })

    // Global click-outside handler
    const handleClickOutside = (e: MouseEvent) => {
      if (!el.contains(e.target as Node)) {
        // Also check portaled content
        const openContent = document.querySelector('[data-slot="navigation-menu-content"][data-state="open"]')
        if (openContent && openContent.contains(e.target as Node)) return
        setActiveValue('')
      }
    }

    // Global ESC handler
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (activeValue() !== '') {
          const currentValue = activeValue()
          setActiveValue('')
          // Focus back to the trigger that was active
          const trigger = el.querySelector(`[data-slot="navigation-menu-trigger"][data-value="${currentValue}"]`) as HTMLElement
          trigger?.focus()
        }
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleGlobalKeyDown)
  }

  return (
    <NavigationMenuContext.Provider value={{
      activeValue,
      onActiveValueChange: setActiveValue,
    }}>
      <nav
        data-slot="navigation-menu"
        id={props.id}
        className={`${navigationMenuClasses} ${props.className ?? ''}`}
        ref={handleMount}
      >
        {props.children}
      </nav>
    </NavigationMenuContext.Provider>
  )
}

// --- NavigationMenuList ---

interface NavigationMenuListProps extends HTMLBaseAttributes {
  /** NavigationMenuItem children */
  children?: Child
}

/**
 * List wrapper for navigation menu items.
 * Stateless — just a styled <ul>.
 */
function NavigationMenuList({ children, className = '', ...props }: NavigationMenuListProps) {
  return (
    <ul data-slot="navigation-menu-list" className={`${navigationMenuListClasses} ${className}`} {...props}>
      {children}
    </ul>
  )
}

// --- NavigationMenuItem ---

interface NavigationMenuItemProps extends HTMLBaseAttributes {
  /** Unique value identifying this item */
  value?: string
  /** NavigationMenuTrigger and NavigationMenuContent, or NavigationMenuLink */
  children?: Child
}

/**
 * Individual navigation menu item wrapper.
 * Stateless — pure DOM wrapper with data-value for children to read.
 */
function NavigationMenuItem(props: NavigationMenuItemProps) {
  return (
    <li data-slot="navigation-menu-item" data-value={props.value ?? ''} id={props.id} className={`relative ${props.className ?? ''}`}>
      {props.children}
    </li>
  )
}

// --- NavigationMenuTrigger ---

interface NavigationMenuTriggerProps extends HTMLBaseAttributes {
  /** Trigger content (text label) */
  children?: Child
}

/**
 * Button that toggles its content panel.
 * Hover opens with delay. Click toggles.
 * ArrowLeft/Right navigates between triggers.
 * Derives item value from parent NavigationMenuItem's data-value attribute.
 */
function NavigationMenuTrigger(props: NavigationMenuTriggerProps) {
  const handleMount = (el: HTMLElement) => {
    const ctx = useContext(NavigationMenuContext)
    const itemEl = el.closest('[data-slot="navigation-menu-item"]')
    const itemValue = itemEl?.getAttribute('data-value') ?? ''
    el.dataset.value = itemValue

    const root = el.closest('[data-slot="navigation-menu"]') as HTMLElement

    // Reactive styling based on open state
    createEffect(() => {
      const isOpen = ctx.activeValue() === itemValue
      el.dataset.state = isOpen ? 'open' : 'closed'
      el.setAttribute('aria-expanded', String(isOpen))
      el.className = `${navigationMenuTriggerBaseClasses} ${isOpen ? navigationMenuTriggerOpenClasses : ''} ${props.className ?? ''}`
      // Rotate chevron
      const chevron = el.querySelector('[data-slot="navigation-menu-chevron"]') as HTMLElement
      if (chevron) {
        chevron.style.transform = isOpen ? 'rotate(180deg)' : ''
      }
    })

    // Click to toggle
    el.addEventListener('click', () => {
      const isOpen = ctx.activeValue() === itemValue
      ctx.onActiveValueChange(isOpen ? '' : itemValue)
    })

    // Hover enter: cancel close timer, start open timer
    el.addEventListener('mouseenter', () => {
      if (!root) return

      // Cancel close timer
      const ct = root.dataset.nmCloseTimer
      if (ct) {
        clearTimeout(Number(ct))
        root.dataset.nmCloseTimer = ''
      }

      if (ctx.activeValue() === itemValue) return

      const rawDelay = root.dataset.nmOpenDelay
      const openDelay = rawDelay != null ? Number(rawDelay) : 200

      if (ctx.activeValue() !== '') {
        // Roving: another menu is already open, switch immediately
        ctx.onActiveValueChange(itemValue)
      } else if (openDelay > 0) {
        const timerId = setTimeout(() => {
          ctx.onActiveValueChange(itemValue)
          root.dataset.nmOpenTimer = ''
        }, openDelay) as unknown as number
        root.dataset.nmOpenTimer = String(timerId)
      } else {
        // Zero delay: open immediately
        ctx.onActiveValueChange(itemValue)
      }
    })

    // Hover leave: cancel open timer, start close timer
    el.addEventListener('mouseleave', () => {
      if (!root) return

      // Cancel open timer
      const ot = root.dataset.nmOpenTimer
      if (ot) {
        clearTimeout(Number(ot))
        root.dataset.nmOpenTimer = ''
      }

      const rawDelay = root.dataset.nmCloseDelay
      const closeDelay = rawDelay != null ? Number(rawDelay) : 300

      if (closeDelay > 0) {
        const timerId = setTimeout(() => {
          ctx.onActiveValueChange('')
          root.dataset.nmCloseTimer = ''
        }, closeDelay) as unknown as number
        root.dataset.nmCloseTimer = String(timerId)
      } else {
        ctx.onActiveValueChange('')
      }
    })

    // Keyboard navigation between triggers
    el.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault()
        const nav = el.closest('[data-slot="navigation-menu"]')
        if (!nav) return
        const triggers = Array.from(nav.querySelectorAll('[data-slot="navigation-menu-trigger"]')) as HTMLElement[]
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
        if (ctx.activeValue() !== '') {
          const nextValue = nextTrigger.dataset.value ?? ''
          ctx.onActiveValueChange(nextValue)
        }
      }
    })
  }

  return (
    <button
      data-slot="navigation-menu-trigger"
      type="button"
      aria-haspopup="menu"
      aria-expanded="false"
      data-state="closed"
      className={`${navigationMenuTriggerBaseClasses} ${props.className ?? ''}`}
      id={props.id}
      ref={handleMount}
    >
      {props.children}
      <ChevronDownIcon data-slot="navigation-menu-chevron" className="relative top-px ml-1 size-3 transition-transform duration-200" />
    </button>
  )
}

// --- NavigationMenuContent ---

interface NavigationMenuContentProps extends HTMLBaseAttributes {
  /** Content panel */
  children?: Child
}

/**
 * Content panel that appears when a trigger is active.
 * Portaled to body. Positioned below trigger.
 * Hover enter cancels close timer, hover leave starts close timer.
 */
function NavigationMenuContent(props: NavigationMenuContentProps) {
  const handleMount = (el: HTMLElement) => {
    // Capture references before portal
    const itemEl = el.closest('[data-slot="navigation-menu-item"]')
    const itemValue = itemEl?.getAttribute('data-value') ?? ''
    const triggerEl = itemEl?.querySelector('[data-slot="navigation-menu-trigger"]') as HTMLElement
    const rootEl = el.closest('[data-slot="navigation-menu"]') as HTMLElement
    if (triggerEl) contentTriggerMap.set(el, triggerEl)
    if (rootEl) contentRootMap.set(el, rootEl)

    // Portal to body
    if (el && el.parentNode !== document.body && !isSSRPortal(el)) {
      const ownerScope = el.closest('[bf-s]') ?? undefined
      createPortal(el, document.body, { ownerScope })
    }

    const ctx = useContext(NavigationMenuContext)

    // Position content relative to trigger
    const updatePosition = () => {
      if (!triggerEl) return
      const rect = triggerEl.getBoundingClientRect()
      el.style.top = `${rect.bottom + 8}px`
      el.style.left = `${rect.left}px`
    }

    let cleanupFns: Function[] = []

    // Reactive show/hide + positioning
    createEffect(() => {
      for (const fn of cleanupFns) fn()
      cleanupFns = []

      const isOpen = ctx.activeValue() === itemValue
      el.dataset.state = isOpen ? 'open' : 'closed'
      el.className = `${navigationMenuContentBaseClasses} ${isOpen ? navigationMenuContentOpenClasses : navigationMenuContentClosedClasses} ${props.className ?? ''}`

      if (isOpen) {
        updatePosition()

        const handleScroll = () => updatePosition()
        window.addEventListener('scroll', handleScroll, true)
        window.addEventListener('resize', handleScroll)

        cleanupFns.push(
          () => window.removeEventListener('scroll', handleScroll, true),
          () => window.removeEventListener('resize', handleScroll),
        )
      }
    })

    // Mouse enter on content: cancel close timer
    el.addEventListener('mouseenter', () => {
      const root = contentRootMap.get(el)
      if (!root) return

      const ct = root.dataset.nmCloseTimer
      if (ct) {
        clearTimeout(Number(ct))
        root.dataset.nmCloseTimer = ''
      }
    })

    // Mouse leave on content: start close timer
    el.addEventListener('mouseleave', () => {
      const root = contentRootMap.get(el)
      if (!root) return

      // Cancel open timer
      const ot = root.dataset.nmOpenTimer
      if (ot) {
        clearTimeout(Number(ot))
        root.dataset.nmOpenTimer = ''
      }

      const rawDelay = root.dataset.nmCloseDelay
      const closeDelay = rawDelay != null ? Number(rawDelay) : 300

      if (closeDelay > 0) {
        const timerId = setTimeout(() => {
          ctx.onActiveValueChange('')
          root.dataset.nmCloseTimer = ''
        }, closeDelay) as unknown as number
        root.dataset.nmCloseTimer = String(timerId)
      } else {
        ctx.onActiveValueChange('')
      }
    })
  }

  return (
    <div
      data-slot="navigation-menu-content"
      data-state="closed"
      className={`${navigationMenuContentBaseClasses} ${navigationMenuContentClosedClasses} ${props.className ?? ''}`}
      id={props.id}
      ref={handleMount}
    >
      {props.children}
    </div>
  )
}

// --- NavigationMenuLink ---

interface NavigationMenuLinkProps extends HTMLBaseAttributes {
  /** Link URL */
  href?: string
  /** Whether this link is the active page */
  active?: boolean
  /** Link content */
  children?: Child
}

/**
 * Navigation link element. Stateless.
 * When active, renders with aria-current="page" and data-active.
 */
function NavigationMenuLink(props: NavigationMenuLinkProps) {
  const isActive = createMemo(() => props.active ?? false)

  return (
    <a
      data-slot="navigation-menu-link"
      href={props.href}
      aria-current={isActive() ? 'page' : undefined}
      data-active={isActive() || undefined}
      className={`${navigationMenuLinkBaseClasses} ${isActive() ? navigationMenuLinkActiveClasses : ''} ${props.className ?? ''}`}
    >
      {props.children}
    </a>
  )
}

export {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuTrigger,
  NavigationMenuContent,
  NavigationMenuLink,
}

export type {
  NavigationMenuProps,
  NavigationMenuListProps,
  NavigationMenuItemProps,
  NavigationMenuTriggerProps,
  NavigationMenuContentProps,
  NavigationMenuLinkProps,
}
