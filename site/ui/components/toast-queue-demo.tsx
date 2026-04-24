"use client"
/**
 * ToastQueueDemo
 *
 * Notification queue block built from the existing Toast UI components.
 * It stresses queued toast state, provider portal ownership, manual/automatic
 * dismiss, and per-toast timer cleanup on dynamic unmount.
 */

import { createSignal, createMemo, createEffect, onCleanup } from '@barefootjs/client'
import { Button } from '@ui/components/ui/button'
import { Badge } from '@ui/components/ui/badge'
import { Separator } from '@ui/components/ui/separator'
import { ToastProvider, Toast, ToastTitle, ToastDescription, ToastClose } from '@ui/components/ui/toast'

type ToastVariant = 'success' | 'error' | 'warning' | 'info'
type ToastStatus = 'visible' | 'exiting'

type QueueToast = {
  id: number
  variant: ToastVariant
  title: string
  description: string
  duration: number
  status: ToastStatus
  createdAt: string
}

type ToastTemplate = Omit<QueueToast, 'id' | 'status' | 'createdAt'>

const templates: ToastTemplate[] = [
  {
    variant: 'success',
    title: 'Invoice paid',
    description: 'Acme Studio completed payment for INV-4281.',
    duration: 4200,
  },
  {
    variant: 'info',
    title: 'Build finished',
    description: 'Preview deployment is ready for QA review.',
    duration: 5200,
  },
  {
    variant: 'warning',
    title: 'Storage threshold',
    description: 'Media storage is at 82 percent capacity.',
    duration: 6500,
  },
  {
    variant: 'error',
    title: 'Webhook failed',
    description: 'Retry scheduled after a 429 response from Stripe.',
    duration: 7200,
  },
]

let nextToastId = 1

function variantTone(variant: ToastVariant) {
  if (variant === 'success') return 'border-emerald-500/40 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/50 dark:text-emerald-50'
  if (variant === 'error') return 'border-red-500/40 bg-red-50 text-red-950 dark:bg-red-950/50 dark:text-red-50'
  if (variant === 'warning') return 'border-amber-500/40 bg-amber-50 text-amber-950 dark:bg-amber-950/50 dark:text-amber-50'
  return 'border-sky-500/40 bg-sky-50 text-sky-950 dark:bg-sky-950/50 dark:text-sky-50'
}

function variantBadge(variant: ToastVariant) {
  if (variant === 'success') return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200'
  if (variant === 'error') return 'bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-200'
  if (variant === 'warning') return 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200'
  return 'bg-sky-100 text-sky-800 dark:bg-sky-900/60 dark:text-sky-200'
}

