/**
 * AdminShell
 *
 * Shared layout primitive for /gallery/admin/* pages. SSR-only chrome
 * (sidebar + header frame); interactive islands (time-range filter,
 * unread badge) live in sibling "use client" components.
 *
 * The compiler-stress targets exercised here:
 * - Shared layout wrapping per-route reactive content (each page mounts
 *   its own signal scope inside this shell).
 * - Active-route class on sidebar items derived from currentPath prop.
 * - Cross-page persistent state delivered via sessionStorage (see
 *   ./admin-storage) so children of this shell see the same values
 *   after full-page navigation.
 */

import type { Child } from 'hono/jsx'
import { AdminTimeRange } from './admin-time-range'
import { AdminUnreadBadge } from './admin-unread-badge'

export type AdminRouteKey = 'overview' | 'analytics' | 'orders' | 'notifications' | 'settings'

interface NavItem {
  key: AdminRouteKey
  href: string
  label: string
  icon: string
}

const NAV_ITEMS: NavItem[] = [
  { key: 'overview', href: '/gallery/admin', label: 'Overview', icon: 'home' },
  { key: 'analytics', href: '/gallery/admin/analytics', label: 'Analytics', icon: 'chart' },
  { key: 'orders', href: '/gallery/admin/orders', label: 'Orders', icon: 'list' },
  { key: 'notifications', href: '/gallery/admin/notifications', label: 'Notifications', icon: 'bell' },
  { key: 'settings', href: '/gallery/admin/settings', label: 'Settings', icon: 'cog' },
]

const PAGE_TITLES: Record<AdminRouteKey, string> = {
  overview: 'Overview',
  analytics: 'Analytics',
  orders: 'Orders',
  notifications: 'Notifications',
  settings: 'Settings',
}

function NavIcon({ name }: { name: string }) {
  switch (name) {
    case 'home':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      )
    case 'chart':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 3v18h18" />
          <path d="M7 14l4-4 4 4 5-5" />
        </svg>
      )
    case 'list':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8 6h13" />
          <path d="M8 12h13" />
          <path d="M8 18h13" />
          <circle cx="4" cy="6" r="1" />
          <circle cx="4" cy="12" r="1" />
          <circle cx="4" cy="18" r="1" />
        </svg>
      )
    case 'bell':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
      )
    case 'cog':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      )
    default:
      return null
  }
}

interface AdminShellProps {
  currentRoute: AdminRouteKey
  children?: Child
}

const SHOWS_TIME_RANGE: AdminRouteKey[] = ['overview', 'analytics']

export function AdminShell({ currentRoute, children }: AdminShellProps) {
  const showsTimeRange = SHOWS_TIME_RANGE.includes(currentRoute)

  return (
    <div className="admin-shell flex min-h-[calc(100vh-8rem)] w-full rounded-xl border bg-card overflow-hidden">
      {/* Sidebar */}
      <aside
        data-admin-sidebar=""
        className="hidden md:flex w-56 flex-col border-r bg-muted/30"
        aria-label="Admin navigation"
      >
        <div className="flex items-center gap-2 px-4 py-4 border-b">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold">
            A
          </div>
          <span className="text-sm font-semibold">Acme Admin</span>
        </div>
        <nav className="flex flex-col gap-0.5 p-2">
          {NAV_ITEMS.map((item) => {
            const active = item.key === currentRoute
            return (
              <a
                key={item.key}
                href={item.href}
                data-admin-nav-item={item.key}
                data-active={active ? 'true' : 'false'}
                aria-current={active ? 'page' : undefined}
                className={`admin-nav-link flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors no-underline ${
                  active
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                <NavIcon name={item.icon} />
                <span>{item.label}</span>
              </a>
            )
          })}
        </nav>
        <div className="mt-auto border-t px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="size-7 rounded-full bg-muted" />
            <div className="flex flex-col leading-tight">
              <span className="text-xs font-medium">Alex Admin</span>
              <span className="text-[10px] text-muted-foreground">alex@acme.com</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header
          data-admin-header=""
          className="flex items-center justify-between gap-3 border-b px-4 py-3 bg-background/60"
        >
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="admin-page-title text-base font-semibold truncate">
              {PAGE_TITLES[currentRoute]}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {showsTimeRange ? <AdminTimeRange /> : null}
            <AdminUnreadBadge />
          </div>
        </header>

        {/* Mobile nav strip */}
        <nav
          data-admin-mobile-nav=""
          className="md:hidden flex overflow-x-auto gap-1 border-b px-3 py-2 bg-background/60"
          aria-label="Admin navigation (mobile)"
        >
          {NAV_ITEMS.map((item) => {
            const active = item.key === currentRoute
            return (
              <a
                key={item.key}
                href={item.href}
                data-admin-mobile-nav-item={item.key}
                data-active={active ? 'true' : 'false'}
                aria-current={active ? 'page' : undefined}
                className={`admin-mobile-nav-link shrink-0 rounded-md px-3 py-1.5 text-xs transition-colors no-underline ${
                  active
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                {item.label}
              </a>
            )
          })}
        </nav>

        <div className="admin-page flex-1 overflow-x-auto p-4 sm:p-6">
          {children}
        </div>
      </div>
    </div>
  )
}
