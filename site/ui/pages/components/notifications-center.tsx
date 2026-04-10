/**
 * Notifications Center Reference Page (/components/notifications-center)
 *
 * Block-level composition pattern: notification center with streaming,
 * grouping, filtering, and bulk actions.
 * Compiler stress test for nested loops (groups → items), memo chains,
 * createEffect + onCleanup (streaming), and filter().map().
 */

import { NotificationsCenterDemo } from '@/components/notifications-center-demo'
import {
  DocPage,
  PageHeader,
  Section,
  Example,
  type TocItem,
} from '../../components/shared/docs'
import { getNavLinks } from '../../components/shared/PageNavigation'

const tocItems: TocItem[] = [
  { id: 'preview', title: 'Preview' },
  { id: 'features', title: 'Features' },
]

const previewCode = `"use client"

import { createSignal, createMemo, createEffect, onCleanup } from '@barefootjs/dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

type Notification = {
  id: number
  type: 'message' | 'mention' | 'system' | 'alert'
  title: string
  body: string
  time: number
  read: boolean
}

function NotificationsCenter() {
  const [notifications, setNotifications] = createSignal<Notification[]>([])
  const [filter, setFilter] = createSignal<'all' | 'unread' | 'mentions'>('all')

  const filtered = createMemo(() => {
    if (filter() === 'unread') return notifications().filter(n => !n.read)
    if (filter() === 'mentions') return notifications().filter(n => n.type === 'mention')
    return notifications()
  })

  const unreadCount = createMemo(() => notifications().filter(n => !n.read).length)

  return (
    <div>
      <div className="flex items-center gap-2">
        <h2>Notifications</h2>
        {unreadCount() > 0 ? <Badge variant="destructive">{unreadCount()}</Badge> : null}
      </div>
      {filtered().map(notif => (
        <Card key={notif.id}>
          <CardContent>
            <p>{notif.title}</p>
            <p>{notif.body}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}`

export function NotificationsCenterRefPage() {
  return (
    <DocPage slug="notifications-center" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Notifications Center"
          description="A notification center with real-time streaming, date grouping, type filtering, read/unread toggle, and bulk actions."
          {...getNavLinks('notifications-center')}
        />

        <Section id="preview" title="Preview">
          <Example title="" code={previewCode}>
            <NotificationsCenterDemo />
          </Example>
        </Section>

        <Section id="features" title="Features">
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-medium text-foreground mb-2">Real-Time Streaming with Effect Cleanup</h3>
              <p className="text-sm text-muted-foreground">
                Toggle streaming mode to receive simulated notifications every 3 seconds.
                Uses createEffect + setInterval + onCleanup — the interval is automatically
                cleared when streaming stops or the component unmounts.
              </p>
            </div>
            <div>
              <h3 className="text-base font-medium text-foreground mb-2">Nested Loops with Date Grouping</h3>
              <p className="text-sm text-muted-foreground">
                Notifications are grouped by date (Today, Yesterday, Earlier) using a
                createMemo chain. The outer loop renders groups, inner loop renders items —
                stress-testing nested loop reconciliation.
              </p>
            </div>
            <div>
              <h3 className="text-base font-medium text-foreground mb-2">3-Stage createMemo Chain</h3>
              <p className="text-sm text-muted-foreground">
                notifications → filtered (by filter mode) → grouped (by date) → counts
                (unread, mentions, total). Tests multi-stage derived state computation
                with cascading updates.
              </p>
            </div>
            <div>
              <h3 className="text-base font-medium text-foreground mb-2">Filter + Conditional Rendering</h3>
              <p className="text-sm text-muted-foreground">
                Three filter modes (All, Unread, Mentions) with per-item conditional
                rendering for read/unread styling, type badges, and unread dots.
              </p>
            </div>
          </div>
        </Section>
      </div>
    </DocPage>
  )
}
