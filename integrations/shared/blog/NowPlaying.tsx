'use client'

import { createSignal, onMount, onCleanup } from '@barefootjs/client'

/** A short demo "track" length (seconds) so the progress bar advances visibly. */
const TRACK = 8

/**
 * A region island that demonstrates **v1 persistence** (`data-bf-permanent`).
 *
 * A fake "now playing" mini-player: press ▶ and a **progress bar** advances
 * (with the elapsed seconds beside it). Its root carries
 * `data-bf-permanent="now-playing"`, so on a post→post navigation the router
 * moves this **live** DOM node into the incoming page instead of disposing it —
 * the bar keeps advancing from where it was, rather than snapping back to the
 * start. Contrast `ReadingTimer` next to it: that one is NOT marked, so it is
 * disposed and rebuilt on every swap and resets to 0. Same region, same swap —
 * the only difference is the marker.
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
    <span className="island player" data-bf-permanent="now-playing">
      <button
        className="player-toggle"
        type="button"
        aria-label={playing() ? 'pause' : 'play'}
        onClick={() => setPlaying(!playing())}
      >
        {playing() ? '⏸' : '▶'}
      </button>
      <span className="player-bar" aria-hidden="true">
        <span className="player-fill" style={`width:${Math.min(100, (elapsed() / TRACK) * 100)}%`} />
      </span>
      <span className="player-time v">{elapsed().toFixed(1)}</span>s
    </span>
  )
}
