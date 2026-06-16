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
import {
  collectModuleScripts,
  collectRegionModuleSrcs,
  extractRegion,
  loadNewModules,
} from './region.ts'
import { buildMorphedContent } from './morph.ts'
import {
  defaultDispose,
  defaultRehydrate,
  hardNavigate,
  pushSearchSeam,
} from './seams.ts'
import { announceNavigation, focusRegion } from './a11y.ts'
import type {
  NavigateOptions,
  PageSnapshot,
  Router,
  RouterOptions,
  RouterState,
} from './types.ts'

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
    // Bind through a wrapper so a default `fetch` keeps its global `this`.
    fetchFn: options.fetch ?? ((input, init) => fetch(input, init)),
    // Seed with modules already on the page so we never re-import them. The
    // live document's srcs resolve against the current location.
    loadedModules: collectModuleScripts(document, window.location.href),
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
    morph: options.morph ?? true,
    currentPath: window.location.pathname,
    inflight: null,
    hoverTimer: null,
    hoverAnchor: null,
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
    clearHoverTimer(state)
    state.inflight?.abort()
    if (active === state) active = null
  }

  active = state
  return { stop: state.stop, navigate, prefetch: (url) => prefetch(url) }
}

/** Collect nodes into a fragment (the non-morph swap path). */
function toFragment(nodes: Node[]): DocumentFragment {
  const frag = document.createDocumentFragment()
  for (const node of nodes) frag.appendChild(node)
  return frag
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
  // SSR / non-DOM: a no-op. The bare `navigate` export is documented SSR-safe,
  // but on the server `active` is null and the fall-through to `hardNavigate`
  // would touch `window` and throw — guard before that.
  if (typeof window === 'undefined' || typeof document === 'undefined') return
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

    // Resolve the incoming document's module srcs against the response's final
    // URL (after redirects), not the current location.
    const content = extractRegion(snap.html, state.regionSelector, finalUrl)
    const current = document.querySelector(state.regionSelector)
    if (!content || !current) {
      hardNavigate(finalUrl)
      return
    }

    // Build the incoming tree (morph re-homes live `[data-bf-permanent]` nodes
    // into it) and swap — both synchronous. A morph-preserved node therefore
    // travels current → fragment → current without ever being detached across
    // the dispose `await`: a navigation that supersedes this one still finds it
    // under the region (last-wins safe), and an abort/throw during dispose can't
    // leave it orphaned. With no permanent nodes this is a plain `replaceChildren`.
    const fragment = state.morph
      ? buildMorphedContent(current, content.nodes)
      : toFragment(content.nodes)
    // A shallow clone of the region element (its tag, attributes, id, classes —
    // e.g. `main[bf-region]`) so a custom `dispose` sees the same shell it ran
    // against on first mount, not a bare `<div>`.
    const outgoing = current.cloneNode(false) as Element
    // Move every current child into the holder. An explicit drain (rather than
    // `append(...current.childNodes)`) is unambiguous about not skipping nodes
    // while the live `childNodes` shrinks.
    while (current.firstChild) outgoing.append(current.firstChild)
    current.replaceChildren(fragment)
    if (content.title !== null) document.title = content.title

    // Dispose the outgoing islands. They're now detached in `outgoing`, and the
    // swap is already committed, so a superseded navigation just skips the
    // remaining work below — it never has to undo a DOM mutation. With `morph`,
    // any matched `[data-bf-permanent]` node was moved into the new tree above,
    // so it isn't here; with `morph: false` the permanent nodes stay in
    // `outgoing` and are disposed normally.
    await state.dispose(outgoing)
    if (controller.signal.aborted) return

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
    // `rehydrate` may await (a dynamic import); a newer navigation could have
    // superseded us in the meantime — don't run a11y side effects on what is
    // now stale content.
    if (controller.signal.aborted) return

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
    if (snap) preloadModules(state, snap)
  })
}

function preloadModules(state: RouterState, snap: PageSnapshot): void {
  // Parse once and read only the module srcs (no region-node import), resolved
  // against the fetched page's final URL.
  const srcs = collectRegionModuleSrcs(snap.html, state.regionSelector, snap.finalUrl) ?? []
  for (const src of srcs) {
    if (state.loadedModules.has(src) || state.preloaded.has(src)) continue
    state.preloaded.add(src)
    const link = document.createElement('link')
    link.rel = 'modulepreload'
    link.href = src
    document.head.appendChild(link)
  }
}

// The dwell timer lives on `RouterState` (per instance), not at module scope —
// so two routers don't share one timer and tests are isolated without manual
// global resets.
function clearHoverTimer(state: RouterState): void {
  if (state.hoverTimer !== null) {
    clearTimeout(state.hoverTimer)
    state.hoverTimer = null
  }
  state.hoverAnchor = null
}

function prefetchableAnchor(event: Event): HTMLAnchorElement | null {
  const state = active
  if (!state) return null
  const anchor = (event.target as Element | null)?.closest?.('a') as HTMLAnchorElement | null
  if (!anchor || !anchor.getAttribute('href')) return null
  if (!state.shouldIntercept(anchor, event)) return null
  return anchor
}

function onPointerOver(event: MouseEvent): void {
  const state = active
  if (!state) return
  const anchor = prefetchableAnchor(event)
  if (!anchor) return
  // `mouseover` bubbles, so moving between descendants of the same link fires it
  // repeatedly — don't restart the dwell each time we're already on this anchor.
  if (anchor === state.hoverAnchor) return
  clearHoverTimer(state)
  state.hoverAnchor = anchor
  const href = anchor.href
  state.hoverTimer = setTimeout(() => {
    state.hoverTimer = null
    state.hoverAnchor = null
    prefetch(href)
  }, state.prefetchDelay)
}

function onPointerOut(event: MouseEvent): void {
  const state = active
  if (!state || !state.hoverAnchor) return
  // `mouseout` also bubbles: moving between descendants inside the same `<a>`
  // fires it even though the pointer is still over the link. Only cancel when
  // the pointer actually left the dwelled anchor (it moved to a node outside it).
  const to = event.relatedTarget as Node | null
  if (to && state.hoverAnchor.contains(to)) return
  clearHoverTimer(state)
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
