'use client'

import { createSignal, onMount, onCleanup } from '@barefootjs/client'

/**
 * A region island that demonstrates **v1 persistence** (`data-bf-permanent`).
 *
 * A fake "now playing" mini-player: press ▶ and an elapsed counter ticks. Its
 * root carries `data-bf-permanent="now-playing"`, so on a post→post navigation
 * the router moves this **live** DOM node (with its play state and elapsed
 * time) into the incoming page instead of disposing and recreating it — the
 * track keeps "playing" and the clock keeps counting across the swap.
 *
 * Contrast `ReadingTimer` next to it: that one is NOT marked, so it is disposed
 * and rebuilt on every swap and resets to 0. Same region, same swap — the only
 * difference is the marker.
 */
export function NowPlaying() {
  const [playing, setPlaying] = createSignal(false)
  const [elapsed, setElapsed] = createSignal(0)

  onMount(() => {
    const handle = setInterval(() => {
      if (playing()) setElapsed((s) => s + 0.1)
    }, 100)
    onCleanup(() => clearInterval(handle))
  })

  return (
    <span className="island player" data-bf-permanent="now-playing">
      <button
        className="player-toggle"
        type="button"
        aria-label={playing() ? 'pause' : 'play'}
        onClick={() => setPlaying(!playing())}
      >
        {playing() ? '⏸' : '▶'}
      </button>
      <span className="player-time v">{elapsed().toFixed(1)}</span>s
    </span>
  )
}
