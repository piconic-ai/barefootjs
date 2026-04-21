"use client"

import { createSignal, createMemo, createEffect } from '@barefootjs/client'
import { Badge } from '@ui/components/ui/badge'
import { Button } from '@ui/components/ui/button'
import { writeUnreadCount } from '../../shared/gallery-admin-storage'

type NotificationType = 'message' | 'mention' | 'system' | 'alert'

interface Notification {
  id: number
  type: NotificationType
  title: string
  body: string
  time: number
  read: boolean
}

type FilterMode = 'all' | 'unread' | 'mentions'

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

const now = Date.now()
const initialNotifications: Notification[] = [
  { id: 1, type: 'mention', title: 'Mentioned in #dev', body: '@you The compiler fix looks great!', time: now - 300000, read: false },
  { id: 2, type: 'message', title: 'New message from Alice', body: 'Can we sync on the roadmap?', time: now - 600000, read: false },
  { id: 3, type: 'system', title: 'Deployment complete', body: 'v2.4.0 deployed to staging.', time: now - 1800000, read: true },
  { id: 4, type: 'alert', title: 'Test suite failed', body: '3 tests failed in integration suite.', time: now - 3600000, read: false },
  { id: 5, type: 'message', title: 'New message from Dave', body: 'Shared the API docs link.', time: now - 7200000, read: true },
  { id: 6, type: 'mention', title: 'Mentioned in PR #142', body: '@you Approved with minor suggestions.', time: now - 86400000, read: true },
]

export function AdminNotificationsDemo() {
  const [notifications, setNotifications] = createSignal<Notification[]>(initialNotifications)
  const [filter, setFilter] = createSignal<FilterMode>('all')

  const filtered = createMemo(() => {
    const f = filter()
    const items = notifications()
    if (f === 'unread') return items.filter((n) => !n.read)
    if (f === 'mentions') return items.filter((n) => n.type === 'mention')
    return items
  })

  const unreadCount = createMemo(() => notifications().filter((n) => !n.read).length)
  const mentionCount = createMemo(() => notifications().filter((n) => n.type === 'mention' && !n.read).length)
  const totalCount = createMemo(() => notifications().length)

  // Mirror local unread state into persistent storage so the header badge
  // on other routes reflects actions performed here. writeUnreadCount also
  // fires the shared `barefoot:admin-storage` event the header listens for.
  createEffect(() => {
    writeUnreadCount(unreadCount())
  })

  const toggleRead = (id: number) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: !n.read } : n)))
  }

  const removeNotification = (id: number) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  const clearAll = () => {
    setNotifications([])
  }

  return (
    <div className="admin-notifications-page w-full max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Inbox</h2>
          {unreadCount() > 0 ? (
            <Badge variant="destructive" className="admin-notifications-count">{unreadCount()}</Badge>
          ) : null}
        </div>
      </div>

      <div className="admin-notifications-filters flex gap-1 p-1 bg-muted rounded-lg w-fit">
        <button
          type="button"
          className={`admin-filter-all px-3 py-1.5 text-sm rounded-md transition-colors ${
            filter() === 'all' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setFilter('all')}
        >
          All ({totalCount()})
        </button>
        <button
          type="button"
          className={`admin-filter-unread px-3 py-1.5 text-sm rounded-md transition-colors ${
            filter() === 'unread' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setFilter('unread')}
        >
          Unread ({unreadCount()})
        </button>
        <button
          type="button"
          className={`admin-filter-mentions px-3 py-1.5 text-sm rounded-md transition-colors ${
            filter() === 'mentions'
              ? 'bg-background shadow-sm font-medium'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setFilter('mentions')}
        >
          Mentions ({mentionCount()})
        </button>
      </div>

      {notifications().length > 0 ? (
        <div className="admin-notifications-actions flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="admin-mark-all-read"
            onClick={markAllRead}
            disabled={unreadCount() === 0}
          >
            Mark all read
          </Button>
          <Button variant="outline" size="sm" className="admin-clear-all" onClick={clearAll}>
            Clear all
          </Button>
        </div>
      ) : null}

      <div className="admin-notifications-list space-y-2">
        {filtered().map((notif) => (
          <div
            key={notif.id}
            data-read={notif.read ? 'true' : 'false'}
            className="admin-notification-item flex items-start gap-3 rounded-lg border p-3 transition-colors"
          >
            <span className="text-xl mt-0.5">{typeIcon(notif.type)}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{notif.title}</p>
                <Badge variant={typeBadgeVariants[notif.type]} className="text-xs">
                  {notif.type}
                </Badge>
                {notif.read ? null : (
                  <span className="admin-unread-dot w-2 h-2 rounded-full bg-primary shrink-0" />
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{notif.body}</p>
              <p className="text-xs text-muted-foreground/60 mt-1">{relativeTime(notif.time)}</p>
            </div>
            <div className="flex gap-1 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="admin-toggle-read h-7 text-xs"
                onClick={() => toggleRead(notif.id)}
              >
                {notif.read ? 'Unread' : 'Read'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="admin-dismiss h-7 text-xs text-destructive"
                onClick={() => removeNotification(notif.id)}
              >
                ×
              </Button>
            </div>
          </div>
        ))}
      </div>

      {filtered().length === 0 ? (
        <div className="admin-notifications-empty text-center py-8">
          <p className="text-4xl mb-2">🔔</p>
          <p className="text-sm text-muted-foreground">
            {filter() === 'all' ? 'No notifications yet' : `No ${filter()} notifications`}
          </p>
        </div>
      ) : null}
    </div>
  )
}
