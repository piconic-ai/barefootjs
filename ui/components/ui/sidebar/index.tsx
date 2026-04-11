"use client"

/**
 * Sidebar Components
 *
 * A composable, collapsible sidebar component with responsive mobile support.
 * Renders as a Sheet overlay on mobile, fixed panel on desktop.
 * Ported from shadcn/ui with BarefootJS signal-based reactivity.
 *
 * @example Basic sidebar layout
 * ```tsx
 * <SidebarProvider>
 *   <Sidebar>
 *     <SidebarHeader>...</SidebarHeader>
 *     <SidebarContent>
 *       <SidebarGroup>
 *         <SidebarGroupLabel>Menu</SidebarGroupLabel>
 *         <SidebarGroupContent>
 *           <SidebarMenu>
 *             <SidebarMenuItem>
 *               <SidebarMenuButton>Home</SidebarMenuButton>
 *             </SidebarMenuItem>
 *           </SidebarMenu>
 *         </SidebarGroupContent>
 *       </SidebarGroup>
 *     </SidebarContent>
 *   </Sidebar>
 *   <SidebarInset>
 *     <header><SidebarTrigger /></header>
 *     <main>Content</main>
 *   </SidebarInset>
 * </SidebarProvider>
 * ```
 */

import {
  createSignal,
  createEffect,
  onCleanup,
} from '@barefootjs/client'
import {
  createContext,
  useContext,
} from '@barefootjs/client-runtime'
import type { HTMLBaseAttributes, ButtonHTMLAttributes } from '@barefootjs/jsx'
import type { Child } from '../../../types'
import { PanelLeftIcon } from '../icon'

// --- Constants ---

const SIDEBAR_WIDTH = '16rem'
const SIDEBAR_WIDTH_ICON = '3rem'
const SIDEBAR_KEYBOARD_SHORTCUT = 'b'

// --- Context ---

interface SidebarContextValue {
  state: () => 'expanded' | 'collapsed'
  open: () => boolean
  setOpen: (open: boolean) => void
  openMobile: () => boolean
  setOpenMobile: (open: boolean) => void
  isMobile: () => boolean
  toggleSidebar: () => void
}

const SidebarContext = createContext<SidebarContextValue>()

// --- SidebarProvider ---

interface SidebarProviderProps extends HTMLBaseAttributes {
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children?: Child
}

function SidebarProvider(props: SidebarProviderProps) {
  const [internalOpen, setInternalOpen] = createSignal(props.defaultOpen !== false)
  const [openMobile, setOpenMobile] = createSignal(false)
  const [isMobile, setIsMobile] = createSignal(false)

  const isControlled = () => props.open !== undefined
  const open = () => isControlled() ? props.open! : internalOpen()

  const setOpen = (value: boolean) => {
    if (isControlled()) {
      props.onOpenChange?.(value)
    } else {
      setInternalOpen(value)
      props.onOpenChange?.(value)
    }
  }

  const toggleSidebar = () => {
    if (isMobile()) {
      setOpenMobile(!openMobile())
    } else {
      setOpen(!open())
    }
  }

  const state = () => open() ? 'expanded' as const : 'collapsed' as const

  // Mobile detection + keyboard shortcut
  const handleMount = (el: HTMLElement) => {
    // Mobile detection via matchMedia
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mql = window.matchMedia('(max-width: 767px)')
      setIsMobile(mql.matches)
      const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
      mql.addEventListener('change', handler)
      onCleanup(() => mql.removeEventListener('change', handler))
    }

    // Keyboard shortcut (Ctrl/Cmd + B)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === SIDEBAR_KEYBOARD_SHORTCUT && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        toggleSidebar()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    onCleanup(() => document.removeEventListener('keydown', handleKeyDown))

    // Reactive data-state
    createEffect(() => {
      el.dataset.state = state()
    })
  }

  return (
    <SidebarContext.Provider value={{
      state,
      open,
      setOpen,
      openMobile,
      setOpenMobile,
      isMobile,
      toggleSidebar,
    }}>
      <div
        data-slot="sidebar-wrapper"
        data-state={props.defaultOpen !== false ? 'expanded' : 'collapsed'}
        style={`--sidebar-width:${SIDEBAR_WIDTH};--sidebar-width-icon:${SIDEBAR_WIDTH_ICON}`}
        className={`group/sidebar-wrapper has-data-[variant=inset]:bg-sidebar relative flex h-full w-full ${props.className ?? ''}`}
        ref={handleMount}
      >
        {props.children}
      </div>
    </SidebarContext.Provider>
  )
}

