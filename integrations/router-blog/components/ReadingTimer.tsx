'use client'

import { createSignal, onMount, onCleanup } from '@barefootjs/client'

/**
 * An outlet island: a "time on this page" timer that ticks every 100ms.
 *
 * This is the disposal stress case. The interval is registered through
 * `onCleanup`, so when the router disposes the outgoing outlet
 * (`window.__bf_dispose_within` → `disposeScope`) the timer stops. If
 * disposal is NOT wired, the interval keeps firing forever after you leave
 * the post — the classic partial-navigation leak.
 */
export function ReadingTimer() {
  const [secs, setSecs] = createSignal(0)
  onMount(() => {
    const start = Date.now()
    const handle = setInterval(() => setSecs((Date.now() - start) / 1000), 100)
    onCleanup(() => clearInterval(handle))
  })
  return (
    <span className="island timer">
      ⏱ <span className="v">{secs().toFixed(1)}</span>s on this page
    </span>
  )
}
