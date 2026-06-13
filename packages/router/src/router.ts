/**
 * BarefootJS — automatic partial-navigation client router (alpha).
 *
 * Turbo-Drive-style navigation scoped to a single content **outlet**.
 * On a same-origin link click the router fetches the target URL, swaps
 * only the `[bf-outlet]` region, and re-hydrates the islands inside it
 * — the surrounding shell (header, sidebar, pagination nav) stays
 * mounted with its signal state intact.
 *
 * "Automatic" means the developer wires the outlet **once**; every
 * internal `<a>` then partial-updates with no per-link annotation. The
 * long-term goal is for the compiler to derive the outlet boundary from
 * the component tree and emit `bf-outlet` automatically.
 *
 * Backend-agnostic by design: the router fetches the full page and
 * extracts `[bf-outlet]` client-side, so **no server cooperation is
 * required** — it works against any backend. The navigation cost is the
 * round-trip, addressed by prefetch, not by shrinking the payload.
 *
 * This module is the controller; the moving parts live alongside it:
 *   - `types.ts`         — shared interfaces
 *   - `seams.ts`         — `window.*` bridges to the optional client runtime
 *   - `cache.ts`         — snapshot cache (stale-while-revalidate)
 *   - `outlet.ts`        — read the response: extract outlet + island modules
 *   - `search-params.ts` — the `searchParams()` environment signal
 */

import { BF_OUTLET } from '@barefootjs/shared'
import { loadPage } from './cache.ts'
import { collectModuleScripts, extractOutlet, loadNewModules } from './outlet.ts'
import {
  defaultDispose,
  defaultRehydrate,
  hardNavigate,
  setSearchSeam,
} from './seams.ts'
import type { NavigateOptions, Router, RouterOptions, RouterState } from './types.ts'

let active: RouterState | null = null

// ── public API ───────────────────────────────────────────────────────────

export function startRouter(options: RouterOptions = {}): Router {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return { stop() {}, navigate: async () => {}, prefetch() {} }
  }

  // One router at a time — replacing is idempotent.
  if (active) active.stop()

  const state: RouterState = {
    outletSelector: options.outlet ?? `[${BF_OUTLET}]`,
    rehydrate: options.rehydrate ?? defaultRehydrate,
    dispose: options.dispose ?? defaultDispose,
    loadModule: options.loadModule ?? ((src) => import(src)),
    // Seed with the modules already on the page so we never re-import them.
    loadedModules: collectModuleScripts(document),
    prefetchEnabled: options.prefetch ?? true,
    prefetchDelay: options.prefetchDelay ?? 65,
    cacheFreshMs: options.cacheFreshMs ?? 15_000,
    cacheStaleMs: options.cacheStaleMs ?? 60_000,
    cacheCap: options.cacheCap ?? 30,
    cache: new Map(),
    preloaded: new Set(),
    shouldIntercept: options.shouldIntercept ?? defaultShouldIntercept,
    scrollToTop: options.scrollToTop ?? true,
    currentPath: window.location.pathname,
    inflight: null,
    stop: () => {},
  }

  document.addEventListener('click', onClick)
  window.addEventListener('popstate', onPopState)
  if (state.prefetchEnabled) {
    document.addEventListener('mouseover', onPointerOver)
    document.addEventListener('mouseout', onPointerOut)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('pointerdown', onPointerDown)
  }
  // Anchor the entry so a later back-navigation lands here.
  window.history.replaceState({ bfRouter: true }, '', window.location.href)

  state.stop = () => {
    document.removeEventListener('click', onClick)
    window.removeEventListener('popstate', onPopState)
    document.removeEventListener('mouseover', onPointerOver)
    document.removeEventListener('mouseout', onPointerOut)
    document.removeEventListener('focusin', onFocusIn)
    document.removeEventListener('pointerdown', onPointerDown)
    clearHoverTimer()
    state.inflight?.abort()
    if (active === state) active = null
  }

  active = state
  return { stop: state.stop, navigate, prefetch: (url) => prefetch(url) }
}

