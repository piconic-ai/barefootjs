/**
 * Toast Queue Reference Page (/components/toast-queue)
 *
 * Block-level composition pattern: a signal-backed notification queue built
 * from the existing Toast UI components and ToastProvider portal.
 */

import { ToastQueueDemo } from '@/components/toast-queue-demo'
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

import { createSignal, createMemo, createEffect, onCleanup } from '@barefootjs/client'
import {
  ToastProvider,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
} from '@ui/components/ui/toast'

type QueueToast = {
  id: number
  variant: 'success' | 'error' | 'warning' | 'info'
  title: string
  description: string
  duration: number
  status: 'visible' | 'exiting'
}

const removeTimers = new Map<number, ReturnType<typeof setTimeout>>()

export function ToastQueueDemo() {
  const [toasts, setToasts] = createSignal<QueueToast[]>([])
  const activeCount = createMemo(() => toasts().filter(t => t.status !== 'exiting').length)

  const dismissToast = (id: number) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, status: 'exiting' } : t))
  }

  createEffect(() => {
    const current = toasts()
    current.forEach(toast => {
      if (toast.status !== 'exiting' || removeTimers.has(toast.id)) return
      removeTimers.set(toast.id, setTimeout(() => {
        removeTimers.delete(toast.id)
        setToasts(prev => prev.filter(t => t.id !== toast.id))
      }, 340))
    })
  })

  createEffect(() => {
    onCleanup(() => removeTimers.forEach(timer => clearTimeout(timer)))
  })

  return (
    <div>
      <button onClick={() => setToasts(prev => [makeToast(), ...prev])}>
        Add batch
      </button>
      <span>{activeCount()} active toasts</span>

      <ToastProvider position="bottom-right">
        {toasts().map(toast => (
          <Toast
            key={toast.id}
            variant={toast.variant}
            open={toast.status !== 'exiting'}
            duration={toast.duration}
            onOpenChange={open => {
              if (!open) dismissToast(toast.id)
            }}
          >
            <div className="flex-1">
              <ToastTitle>{toast.title}</ToastTitle>
              <ToastDescription>{toast.description}</ToastDescription>
            </div>
            <ToastClose />
          </Toast>
        ))}
      </ToastProvider>
    </div>
  )
}`

export function ToastQueueRefPage() {
  return (
    <DocPage slug="toast-queue" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Toast Queue"
          description="Signal-backed notification queue composed with the existing ToastProvider, Toast, ToastTitle, ToastDescription, and ToastClose components."
          {...getNavLinks('toast-queue')}
        />

        <Section id="preview" title="Preview">
          <Example title="" code={previewCode}>
            <ToastQueueDemo />
          </Example>
        </Section>

        <Section id="features" title="Features">
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-medium text-foreground mb-2">
                Toast Component Composition
              </h3>
              <p className="text-sm text-muted-foreground">
                The queue renders each notification with the existing{' '}
                <code className="text-xs">Toast</code> subcomponents instead of hand-written
                toast markup, so variants, roles, close behavior, and animation classes stay
                aligned with the UI registry.
              </p>
            </div>
            <div>
              <h3 className="text-base font-medium text-foreground mb-2">
                Owner-Scope Tracking
              </h3>
              <p className="text-sm text-muted-foreground">
                <code className="text-xs">ToastProvider</code> owns the portal into{' '}
                <code className="text-xs">document.body</code>, preserving the signal
                ownership chain after the provider node is moved outside the component tree.
              </p>
            </div>
            <div>
              <h3 className="text-base font-medium text-foreground mb-2">
                Per-Toast Cleanup
              </h3>
              <p className="text-sm text-muted-foreground">
                <code className="text-xs">Toast</code> handles auto-dismiss through its
                duration prop, while the queue tracks exit-removal timers and clears them
                through <code className="text-xs">onCleanup</code>.
              </p>
            </div>
            <div>
              <h3 className="text-base font-medium text-foreground mb-2">
                Stack Ordering + Exit Animation
              </h3>
              <p className="text-sm text-muted-foreground">
                The signal-backed queue keeps newest notifications first, and the provider's
                flex stack handles variable-height toast spacing. Manual dismiss changes
                the item status to <code className="text-xs">exiting</code>, then removes it
                after the animation delay.
              </p>
            </div>
          </div>
        </Section>
      </div>
    </DocPage>
  )
}