export function ToastQueueDemo() {
  const [toasts, setToasts] = createSignal<QueueToast[]>([])
  const [paused, setPaused] = createSignal(false)
  const [eventLog, setEventLog] = createSignal<string[]>(['Queue ready'])
  const removeTimers = new Map<number, ReturnType<typeof setTimeout>>()

  const activeCount = createMemo(() => toasts().filter(t => t.status !== 'exiting').length)
  const exitingCount = createMemo(() => toasts().filter(t => t.status === 'exiting').length)
  const topVariant = createMemo(() => {
    const current = toasts().filter(t => t.status !== 'exiting')[0]
    return current ? current.variant : 'none'
  })

  const pushLog = (message: string) => {
    setEventLog(prev => [message, ...prev].slice(0, 5))
  }

  const dismissToast = (id: number) => {
    setToasts(prev => prev.map(t => t.id === id && t.status !== 'exiting' ? { ...t, status: 'exiting' as ToastStatus } : t))
    pushLog(`Dismissed toast #${id}`)
  }

  const removeToast = (id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  const addToast = (template: ToastTemplate) => {
    const id = nextToastId++
    const toast: QueueToast = {
      ...template,
      id,
      status: 'visible',
      createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }
    setToasts(prev => [toast, ...prev].slice(0, 6))
    pushLog(`Added ${template.variant} toast #${id}`)
  }

  const addBatch = () => {
    templates.forEach(template => addToast(template))
  }

  const addUrgent = () => {
    addToast({
      variant: 'error',
      title: 'Incident escalated',
      description: 'On-call acknowledged a production alert.',
      duration: 9000,
    })
  }

  createEffect(() => {
    const currentToasts = toasts()
    const currentIds = currentToasts.map(t => t.id)

    currentToasts.forEach(toast => {
      if (toast.status !== 'exiting' || removeTimers.has(toast.id)) return
      removeTimers.set(toast.id, setTimeout(() => {
        removeTimers.delete(toast.id)
        removeToast(toast.id)
      }, 340))
    })

    Array.from(removeTimers.keys()).forEach(id => {
      if (currentIds.includes(id)) return
      const timer = removeTimers.get(id)
      if (timer) clearTimeout(timer)
      removeTimers.delete(id)
    })
  })

  createEffect(() => {
    onCleanup(() => {
      Array.from(removeTimers.values()).forEach(timer => clearTimeout(timer))
      removeTimers.clear()
    })
  })

  createEffect(() => {
    if (!paused()) return
    const timer = setTimeout(() => setPaused(false), 1500)
    onCleanup(() => clearTimeout(timer))
  })

  return (
    <div className="space-y-6">
      <ToastProvider position="bottom-right" className="gap-3">
        {toasts().map((toast, index) => (
          <Toast
            key={toast.id}
            id={`queue-toast-${toast.id}`}
            variant={toast.variant}
            open={toast.status !== 'exiting'}
            duration={toast.duration}
            onOpenChange={open => {
              if (!open) dismissToast(toast.id)
            }}
            className={`toast-queue-item w-[min(24rem,calc(100vw-2rem))] ${variantTone(toast.variant)}`}
          >
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <span data-slot="toast-kind" className={`rounded px-1.5 py-0.5 text-xs font-medium uppercase ${variantBadge(toast.variant)}`}>{toast.variant}</span>
                <span data-slot="toast-id" className="text-xs opacity-70">#{toast.id}</span>
                <span data-slot="toast-order" className="sr-only">{index + 1}</span>
                <span data-slot="toast-time" className="ml-auto text-xs opacity-70">{toast.createdAt}</span>
              </div>
              <ToastTitle>{toast.title}</ToastTitle>
              <ToastDescription>{toast.description}</ToastDescription>
            </div>
            <ToastClose />
          </Toast>
        ))}
      </ToastProvider>

      <div className="rounded-lg border bg-card p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold">Notification Queue</h3>
            <p className="text-sm text-muted-foreground">Notifications are rendered through the shared ToastProvider portal.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button data-slot="add-batch" size="sm" onClick={addBatch}>Add batch</Button>
            <Button data-slot="add-urgent" size="sm" variant="destructive" onClick={addUrgent}>Add urgent</Button>
            <Button data-slot="clear-queue" size="sm" variant="outline" onClick={() => {
              setToasts(prev => prev.map(t => ({ ...t, status: 'exiting' as ToastStatus })))
              pushLog('Cleared queue')
            }}>
              Clear
            </Button>
          </div>
        </div>

        <Separator className="my-4" />

        <div data-slot="queue-stats" className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md bg-muted/50 p-3">
            <div className="text-xs text-muted-foreground">Active toasts</div>
            <div className="queue-active-count text-2xl font-semibold">{activeCount()}</div>
          </div>
          <div className="rounded-md bg-muted/50 p-3">
            <div className="text-xs text-muted-foreground">Exiting</div>
            <div className="queue-exiting-count text-2xl font-semibold">{exitingCount()}</div>
          </div>
          <div className="rounded-md bg-muted/50 p-3">
            <div className="text-xs text-muted-foreground">Top variant</div>
            <div className="queue-top-variant text-2xl font-semibold">{topVariant()}</div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
        <div data-slot="queue-source" className="rounded-lg border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Source queue</h3>
            <Badge variant="outline">{toasts().length} tracked</Badge>
          </div>
          <div className="space-y-2">
            {toasts().length === 0 ? (
              <div data-slot="empty-queue" className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                No notifications in the queue
              </div>
            ) : null}
            {toasts().map((toast, index) => (
              <div
                key={toast.id}
                data-slot="queue-row"
                data-toast-id={toast.id}
                data-state={toast.status}
                className="flex items-center gap-3 rounded-md border bg-background p-3"
              >
                <span className="text-xs tabular-nums text-muted-foreground">{index + 1}</span>
                <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${variantBadge(toast.variant)}`}>{toast.variant}</span>
                <span className="min-w-0 flex-1 truncate text-sm">{toast.title}</span>
                <span className="text-xs text-muted-foreground">{toast.status}</span>
              </div>
            ))}
          </div>
        </div>

        <div data-slot="event-log" className="rounded-lg border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold">Event log</h3>
          <div className="space-y-2">
            {eventLog().map(entry => (
              <div key={entry} className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                {entry}
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  )
}