export async function navigate(url: string, options: NavigateOptions = {}): Promise<void> {
  const mode = options.history ?? 'push'
  const state = active
  if (!state) {
    hardNavigate(url)
    return
  }

  const target = new URL(url, window.location.href)
  // Different origin → hand back to the browser.
  if (target.origin !== window.location.origin) {
    hardNavigate(url)
    return
  }

  // Same-route, query-only change → if an island consumes `searchParams()`
  // (the `@barefootjs/router/signals` module set the seam), update the signal
  // and the URL but DON'T swap: islands react fine-grained. If searchParams
  // isn't in use, fall through to a normal swap (legacy behavior).
  if (
    target.pathname === window.location.pathname &&
    target.search !== window.location.search &&
    setSearchSeam(target.search)
  ) {
    if (mode === 'push') window.history.pushState({ bfRouter: true }, '', target.href)
    else if (mode === 'replace') window.history.replaceState({ bfRouter: true }, '', target.href)
    return
  }

  // Supersede any in-flight navigation. `inflight` acts as a "still the
  // current navigation" flag: a newer navigation aborts it, and the abort
  // checks after each `await` below let the latest navigation win. (The
  // underlying page fetch lives in the shared cache and isn't cancelled —
  // a superseded fetch just populates the cache for free.)
  state.inflight?.abort()
  const controller = new AbortController()
  state.inflight = controller

  try {
    // Reuse a prefetched/cached page, or fetch now (and cache it).
    const snap = await loadPage(state, target.href)
    // A newer navigation may have started while the page loaded — bail
    // before swapping so we never overwrite it with stale content.
    if (controller.signal.aborted) return
    if (!snap) {
      hardNavigate(target.href)
      return
    }
    const finalUrl = snap.finalUrl

    const content = extractOutlet(snap.html, state.outletSelector)
    const current = document.querySelector(state.outletSelector)
    if (!content || !current) {
      // Target isn't part of this shell — fall back to a full load.
      hardNavigate(finalUrl)
      return
    }

    // Dispose the outgoing islands, then swap only the outlet.
    state.dispose(current)
    current.replaceChildren(...content.nodes)
    if (content.title !== null) document.title = content.title

    // Load any island modules this response introduced (registers their
    // defs) before hydrating — otherwise a newly-arrived island has no def
    // and the re-hydration walk silently skips it.
    await loadNewModules(state, content.moduleSrcs)
    if (controller.signal.aborted) return

    if (mode === 'push') {
      window.history.pushState({ bfRouter: true }, '', finalUrl)
    } else if (mode === 'replace') {
      window.history.replaceState({ bfRouter: true }, '', finalUrl)
    }

    // Record the displayed route and sync the searchParams signal so islands
    // on the freshly-swapped page see the correct query.
    const committed = new URL(finalUrl, window.location.href)
    state.currentPath = committed.pathname
    setSearchSeam(committed.search)

    if (state.scrollToTop) window.scrollTo(0, 0)

    // Re-hydrate the freshly inserted islands (subtree-scoped).
    await state.rehydrate(current)
  } finally {
    // Only clear if we're still the current navigation — a newer one may
    // have replaced `inflight` already.
    if (state.inflight === controller) state.inflight = null
  }
}

// ── prefetch ─────────────────────────────────────────────────────────────

/** Warm a URL's page (cache) and `modulepreload` its island modules. */
function prefetch(url: string): void {
  const state = active
  if (!state) return
  let target: URL
  try {
    target = new URL(url, window.location.href)
  } catch {
    return
  }
  if (target.origin !== window.location.origin) return
  if (target.href === window.location.href) return // current page

  // loadPage handles dedup (a fresh entry returns without refetching) and the
  // aging refresh, so re-hovering never re-fetches a fresh page.
  void loadPage(state, target.href).then((snap) => {
    if (snap) preloadModules(state, snap.html)
  })
}

