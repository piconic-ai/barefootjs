"use client"
/**
 * NotificationsCenterDemo
 *
 * Notification center with real-time streaming, filtering, and bulk actions.
 *
 * Compiler stress targets:
 * - createEffect + setInterval + onCleanup: streaming notification arrival
 * - createMemo chain: filtered → counts (3 stages)
 * - filter().map() pattern with enum filter state
 * - Per-item conditional rendering: read/unread dot, type-based icons/badges
 * - Batch array mutations: mark all read, clear all
 * - Dynamic class from per-item state: read vs unread styling
 * - Component loop with Card: per-item signal updates (toggleRead)
 */

import { createSignal, createMemo, createEffect, onCleanup } from '@barefootjs/dom'
import { Badge } from '@ui/components/ui/badge'
import { Button } from '@ui/components/ui/button'
import {
  ToastProvider,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
} from '@ui/components/ui/toast'

// --- Types ---

type NotificationType = 'message' | 'mention' | 'system' | 'alert'

type Notification = {
  id: number
  type: NotificationType
  title: string
  body: string
  time: number // timestamp ms
  read: boolean
}

type FilterMode = 'all' | 'unread' | 'mentions'

// --- Helpers ---

let nextId = 100

function typeIcon(type: NotificationType): string {
  switch (type) {
    case 'message': return '💬'
    case 'mention': return '📣'
    case 'system': return '⚙️'
    case 'alert': return '🔔'
  }
}

const typeBadgeVariants: Record<NotificationType, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  message: 'secondary',
  mention: 'default',
  system: 'outline',
  alert: 'destructive',
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

// Sample notifications pool for streaming
const notificationPool: Array<{ type: NotificationType; title: string; body: string }> = [
  { type: 'message', title: 'New message from Alice', body: 'Hey, are you coming to the standup?' },
  { type: 'mention', title: 'Mentioned in #dev', body: '@you Can you review the PR for the auth module?' },
  { type: 'system', title: 'Deployment complete', body: 'v2.4.1 deployed to production successfully.' },
  { type: 'alert', title: 'Build failed', body: 'CI pipeline failed on main branch.' },
  { type: 'message', title: 'New message from Bob', body: 'Shared the design mockups in Figma.' },
  { type: 'mention', title: 'Mentioned in code review', body: '@you Please address the type safety comments.' },
  { type: 'system', title: 'Database migration', body: 'Schema migration completed for users table.' },
  { type: 'alert', title: 'High memory usage', body: 'Server memory usage exceeded 90% threshold.' },
  { type: 'message', title: 'New message from Carol', body: 'The meeting is rescheduled to 4pm.' },
  { type: 'mention', title: 'Mentioned in #general', body: '@you Great demo yesterday!' },
]

// Initial notifications (staggered timestamps)
const now = Date.now()
const initialNotifications: Notification[] = [
  { id: 1, type: 'mention', title: 'Mentioned in #dev', body: '@you The compiler fix looks great!', time: now - 300000, read: false },
  { id: 2, type: 'message', title: 'New message from Alice', body: 'Can we sync on the roadmap?', time: now - 600000, read: false },
  { id: 3, type: 'system', title: 'Deployment complete', body: 'v2.4.0 deployed to staging.', time: now - 1800000, read: true },
  { id: 4, type: 'alert', title: 'Test suite failed', body: '3 tests failed in integration suite.', time: now - 3600000, read: false },
  { id: 5, type: 'message', title: 'New message from Dave', body: 'Shared the API docs link.', time: now - 7200000, read: true },
  { id: 6, type: 'mention', title: 'Mentioned in PR #142', body: '@you Approved with minor suggestions.', time: now - 86400000, read: true },
  { id: 7, type: 'system', title: 'Scheduled maintenance', body: 'Database maintenance at 2am UTC.', time: now - 90000000, read: true },
  { id: 8, type: 'alert', title: 'Disk space warning', body: 'Server disk usage at 85%.', time: now - 172800000, read: true },
]

// --- Component ---