// --- Sidebar ---

type SidebarSide = 'left' | 'right'
type SidebarVariant = 'sidebar' | 'floating' | 'inset'
type SidebarCollapsible = 'offcanvas' | 'icon' | 'none'

interface SidebarProps extends HTMLBaseAttributes {
  side?: SidebarSide
  variant?: SidebarVariant
  collapsible?: SidebarCollapsible
  children?: Child
}

function Sidebar(props: SidebarProps) {
  const side = props.side ?? 'left'
  const variant = props.variant ?? 'sidebar'
  const collapsible = props.collapsible ?? 'offcanvas'

  if (collapsible === 'none') {
    return (
      <div
        data-slot="sidebar"
        className={`bg-background text-foreground flex h-full w-[var(--sidebar-width)] flex-col ${props.className ?? ''}`}
      >
        {props.children}
      </div>
    )
  }

  const handleDesktopMount = (el: HTMLElement) => {
    // Ensure raw group/peer classes for CSS group-data-[...] selectors
    el.classList.add('group', 'peer')

    const ctx = useContext(SidebarContext)

    createEffect(() => {
      const s = ctx.state()
      el.dataset.state = s
      el.dataset.collapsible = s === 'collapsed' ? collapsible : ''
      el.style.display = ctx.isMobile() ? 'none' : ''
    })
  }

  // Gap width classes
  const gapFloatingOrInset = variant === 'floating' || variant === 'inset'
  const gapClasses = `relative w-[var(--sidebar-width)] bg-transparent transition-[width] duration-200 ease-linear group-data-[collapsible=offcanvas]:w-0 ${side === 'right' ? 'rotate-180' : ''} ${gapFloatingOrInset ? 'group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+1rem)]' : 'group-data-[collapsible=icon]:w-[var(--sidebar-width-icon)]'}`

  // Container classes
  const containerBase = `absolute inset-y-0 z-10 hidden h-full w-[var(--sidebar-width)] transition-[left,right,width] duration-200 ease-linear md:flex`
  const containerSide = side === 'left'
    ? 'left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]'
    : 'right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]'
  const containerVariant = gapFloatingOrInset
    ? 'p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+1rem+2px)]'
    : `group-data-[collapsible=icon]:w-[var(--sidebar-width-icon)] ${side === 'left' ? 'border-r' : 'border-l'}`

  // Inner classes
  const innerClasses = `bg-background flex size-full flex-col ${variant === 'floating' ? 'rounded-lg shadow-sm ring-1 ring-border' : ''}`

  return (
    <div
      className="group peer text-foreground hidden md:block"
      data-state="expanded"
      data-collapsible=""
      data-variant={variant}
      data-side={side}
      data-slot="sidebar"
      ref={handleDesktopMount}
    >
      <div data-slot="sidebar-gap" className={gapClasses} />
      <div
        data-slot="sidebar-container"
        data-side={side}
        className={`${containerBase} ${containerSide} ${containerVariant} ${props.className ?? ''}`}
      >
        <div data-sidebar="sidebar" data-slot="sidebar-inner" className={innerClasses}>
          {props.children}
        </div>
      </div>
    </div>
  )
}

// --- SidebarTrigger ---

interface SidebarTriggerProps extends ButtonHTMLAttributes {
  children?: Child
}

// Button base classes (synced with button.tsx ghost variant, icon-sm size)
const triggerClasses = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] text-foreground hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 size-8'

function SidebarTrigger(props: SidebarTriggerProps) {
  const handleMount = (el: HTMLElement) => {
    const ctx = useContext(SidebarContext)
    el.addEventListener('click', () => {
      ctx.toggleSidebar()
    })
  }

  return (
    <button
      data-slot="sidebar-trigger"
      type="button"
      className={`${triggerClasses} ${props.className ?? ''}`}
      ref={handleMount}
    >
      <PanelLeftIcon size="sm" />
      <span className="sr-only">Toggle Sidebar</span>
    </button>
  )
}

// --- SidebarRail ---

interface SidebarRailProps extends ButtonHTMLAttributes {}

const railClasses = 'hover:after:bg-border absolute inset-y-0 z-20 hidden w-4 transition-all ease-linear group-data-[side=left]:-right-4 group-data-[side=right]:left-0 after:absolute after:inset-y-0 after:start-1/2 after:w-[2px] sm:flex -translate-x-1/2 in-data-[side=left]:cursor-w-resize in-data-[side=right]:cursor-e-resize [[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize hover:group-data-[collapsible=offcanvas]:bg-background group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full [[data-side=left][data-collapsible=offcanvas]_&]:-right-2 [[data-side=right][data-collapsible=offcanvas]_&]:-left-2'

