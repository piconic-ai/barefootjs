/**
 * Snapshot cache — stale-while-revalidate with a jittered refresh window and
 * LRU eviction. Used by both prefetch and navigate, so a concurrent prefetch +
 * click share one request (the cached in-flight promise).
 */
import type { PageSnapshot, RouterState } from './types.ts'

const REFRESH_JITTER = 0.3 // ±30% on the per-entry refresh threshold

/** Fetch a page snapshot; resolves to `null` on a non-OK / failed response. */
export function fetchSnapshot(url: string): Promise<PageSnapshot | null> {
  return (async () => {
    try {
      const res = await fetch(url, { headers: { Accept: 'text/html' }, credentials: 'same-origin' })
      if (!res.ok) return null
      const finalUrl = res.redirected && res.url ? res.url : url
      const html = await res.text()
      return { html, finalUrl }
    } catch {
      return null
    }
  })()
}

/** Store `snap` under `url` with a jittered refresh window; bound the cache. */
function storeEntry(state: RouterState, url: string, snap: Promise<PageSnapshot | null>): void {
  const now = Date.now()
  // Jitter the refresh threshold so a batch of prefetches doesn't all
  // revalidate at the same instant (avoids a self-inflicted stampede).
  const jitter = 1 + (Math.random() * 2 - 1) * REFRESH_JITTER // 0.7 … 1.3
  state.cache.set(url, {
    snap,
    refreshAt: now + state.cacheFreshMs * jitter,
    staleAt: now + state.cacheStaleMs,
    refreshing: false,
  })
  // Don't cache failures (Next.js behavior): evict once it resolves to null
  // so the next prefetch/click retries fresh instead of being stuck.
  void snap.then((result) => {
    if (result === null && state.cache.get(url)?.snap === snap) state.cache.delete(url)
  })
  // Bound the cache (LRU: a hit re-inserts, so the first key is least-recent).
  while (state.cache.size > state.cacheCap) {
    const lru = state.cache.keys().next().value
    if (lru === undefined) break
    state.cache.delete(lru)
  }
}

/**
 * Return a page snapshot for `url`. Cache states:
 *   - **fresh** (`now < refreshAt`): serve the cached page, no refetch.
 *   - **aging** (`refreshAt ≤ now < staleAt`): serve the cached page instantly
 *     *and* refresh it in the background for next time (single-flight per URL).
 *   - **stale / miss** (`now ≥ staleAt` or absent): fetch fresh and return that
 *     — never serve content past `staleAt`.
 *
 * Returns `null` on failure so the caller can hard-navigate.
 */
export function loadPage(state: RouterState, url: string): Promise<PageSnapshot | null> {
  const hit = state.cache.get(url)
  const now = Date.now()

  if (hit && now < hit.staleAt) {
    if (now >= hit.refreshAt && !hit.refreshing) {
      // Aging → refresh in the background (single-flight), keep serving cached.
      hit.refreshing = true
      const fresh = fetchSnapshot(url)
      void fresh.then((result) => {
        if (result !== null) storeEntry(state, url, fresh) // swap in the fresh window
        else if (state.cache.get(url) === hit) hit.refreshing = false // failed → keep old, retry
      })
    }
    // LRU bump: move this entry to the most-recent position.
    state.cache.delete(url)
    state.cache.set(url, hit)
    return hit.snap
  }

  // Miss or past staleAt → fetch fresh (and cache it).
  const snap = fetchSnapshot(url)
  storeEntry(state, url, snap)
  return snap
}
