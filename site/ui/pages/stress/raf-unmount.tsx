/**
 * Stress page for #1366 — Runtime: cancel requestAnimationFrame on unmount.
 *
 * Backs the Layer 6 regression in `site/ui/e2e/stress-1244.spec.ts`.
 */

import { RafUnmountDemo } from '@/components/raf-unmount-1366-demo'

export function RafUnmountStressPage() {
  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold mb-3">Stress #1366 — rAF unmount</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Mounts a <code>Pulse</code> that schedules a <code>requestAnimationFrame</code>{' '}
        inside <code>createEffect</code> and cancels it in <code>onCleanup</code>.
        Unmounting before the next frame must keep <code>window.__rafFiredCount</code> at 0.
      </p>
      <RafUnmountDemo />
    </div>
  )
}
