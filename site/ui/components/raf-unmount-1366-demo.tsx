"use client"
/**
 * Demo for #1366 — Runtime: cancel requestAnimationFrame on unmount.
 *
 * The rAF-scheduling createEffect reads `show()` directly so a `setShow(false)`
 * synchronously re-runs the effect, which fires the registered onCleanup
 * (`cancelAnimationFrame`) before the next animation frame ticks. The body
 * then early-returns, leaving no live handle.
 *
 * This is the same invariant the issue's <Pulse> repro exercises — the
 * effect lifecycle is what matters, not whether the rAF lives inside a
 * nested "use client" subtree. (Nested use-client disposal across a
 * conditional swap is its own broader path; see the spec comment.)
 *
 * Instrumentation: each rAF fire increments `window.__rafFiredCount`,
 * which the Playwright spec reads to assert no leaked frame after unmount.
 */

import { createSignal, createEffect, onCleanup } from '@barefootjs/client'

interface BfRafUnmountWindow extends Window {
  __rafFiredCount?: number
}

export function RafUnmountDemo() {
  const [show, setShow] = createSignal(false)
  const [t, setT] = createSignal(0)

  createEffect(() => {
    if (!show()) return
    const h = requestAnimationFrame(() => {
      const w = window as BfRafUnmountWindow
      w.__rafFiredCount = (w.__rafFiredCount ?? 0) + 1
      setT(performance.now())
    })
    onCleanup(() => cancelAnimationFrame(h))
  })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <button
          type="button"
          data-testid="mount"
          className="px-3 py-1 border rounded"
          onClick={() => setShow(true)}
        >
          Mount
        </button>
        <button
          type="button"
          data-testid="unmount"
          className="px-3 py-1 border rounded"
          onClick={() => setShow(false)}
        >
          Unmount
        </button>
      </div>
      <div data-testid="pulse-slot">
        {show() ? <div data-testid="pulse-time">{t()}</div> : null}
      </div>
    </div>
  )
}