/**
 * `modulepreload` the island modules a prefetched page carries: fetch +
 * compile (no execute), so the click's `import()` runs instantly without
 * a network wait — and without triggering hydration during the hover.
 */
function preloadModules(state: RouterState, html: string): void {
  for (const src of extractOutlet(html, state.outletSelector)?.moduleSrcs ?? []) {
    if (state.loadedModules.has(src) || state.preloaded.has(src)) continue
    state.preloaded.add(src)
    const link = document.createElement('link')
    link.rel = 'modulepreload'
    link.href = src
    document.head.appendChild(link)
  }
}

let hoverTimer: ReturnType<typeof setTimeout> | null = null

function clearHoverTimer(): void {
  if (hoverTimer !== null) {
    clearTimeout(hoverTimer)
    hoverTimer = null
  }
}

/** Anchor under an event target that the router would intercept, else null. */
function prefetchableAnchor(event: Event): HTMLAnchorElement | null {
  const state = active
  if (!state) return null
  const anchor = (event.target as Element | null)?.closest?.('a') as HTMLAnchorElement | null
  if (!anchor || !anchor.getAttribute('href')) return null
  if (!state.shouldIntercept(anchor, event as MouseEvent)) return null
  return anchor
}

function onPointerOver(event: MouseEvent): void {
  const anchor = prefetchableAnchor(event)
  if (!anchor) return
  clearHoverTimer()
  const href = anchor.href
  hoverTimer = setTimeout(() => {
    hoverTimer = null
    prefetch(href)
  }, active?.prefetchDelay ?? 65)
}

function onPointerOut(): void {
  clearHoverTimer()
}

function onFocusIn(event: FocusEvent): void {
  const anchor = prefetchableAnchor(event)
  if (anchor) prefetch(anchor.href) // keyboard focus is intentional — no dwell
}

function onPointerDown(event: MouseEvent): void {
  // A primary press (mouse / touch / pen) is near-certain intent and fires
  // tens of ms before `click`, so prefetch immediately — no dwell. Covers
  // touch (no separate touchstart needed).
  if (event.button !== 0) return
  const anchor = prefetchableAnchor(event)
  if (anchor) prefetch(anchor.href)
}

// ── event handlers ───────────────────────────────────────────────────────

function onClick(event: MouseEvent): void {
  if (!active) return
  if (event.defaultPrevented) return
  // Only plain left-clicks — let the browser own modified / middle clicks.
  if (event.button !== 0) return
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

  const target = event.target as Element | null
  const anchor = target?.closest?.('a') as HTMLAnchorElement | null
  if (!anchor || !anchor.getAttribute('href')) return
  if (!active.shouldIntercept(anchor, event)) return

  event.preventDefault()
  void navigate(anchor.href)
}

function onPopState(): void {
  if (!active) return
  // A query-only back/forward on the same route doesn't need a swap — the
  // searchParams module (if loaded) self-syncs on popstate and islands react.
  // A pathname change does: swap without touching history.
  if (window.location.pathname === active.currentPath && setSearchSeam(window.location.search)) {
    return
  }
  void navigate(window.location.href, { history: false })
}

function defaultShouldIntercept(anchor: HTMLAnchorElement): boolean {
  if (anchor.dataset.bfRouter === 'false') return false
  if (anchor.hasAttribute('download')) return false

  const linkTarget = anchor.getAttribute('target')
  if (linkTarget && linkTarget !== '_self') return false

  const rel = anchor.getAttribute('rel') ?? ''
  if (rel.split(/\s+/).includes('external')) return false

  let url: URL
  try {
    url = new URL(anchor.href, window.location.href)
  } catch {
    return false
  }
  if (url.origin !== window.location.origin) return false

  // Same page, hash-only change → let the browser scroll to the anchor.
  if (
    url.pathname === window.location.pathname &&
    url.search === window.location.search &&
    url.hash
  ) {
    return false
  }

  return true
}