export function NotificationsCenterDemo() {
  const [notifications, setNotifications] = createSignal<Notification[]>(initialNotifications)
  const [filter, setFilter] = createSignal<FilterMode>('all')
  const [streaming, setStreaming] = createSignal(false)
  const [toastOpen, setToastOpen] = createSignal(false)
  const [toastMessage, setToastMessage] = createSignal('')

  // Memo chain stage 1: filtered notifications
  const filtered = createMemo(() => {
    const f = filter()
    const items = notifications()
    if (f === 'unread') return items.filter(n => !n.read)
    if (f === 'mentions') return items.filter(n => n.type === 'mention')
    return items
  })

  // Memo chain stage 2: counts
  const unreadCount = createMemo(() => notifications().filter(n => !n.read).length)
  const mentionCount = createMemo(() => notifications().filter(n => n.type === 'mention' && !n.read).length)
  const totalCount = createMemo(() => notifications().length)

  // Streaming: add random notifications with interval + onCleanup
  createEffect(() => {
    if (!streaming()) return

    let poolIdx = 0
    const timer = setInterval(() => {
      const template = notificationPool[poolIdx % notificationPool.length]
      poolIdx++
      const id = nextId++
      const newNotif: Notification = {
        id,
        type: template.type,
        title: template.title,
        body: template.body,
        time: Date.now(),
        read: false,
      }
      setNotifications(prev => [newNotif, ...prev])
      setToastMessage(template.title)
      setToastOpen(true)
    }, 3000)

    onCleanup(() => clearInterval(timer))
  })

  // Handlers
  const toggleRead = (id: number) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: !n.read } : n))
  }

  const removeNotification = (id: number) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  const markAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  const clearAll = () => {
    setNotifications([])
  }

  return (
    <div className="notifications-page w-full max-w-2xl mx-auto space-y-4">

      {/* Header with counts */}
      <div className="notifications-header flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Notifications</h2>
          {unreadCount() > 0 ? (
            <Badge variant="destructive" className="unread-count">{unreadCount()}</Badge>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button
            variant={streaming() ? 'default' : 'outline'}
            size="sm"
            className="stream-btn"
            onClick={() => setStreaming(prev => !prev)}
          >
            {streaming() ? 'Stop Stream' : 'Start Stream'}
          </Button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="filter-tabs flex gap-1 p-1 bg-muted rounded-lg w-fit">
        <button
          className={`filter-all px-3 py-1.5 text-sm rounded-md transition-colors ${filter() === 'all' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
          onClick={() => setFilter('all')}
        >
          All ({totalCount()})
        </button>
        <button
          className={`filter-unread px-3 py-1.5 text-sm rounded-md transition-colors ${filter() === 'unread' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
          onClick={() => setFilter('unread')}
        >
          Unread ({unreadCount()})
        </button>
        <button
          className={`filter-mentions px-3 py-1.5 text-sm rounded-md transition-colors ${filter() === 'mentions' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
          onClick={() => setFilter('mentions')}
        >
          Mentions ({mentionCount()})
        </button>
      </div>

      {/* Bulk actions */}
      {notifications().length > 0 ? (
        <div className="bulk-actions flex gap-2">
          <Button variant="outline" size="sm" className="mark-all-read-btn" onClick={markAllRead} disabled={unreadCount() === 0}>
            Mark all read
          </Button>
          <Button variant="outline" size="sm" className="clear-all-btn" onClick={clearAll}>
            Clear all
          </Button>
        </div>
      ) : null}

      {/* Notification list — flat loop with per-item reactivity */}
      <div className="notification-list space-y-2">
        {filtered().map(notif => (
          <div
            key={notif.id}
            className="notification-item flex items-start gap-3 rounded-lg border p-3 transition-colors"
          >
            <span className="notif-icon text-xl mt-0.5">{typeIcon(notif.type)}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="notif-title text-sm font-medium">{notif.title}</p>
                <Badge variant={typeBadgeVariants[notif.type]} className="type-badge text-xs">{notif.type}</Badge>
                {notif.read ? null : (
                  <span className="unread-dot w-2 h-2 rounded-full bg-primary shrink-0" />
                )}
              </div>
              <p className="notif-body text-xs text-muted-foreground mt-0.5">{notif.body}</p>
              <p className="notif-time text-xs text-muted-foreground/60 mt-1">{relativeTime(notif.time)}</p>
            </div>
            <div className="flex gap-1 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="toggle-read-btn h-7 text-xs"
                onClick={() => toggleRead(notif.id)}
              >
                {notif.read ? 'Unread' : 'Read'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="dismiss-btn h-7 text-xs text-destructive"
                onClick={() => removeNotification(notif.id)}
              >
                ×
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Empty state */}
      {filtered().length === 0 ? (
        <div className="empty-state text-center py-8">
          <p className="text-4xl mb-2">🔔</p>
          <p className="text-sm text-muted-foreground">
            {filter() === 'all' ? 'No notifications yet' : `No ${filter()} notifications`}
          </p>
        </div>
      ) : null}

      {/* Toast for new notifications */}
      <ToastProvider position="bottom-right">
        <Toast variant="default" open={toastOpen()} duration={2000} onOpenChange={setToastOpen}>
          <div className="flex-1">
            <ToastTitle>New Notification</ToastTitle>
            <ToastDescription className="toast-message">{toastMessage()}</ToastDescription>
          </div>
          <ToastClose onClick={() => setToastOpen(false)} />
        </Toast>
      </ToastProvider>
    </div>
  )
}