function SidebarRail(props: SidebarRailProps) {
  const handleMount = (el: HTMLElement) => {
    const ctx = useContext(SidebarContext)
    el.addEventListener('click', () => {
      ctx.toggleSidebar()
    })
  }

  return (
    <button
      data-slot="sidebar-rail"
      aria-label="Toggle Sidebar"
      tabindex={-1}
      title="Toggle Sidebar"
      className={`${railClasses} ${props.className ?? ''}`}
      ref={handleMount}
    />
  )
}

// --- SidebarInset ---

interface SidebarInsetProps extends HTMLBaseAttributes {
  children?: Child
}

const insetClasses = 'bg-background relative flex w-full flex-1 flex-col md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2'

function SidebarInset({ className = '', children, ...props }: SidebarInsetProps) {
  return (
    <main
      data-slot="sidebar-inset"
      className={`${insetClasses} ${className}`}
      {...props}
    >
      {children}
    </main>
  )
}

// --- SidebarInput ---

interface SidebarInputProps extends HTMLBaseAttributes {
  placeholder?: string
  type?: string
}

function SidebarInput({ className = '', ...props }: SidebarInputProps) {
  return (
    <input
      data-slot="sidebar-input"
      className={`bg-background h-8 w-full rounded-md border px-3 py-1 text-sm shadow-none outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] ${className}`}
      {...props}
    />
  )
}

// --- SidebarHeader ---

interface SidebarHeaderProps extends HTMLBaseAttributes {
  children?: Child
}

function SidebarHeader({ className = '', children, ...props }: SidebarHeaderProps) {
  return (
    <div data-slot="sidebar-header" className={`flex flex-col gap-2 p-2 ${className}`} {...props}>
      {children}
    </div>
  )
}

// --- SidebarFooter ---

interface SidebarFooterProps extends HTMLBaseAttributes {
  children?: Child
}

function SidebarFooter({ className = '', children, ...props }: SidebarFooterProps) {
  return (
    <div data-slot="sidebar-footer" className={`flex flex-col gap-2 p-2 ${className}`} {...props}>
      {children}
    </div>
  )
}

// --- SidebarSeparator ---

interface SidebarSeparatorProps extends HTMLBaseAttributes {}

function SidebarSeparator({ className = '', ...props }: SidebarSeparatorProps) {
  return (
    <div
      data-slot="sidebar-separator"
      data-orientation="horizontal"
      role="none"
      className={`bg-border shrink-0 h-px w-full mx-2 w-auto ${className}`}
      {...props}
    />
  )
}

// --- SidebarContent ---

interface SidebarContentProps extends HTMLBaseAttributes {
  children?: Child
}

