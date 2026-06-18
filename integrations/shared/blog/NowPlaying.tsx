'use client'

import { createSignal, onMount, onCleanup } from '@barefootjs/client'

/** A short demo "track" length (seconds) so the progress bar advances visibly. */
const TRACK = 8

/**
 * A docked **"Now playing" bar** (fixed to the bottom of the viewport) that
 * demonstrates **v1 persistence** (`data-bf-permanent`).
 *
 * It reads as a global player — not article metadata — but it lives in the DOM
 * inside the swappable content region and is marked `data-bf-permanent`. So on a
 * post→post navigation the router moves this **live** node into the incoming
 * page instead of disposing it: the progress bar keeps advancing from where it
 * was, rather than snapping back to the start. Contrast `ReadingTimer` (per-page,
 * unmarked): it is disposed and rebuilt on every swap and resets to 0.
 */
export function NowPlaying() {
  const [playing, setPlaying] = createSignal(false)
  const [elapsed, setElapsed] = createSignal(0)

  onMount(() => {
    const handle = setInterval(() => {
      if (playing()) setElapsed((s) => Math.round((s + 0.1) * 10) / 10)
    }, 100)
    onCleanup(() => clearInterval(handle))
  })

  return (
    <div className="now-playing-bar" data-bf-permanent="now-playing">
      <button
        className="np-toggle"
        type="button"
        aria-label={playing() ? 'pause' : 'play'}
        onClick={() => setPlaying(!playing())}
      >
        {playing() ? '⏸' : '▶'}
      </button>
      <span className="np-title">Now playing · Ambient Focus</span>
      <span className="np-bar" aria-hidden="true">
        <span className="np-fill" style={`width:${Math.min(100, (elapsed() / TRACK) * 100)}%`} />
      </span>
      <span className="np-time v">{elapsed().toFixed(1)}</span>s
    </div>
  )
}
