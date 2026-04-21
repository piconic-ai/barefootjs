"use client"

import { createSignal, createEffect } from '@barefootjs/client'
import { readUnreadCount, writeUnreadCount } from '../../shared/gallery-admin-storage'

export function AdminUnreadBadge() {
  const [unread, setUnread] = createSignal<number>(readUnreadCount())

  createEffect(() => {
    writeUnreadCount(unread())
  })

  // Keep the badge in sync when a sibling island (e.g. the overview page's
  // "Notify on-call" button or the notifications page's "Mark all read")
  // writes a new unread count to sessionStorage. Separate hydration scopes
  // don't share signal memory, so we bridge through a synthetic DOM event
  // fired from writeRaw(). Each admin route is a full page navigation so
  // listeners don't accumulate — no onCleanup needed.
  if (typeof window !== 'undefined') {
    window.addEventListener('barefoot:admin-storage', () => setUnread(readUnreadCount()))
  }

  return (
    <a
      href="/gallery/admin/notifications"
      className="admin-unread-badge relative inline-flex h-9 w-9 items-center justify-center rounded-md border bg-background text-muted-foreground hover:text-foreground"
      aria-label="Notifications"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {unread() > 0 ? (
        <span
          data-unread-count={unread()}
          className="admin-unread-count absolute -top-1 -right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground"
        >
          {unread()}
        </span>
      ) : null}
    </a>
  )
}
