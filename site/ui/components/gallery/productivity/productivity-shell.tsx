"use client"

/**
 * ProductivityShell
 *
 * Shared layout primitive for /gallery/productivity/* pages. SSR-only chrome
 * (sidebar + header frame); the unread-mail badge island lives in a sibling
 * "use client" component (ProductivityUnreadBadge).
 *
 * Compiler stress targets:
 * - Shared layout wrapping per-route reactive content (each page mounts
 *   its own signal scope inside this shell).
 * - Active-route class on sidebar items derived from currentRoute prop.
 * - Cross-page persistent state: unread mail count written by the mail page,
 *   read by all pages via sessionStorage (see gallery-productivity-storage.ts).
 */

import type { Child } from 'hono/jsx'
import { ProductivityUnreadBadge } from './productivity-unread-badge'
import { NavIcon } from './productivity-nav-icon'

export type ProductivityRouteKey = 'mail' | 'files' | 'board' | 'calendar'

interface NavItem {
  key: ProductivityRouteKey
  href: string
  label: string
  icon: string
}

const NAV_ITEMS: NavItem[] = [
  { key: 'mail', href: '/gallery/productivity/mail', label: 'Mail', icon: 'mail' },
  { key: 'files', href: '/gallery/productivity/files', label: 'Files', icon: 'files' },
  { key: 'board', href: '/gallery/productivity/board', label: 'Board', icon: 'board' },
  { key: 'calendar', href: '/gallery/productivity/calendar', label: 'Calendar', icon: 'calendar' },
]

const PAGE_TITLES: Record<ProductivityRouteKey, string> = {
  mail: 'Mail',
  files: 'Files',
  board: 'Board',
  calendar: 'Calendar',
}

interface ProductivityShellProps {
  currentRoute: ProductivityRouteKey
  children?: Child
}

export function ProductivityShell({ currentRoute, children }: ProductivityShellProps) {
  return (
    <div className="productivity-shell flex min-h-[calc(100vh-8rem)] w-full rounded-xl border bg-card overflow-hidden">
      {/* Sidebar */}
      <aside
        data-productivity-sidebar=""
        className="hidden md:flex w-56 flex-col border-r bg-muted/30"
        aria-label="Productivity navigation"
      >
        <div className="flex items-center gap-2 px-4 py-4 border-b">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold">
            P
          </div>
          <span className="text-sm font-semibold">Workspace</span>
        </div>
        <nav className="flex flex-col gap-0.5 p-2">
          {NAV_ITEMS.map((item) => {
            const active = item.key === currentRoute
            return (
              <a
                key={item.key}
                href={item.href}
                data-productivity-nav-item={item.key}
                data-active={active ? 'true' : 'false'}
                aria-current={active ? 'page' : undefined}
                className={`productivity-nav-link flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors no-underline ${
                  active
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                <NavIcon name={item.icon} />
                <span>{item.label}</span>
                {item.key === 'mail' ? <ProductivityUnreadBadge /> : null}
              </a>
            )
          })}
        </nav>
        <div className="mt-auto border-t px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="size-7 rounded-full bg-muted" />
            <div className="flex flex-col leading-tight">
              <span className="text-xs font-medium">Alex Worker</span>
              <span className="text-[10px] text-muted-foreground">alex@workspace.app</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header
          data-productivity-header=""
          className="flex items-center justify-between gap-3 border-b px-4 py-3 bg-background/60"
        >
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="productivity-page-title text-base font-semibold truncate">
              {PAGE_TITLES[currentRoute]}
            </h1>
          </div>
        </header>

        {/* Mobile nav strip */}
        <nav
          data-productivity-mobile-nav=""
          className="md:hidden flex overflow-x-auto gap-1 border-b px-3 py-2 bg-background/60"
          aria-label="Productivity navigation (mobile)"
        >
          {NAV_ITEMS.map((item) => {
            const active = item.key === currentRoute
            return (
              <a
                key={item.key}
                href={item.href}
                data-productivity-mobile-nav-item={item.key}
                data-active={active ? 'true' : 'false'}
                aria-current={active ? 'page' : undefined}
                className={`productivity-mobile-nav-link shrink-0 flex items-center gap-1 rounded-md px-3 py-1.5 text-xs transition-colors no-underline ${
                  active
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                {item.label}
                {item.key === 'mail' ? <ProductivityUnreadBadge /> : null}
              </a>
            )
          })}
        </nav>

        <div className="productivity-page flex-1 overflow-x-auto p-4 sm:p-6">
          {children}
        </div>
      </div>
    </div>
  )
}
