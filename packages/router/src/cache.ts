/**
 * Stale-while-revalidate snapshot cache with an LRU bound.
 *
 * The cache stores *Promises*, so a prefetch and a near-simultaneous click for
 * the same URL share a single in-flight request (single-flight). Three states,
 * keyed on `now` vs the entry's `refreshAt`/`staleAt`:
 *   - fresh  (now < refreshAt)  → serve cached, no refetch.
 *   - aging  (refreshAt ≤ now < staleAt) → serve cached AND refresh in the
 *     background (single-flight), so a swap is instant while the next is fresh.
 *   - stale  (now ≥ staleAt) / miss → fetch synchronously; never serve stale.
 */

import type { PageSnapshot, RouterState } from './types.ts'

const REFRESH_JITTER = 0.3 // ±30% on the per-entry refresh threshold

export function fetchSnapshot(url: string): Promise<PageSnapshot | null> {
  return (async () => {
    try {
      const res = await fetch(url, { headers: { Accept: 'text/html' }, credentials: 'same-origin' })
      if (!res.ok) return null
      // Response-URL base resolution: a redirect commits at the real URL.
      const finalUrl = res.redirected && res.url ? res.url : url
      const html = await res.text()
      return { html, finalUrl }
    } catch {
      return null
    }
  })()
}

function storeEntry(state: RouterState, url: string, snap: Promise<PageSnapshot | null>): void {
  const now = Date.now()
  const jitter = 1 + (Math.random() * 2 - 1) * REFRESH_JITTER // 0.7 … 1.3
  state.cache.set(url, {
    snap,
    refreshAt: now + state.cacheFreshMs * jitter,
    staleAt: now + state.cacheStaleMs,
    refreshing: false,
  })
  // Don't cache failures: evict once the promise resolves to null.
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
        else if (state.cache.get(url) === hit) hit.refreshing = false // failed → keep old, retry later
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
