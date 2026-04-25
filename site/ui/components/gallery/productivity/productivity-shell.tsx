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

function NavIcon({ name }: { name: string }) {
  switch (name) {
    case 'mail':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect width="20" height="16" x="2" y="4" rx="2" />
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
        </svg>
      )
    case 'files':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
        </svg>
      )
    case 'board':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="9" y1="3" x2="9" y2="21" />
          <line x1="15" y1="3" x2="15" y2="21" />
        </svg>
      )
    case 'calendar':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      )
    default:
      return null
  }
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
