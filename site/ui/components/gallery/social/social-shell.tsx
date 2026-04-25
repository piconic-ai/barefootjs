/**
 * SocialShell
 *
 * Shared layout primitive for /gallery/social/* pages. SSR-only chrome
 * (sidebar + header frame); the unread-message badge island lives in a sibling
 * "use client" component (SocialUnreadBadge).
 *
 * Compiler stress targets:
 * - Shared layout wrapping per-route reactive content (each page mounts
 *   its own signal scope inside this shell).
 * - Active-route class on sidebar items derived from currentRoute prop.
 * - Cross-page persistent state: unread message count written by the messages
 *   page, read by all pages via sessionStorage (see gallery-social-storage.ts).
 */

import type { Child } from 'hono/jsx'
import { SocialUnreadBadge } from './social-unread-badge'

export type SocialRouteKey = 'feed' | 'profile' | 'thread' | 'messages'

interface NavItem {
  key: SocialRouteKey
  href: string
  label: string
  icon: string
}

const NAV_ITEMS: NavItem[] = [
  { key: 'feed', href: '/gallery/social', label: 'Feed', icon: 'feed' },
  { key: 'profile', href: '/gallery/social/profile', label: 'Profile', icon: 'profile' },
  { key: 'thread', href: '/gallery/social/thread', label: 'Thread', icon: 'thread' },
  { key: 'messages', href: '/gallery/social/messages', label: 'Messages', icon: 'messages' },
]

const PAGE_TITLES: Record<SocialRouteKey, string> = {
  feed: 'Feed',
  profile: 'Profile',
  thread: 'Thread',
  messages: 'Messages',
}

function NavIcon({ name }: { name: string }) {
  switch (name) {
    case 'feed':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      )
    case 'profile':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
        </svg>
      )
    case 'thread':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      )
    case 'messages':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4c0-1.1.9-2 2-2h8a2 2 0 0 1 2 2v5Z" />
          <path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1" />
        </svg>
      )
    default:
      return null
  }
}

interface SocialShellProps {
  currentRoute: SocialRouteKey
  children?: Child
}

export function SocialShell({ currentRoute, children }: SocialShellProps) {
  return (
    <div className="social-shell flex min-h-[calc(100vh-8rem)] w-full rounded-xl border bg-card overflow-hidden">
      {/* Sidebar */}
      <aside
        data-social-sidebar=""
        className="hidden md:flex w-56 flex-col border-r bg-muted/30"
        aria-label="Social navigation"
      >
        <div className="flex items-center gap-2 px-4 py-4 border-b">
          <div className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
            S
          </div>
          <span className="text-sm font-semibold">Social</span>
        </div>
        <nav className="flex flex-col gap-0.5 p-2">
          {NAV_ITEMS.map((item) => {
            const active = item.key === currentRoute
            return (
              <a
                key={item.key}
                href={item.href}
                data-social-nav-item={item.key}
                data-active={active ? 'true' : 'false'}
                aria-current={active ? 'page' : undefined}
                className={`social-nav-link flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors no-underline ${
                  active
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                <NavIcon name={item.icon} />
                <span>{item.label}</span>
                {item.key === 'messages' ? <SocialUnreadBadge /> : null}
              </a>
            )
          })}
        </nav>
        <div className="mt-auto border-t px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="size-7 rounded-full bg-muted" />
            <div className="flex flex-col leading-tight">
              <span className="text-xs font-medium">Alex Chen</span>
              <span className="text-[10px] text-muted-foreground">@alexdev</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header
          data-social-header=""
          className="flex items-center justify-between gap-3 border-b px-4 py-3 bg-background/60"
        >
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="social-page-title text-base font-semibold truncate">
              {PAGE_TITLES[currentRoute]}
            </h1>
          </div>
        </header>

        {/* Mobile nav strip */}
        <nav
          data-social-mobile-nav=""
          className="md:hidden flex overflow-x-auto gap-1 border-b px-3 py-2 bg-background/60"
          aria-label="Social navigation (mobile)"
        >
          {NAV_ITEMS.map((item) => {
            const active = item.key === currentRoute
            return (
              <a
                key={item.key}
                href={item.href}
                data-social-mobile-nav-item={item.key}
                data-active={active ? 'true' : 'false'}
                aria-current={active ? 'page' : undefined}
                className={`social-mobile-nav-link shrink-0 flex items-center gap-1 rounded-md px-3 py-1.5 text-xs transition-colors no-underline ${
                  active
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                {item.label}
                {item.key === 'messages' ? <SocialUnreadBadge /> : null}
              </a>
            )
          })}
        </nav>

        <div className="social-page flex-1 overflow-x-auto p-4 sm:p-6">
          {children}
        </div>
      </div>
    </div>
  )
}
