/**
 * The router controller: event interception, programmatic navigation, prefetch.
 *
 * One router is active at a time (`active`). `startRouter` installs all the
 * seams itself (correct by default — no opt-in step), delegates events on
 * `document`/`window`, and returns a `Router` handle. A navigation swaps only
 * the `[bf-region]` children, disposing the outgoing islands and re-hydrating
 * the incoming ones, with last-wins semantics across overlapping navigations.
 */

import { BF_REGION } from '@barefootjs/shared'
import { loadPage } from './cache.ts'
import { collectModuleScripts, extractRegion, loadNewModules } from './region.ts'
import {
  defaultDispose,
  defaultRehydrate,
  hardNavigate,
  pushSearchSeam,
} from './seams.ts'
import { announceNavigation, focusRegion } from './a11y.ts'
import type { NavigateOptions, Router, RouterOptions, RouterState } from './types.ts'

let active: RouterState | null = null

export function startRouter(options: RouterOptions = {}): Router {
  // SSR / non-DOM: a no-op handle, never throws.
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return { stop() {}, navigate: async () => {}, prefetch() {} }
  }

  // Replacing the active router is idempotent — tear the old one down first.
  if (active) active.stop()

  const state: RouterState = {
    regionSelector: options.region ?? `[${BF_REGION}]`,
    rehydrate: options.rehydrate ?? defaultRehydrate,
    dispose: options.dispose ?? defaultDispose,
    loadModule: options.loadModule ?? ((src) => import(src)),
    // Seed with modules already on the page so we never re-import them.
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
    manageFocus: options.manageFocus ?? true,
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
  // Anchor the entry so a later back-navigation lands here, preserving any
  // existing history.state a framework/scroll lib may have stored.
  commitHistory('replace', window.location.href)

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

// --- History --------------------------------------------------------------

/**
 * Commit a history entry while **preserving existing `history.state`**
 * (spec step 6). `replaceState` overwrites the current entry's state, so we
 * merge rather than clobber — a scroll-restoration lib or framework state
 * survives a router-driven replace. A `push` starts a fresh entry (there is no
 * prior state to keep), tagged so `popstate` can recognise router-owned entries.
 */
function commitHistory(mode: 'push' | 'replace', url: string): void {
  if (mode === 'push') {
    window.history.pushState({ bfRouter: true }, '', url)
  } else {
    const prev = (window.history.state ?? {}) as Record<string, unknown>
    window.history.replaceState({ ...prev, bfRouter: true }, '', url)
  }
}

// --- Click / navigation interception --------------------------------------

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

function onPopState(): void {
  if (!active) return
  // A query-only back/forward on the same route doesn't need a swap: push the
  // new query into the env signal (if a consumer registered the seam) and let
  // islands react fine-grained. A pathname change does need a swap, but the
  // browser already moved history, so don't write it again (`history: false`).
  if (
    window.location.pathname === active.currentPath &&
    pushSearchSeam(window.location.search)
  ) {
    return
  }
  void navigate(window.location.href, { history: false })
}

// --- Core navigation ------------------------------------------------------

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

  // Same-route, query-only change → if a `searchParams()` consumer registered
  // the seam, update the signal + URL but DON'T swap (islands react fine-
  // grained). Otherwise fall through to a normal swap (legacy behaviour).
  if (
    target.pathname === window.location.pathname &&
    target.search !== window.location.search &&
    pushSearchSeam(target.search)
  ) {
    state.inflight?.abort()
    if (mode === 'push') commitHistory('push', target.href)
    else if (mode === 'replace') commitHistory('replace', target.href)
    return
  }

  // Supersede any in-flight navigation. `inflight` doubles as a "still current"
  // flag: a newer navigation aborts it, and the abort checks after each `await`
  // let the latest navigation win. The fetch itself isn't cancelled — it still
  // populates the shared cache.
  state.inflight?.abort()
  const controller = new AbortController()
  state.inflight = controller

  try {
    const snap = await loadPage(state, target.href)
    if (controller.signal.aborted) return
    if (!snap) {
      hardNavigate(target.href)
      return
    }
    const finalUrl = snap.finalUrl

    const content = extractRegion(snap.html, state.regionSelector)
    const current = document.querySelector(state.regionSelector)
    if (!content || !current) {
      hardNavigate(finalUrl)
      return
    }

    // Dispose the outgoing islands, then swap only the region's children.
    await state.dispose(current)
    if (controller.signal.aborted) return
    current.replaceChildren(...content.nodes)
    if (content.title !== null) document.title = content.title

    // Register any island modules this response introduced before hydrating.
    await loadNewModules(state, content.moduleSrcs)
    if (controller.signal.aborted) return

    if (mode === 'push') commitHistory('push', finalUrl)
    else if (mode === 'replace') commitHistory('replace', finalUrl)

    const committed = new URL(finalUrl, window.location.href)
    state.currentPath = committed.pathname
    pushSearchSeam(committed.search)

    if (state.scrollToTop) window.scrollTo(0, 0)

    // Re-hydrate the freshly inserted islands (subtree-scoped).
    await state.rehydrate(current)

    // Accessibility: move focus into the new region and announce the route.
    if (state.manageFocus) {
      focusRegion(current)
      announceNavigation(content.title)
    }
  } finally {
    if (state.inflight === controller) state.inflight = null
  }
}

// --- Prefetch -------------------------------------------------------------

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

  void loadPage(state, target.href).then((snap) => {
    if (snap) preloadModules(state, snap.html)
  })
}

function preloadModules(state: RouterState, html: string): void {
  for (const src of extractRegion(html, state.regionSelector)?.moduleSrcs ?? []) {
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
  if (event.button !== 0) return
  const anchor = prefetchableAnchor(event)
  if (anchor) prefetch(anchor.href)
}