function SidebarContent({ className = '', children, ...props }: SidebarContentProps) {
  return (
    <div
      data-slot="sidebar-content"
      className={`flex min-h-0 flex-1 flex-col gap-0 overflow-auto group-data-[collapsible=icon]:overflow-hidden ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

// --- SidebarGroup ---

interface SidebarGroupProps extends HTMLBaseAttributes {
  children?: Child
}

function SidebarGroup({ className = '', children, ...props }: SidebarGroupProps) {
  return (
    <div
      data-slot="sidebar-group"
      className={`relative flex w-full min-w-0 flex-col p-2 ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

// --- SidebarGroupLabel ---

interface SidebarGroupLabelProps extends HTMLBaseAttributes {
  children?: Child
}

function SidebarGroupLabel({ className = '', children, ...props }: SidebarGroupLabelProps) {
  return (
    <div
      data-slot="sidebar-group-label"
      className={`text-foreground/70 h-8 rounded-md px-2 text-xs font-medium transition-[margin,opacity] duration-200 ease-linear group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0 [&>svg]:size-4 flex shrink-0 items-center [&>svg]:shrink-0 ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

// --- SidebarGroupAction ---

interface SidebarGroupActionProps extends ButtonHTMLAttributes {
  children?: Child
}

function SidebarGroupAction({ className = '', children, ...props }: SidebarGroupActionProps) {
  return (
    <button
      data-slot="sidebar-group-action"
      className={`text-foreground hover:bg-accent hover:text-accent-foreground absolute top-3.5 right-3 w-5 rounded-md p-0 focus-visible:ring-2 [&>svg]:size-4 flex aspect-square items-center justify-center outline-none transition-transform [&>svg]:shrink-0 after:absolute after:-inset-2 md:after:hidden group-data-[collapsible=icon]:hidden ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

// --- SidebarGroupContent ---

interface SidebarGroupContentProps extends HTMLBaseAttributes {
  children?: Child
}

function SidebarGroupContent({ className = '', children, ...props }: SidebarGroupContentProps) {
  return (
    <div
      data-slot="sidebar-group-content"
      className={`w-full text-sm ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

// --- SidebarMenu ---

interface SidebarMenuProps extends HTMLBaseAttributes {
  children?: Child
}

function SidebarMenu({ className = '', children, ...props }: SidebarMenuProps) {
  return (
    <ul
      data-slot="sidebar-menu"
      className={`flex w-full min-w-0 flex-col gap-0 ${className}`}
      {...props}
    >
      {children}
    </ul>
  )
}

// --- SidebarMenuItem ---

interface SidebarMenuItemProps extends HTMLBaseAttributes {
  children?: Child
}

function SidebarMenuItem({ className = '', children, ...props }: SidebarMenuItemProps) {
  return (
    <li
      data-slot="sidebar-menu-item"
      className={`group/menu-item relative ${className}`}
      {...props}
    >
      {children}
    </li>
  )
}

// --- SidebarMenuButton ---

type SidebarMenuButtonVariant = 'default' | 'outline'
type SidebarMenuButtonSize = 'default' | 'sm' | 'lg'

const menuButtonBaseClasses = 'hover:bg-accent hover:text-accent-foreground active:bg-accent active:text-accent-foreground gap-2 rounded-md p-2 text-left text-sm transition-[width,height,padding] group-has-data-[sidebar=menu-action]/menu-item:pr-8 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! data-[active]:font-medium peer/menu-button flex w-full items-center overflow-hidden outline-none group/menu-button disabled:pointer-events-none disabled:opacity-50 [&>span:last-child]:truncate [&_svg]:size-4 [&_svg]:shrink-0'

const menuButtonVariantClasses: Record<SidebarMenuButtonVariant, string> = {
  default: 'hover:bg-accent hover:text-accent-foreground',
  outline: 'bg-background hover:bg-accent hover:text-accent-foreground shadow-[0_0_0_1px_hsl(var(--border))] hover:shadow-[0_0_0_1px_hsl(var(--accent))]',
}

const menuButtonSizeClasses: Record<SidebarMenuButtonSize, string> = {
  default: 'h-8 text-sm',
  sm: 'h-7 text-xs',
  lg: 'h-12 text-sm group-data-[collapsible=icon]:p-0!',
}

interface SidebarMenuButtonProps extends ButtonHTMLAttributes {
  isActive?: boolean
  variant?: SidebarMenuButtonVariant
  size?: SidebarMenuButtonSize
  tooltip?: string
  asChild?: boolean
  children?: Child
}

function SidebarMenuButton(props: SidebarMenuButtonProps) {
  const variant = props.variant ?? 'default'
  const size = props.size ?? 'default'
  const isActive = props.isActive ?? false

  const classes = `${menuButtonBaseClasses} ${menuButtonVariantClasses[variant]} ${menuButtonSizeClasses[size]} ${props.className ?? ''}`

  const handleMount = (el: HTMLElement) => {
    if (isActive) {
      el.dataset.active = 'true'
    }
  }

  return (
    <button
      data-slot="sidebar-menu-button"
      data-size={size}
      data-active={isActive || undefined}
      type="button"
      className={classes}
      ref={handleMount}
    >
      {props.children}
    </button>
  )
}

// --- SidebarMenuAction ---

interface SidebarMenuActionProps extends ButtonHTMLAttributes {
  showOnHover?: boolean
  children?: Child
}

function SidebarMenuAction({ className = '', showOnHover = false, children, ...props }: SidebarMenuActionProps) {
  const hoverClasses = showOnHover
    ? 'group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 md:opacity-0'
    : ''

  return (
    <button
      data-slot="sidebar-menu-action"
      data-sidebar="menu-action"
      className={`text-foreground hover:bg-accent hover:text-accent-foreground absolute top-1.5 right-1 aspect-square w-5 rounded-md p-0 focus-visible:ring-2 [&>svg]:size-4 flex items-center justify-center outline-none transition-transform group-data-[collapsible=icon]:hidden after:absolute after:-inset-2 md:after:hidden [&>svg]:shrink-0 ${hoverClasses} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

// --- SidebarMenuBadge ---

interface SidebarMenuBadgeProps extends HTMLBaseAttributes {
  children?: Child
}

function SidebarMenuBadge({ className = '', children, ...props }: SidebarMenuBadgeProps) {
  return (
    <div
      data-slot="sidebar-menu-badge"
      className={`text-foreground pointer-events-none absolute right-1 flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-medium tabular-nums select-none group-data-[collapsible=icon]:hidden peer-data-[size=default]/menu-button:top-1.5 peer-data-[size=lg]/menu-button:top-2.5 peer-data-[size=sm]/menu-button:top-1 ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

// --- SidebarMenuSkeleton ---

interface SidebarMenuSkeletonProps extends HTMLBaseAttributes {
  showIcon?: boolean
}

function SidebarMenuSkeleton({ className = '', showIcon = false, ...props }: SidebarMenuSkeletonProps) {
  const width = `${Math.floor(Math.random() * 40) + 50}%`

  return (
    <div
      data-slot="sidebar-menu-skeleton"
      className={`flex h-8 items-center gap-2 rounded-md px-2 ${className}`}
      {...props}
    >
      {showIcon && (
        <div className="size-4 rounded-md bg-muted animate-pulse" />
      )}
      <div
        className="h-4 flex-1 bg-muted animate-pulse rounded-md"
        style={`max-width:${width}`}
      />
    </div>
  )
}

// --- SidebarMenuSub ---

interface SidebarMenuSubProps extends HTMLBaseAttributes {
  children?: Child
}

function SidebarMenuSub({ className = '', children, ...props }: SidebarMenuSubProps) {
  return (
    <ul
      data-slot="sidebar-menu-sub"
      className={`mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l px-2.5 py-0.5 group-data-[collapsible=icon]:hidden ${className}`}
      {...props}
    >
      {children}
    </ul>
  )
}

// --- SidebarMenuSubItem ---

interface SidebarMenuSubItemProps extends HTMLBaseAttributes {
  children?: Child
}

function SidebarMenuSubItem({ className = '', children, ...props }: SidebarMenuSubItemProps) {
  return (
    <li
      data-slot="sidebar-menu-sub-item"
      className={`group/menu-sub-item relative ${className}`}
      {...props}
    >
      {children}
    </li>
  )
}

// --- SidebarMenuSubButton ---

type SidebarMenuSubButtonSize = 'sm' | 'md'

interface SidebarMenuSubButtonProps extends HTMLBaseAttributes {
  size?: SidebarMenuSubButtonSize
  isActive?: boolean
  href?: string
  children?: Child
}

function SidebarMenuSubButton({
  className = '',
  size = 'md',
  isActive = false,
  children,
  ...props
}: SidebarMenuSubButtonProps) {
  return (
    <a
      data-slot="sidebar-menu-sub-button"
      data-size={size}
      data-active={isActive || undefined}
      className={`text-foreground hover:bg-accent hover:text-accent-foreground active:bg-accent active:text-accent-foreground data-[active]:bg-accent data-[active]:text-accent-foreground gap-2 rounded-md px-2 focus-visible:ring-2 [&>svg]:size-4 flex min-w-0 -translate-x-px items-center overflow-hidden outline-none group-data-[collapsible=icon]:hidden [&>span:last-child]:truncate [&>svg]:shrink-0 ${size === 'sm' ? 'h-7 text-xs' : 'h-7 text-sm'} ${className}`}
      {...props}
    >
      {children}
    </a>
  )
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
}
export type {
  SidebarProps,
  SidebarProviderProps,
  SidebarTriggerProps,
  SidebarRailProps,
  SidebarInsetProps,
  SidebarInputProps,
  SidebarHeaderProps,
  SidebarFooterProps,
  SidebarSeparatorProps,
  SidebarContentProps,
  SidebarGroupProps,
  SidebarGroupLabelProps,
  SidebarGroupActionProps,
  SidebarGroupContentProps,
  SidebarMenuProps,
  SidebarMenuItemProps,
  SidebarMenuButtonProps,
  SidebarMenuActionProps,
  SidebarMenuBadgeProps,
  SidebarMenuSkeletonProps,
  SidebarMenuSubProps,
  SidebarMenuSubItemProps,
  SidebarMenuSubButtonProps,
  SidebarSide,
  SidebarVariant,
  SidebarCollapsible,
  SidebarMenuButtonVariant,
  SidebarMenuButtonSize,
}
