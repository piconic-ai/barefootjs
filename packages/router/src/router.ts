/**
 * BarefootJS - Automatic partial-navigation client router
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
 * Reuses what already ships in `@barefootjs/client`:
 *   - the streaming swap primitive's re-hydration walk (`rehydrateAll`,
 *     surfaced as `window.__bf_hydrate`) re-scans freshly inserted
 *     `bf-s` scopes after the swap.
 *
 * Backend cooperation is **optional**: with no server change the router
 * fetches the full page and extracts `[bf-outlet]` client-side. A
 * backend that honours the `X-Barefoot-Navigate` request header may
 * return just the outlet fragment to cut payload — both shapes are
 * accepted.
 */

import { BF_OUTLET, BF_NAVIGATE_HEADER } from '@barefootjs/shared'

export interface RouterOptions {
  /**
   * CSS selector for the swappable content region.
   * Defaults to `[bf-outlet]`.
   */
  outlet?: string
  /**
   * Called after the outlet is swapped to re-hydrate the new islands.
   * Defaults to `window.__bf_hydrate()` (set by the client runtime's
   * `setupStreaming`), falling back to a dynamic import of
   * `@barefootjs/client/runtime`'s `rehydrateAll`.
   */
  rehydrate?: () => void | Promise<void>
  /**
   * Called with the current outlet element **before** it is replaced,
   * so consumers can dispose reactive scopes owned by the outgoing
   * islands. Optional: local-state islands are reclaimed by GC once
   * their DOM is detached. Precise disposal (a `createRoot`-keyed
   * scope registry in the client runtime) is the planned next step.
   */
  dispose?: (outlet: Element) => void
  /** Predicate deciding whether a clicked anchor is handled by the router. */
  shouldIntercept?: (anchor: HTMLAnchorElement, event: MouseEvent) => boolean
  /** Reset scroll to the top after a swap (default: true). */
  scrollToTop?: boolean
}

export interface NavigateOptions {
  /**
   * How to record the navigation in `history`.
   * - `'push'` (default): new entry.
   * - `'replace'`: replace the current entry.
   * - `false`: don't touch history (used for `popstate`, where the
   *   browser has already moved).
   */
  history?: 'push' | 'replace' | false
}

export interface Router {
  /** Tear down listeners and abort any in-flight navigation. */
  stop(): void
  /** Programmatically navigate (same logic as a link click). */
  navigate: (url: string, options?: NavigateOptions) => Promise<void>
}

interface RouterState {
  outletSelector: string
  rehydrate: () => void | Promise<void>
  dispose?: (outlet: Element) => void
  shouldIntercept: (anchor: HTMLAnchorElement, event: MouseEvent) => boolean
  scrollToTop: boolean
  inflight: AbortController | null
  stop: () => void
}

let active: RouterState | null = null

// ── public API ───────────────────────────────────────────────────────────

export function startRouter(options: RouterOptions = {}): Router {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return { stop() {}, navigate: async () => {} }
  }

  // One router at a time — replacing is idempotent.
  if (active) active.stop()

  const state: RouterState = {
    outletSelector: options.outlet ?? `[${BF_OUTLET}]`,
    rehydrate: options.rehydrate ?? defaultRehydrate,
    dispose: options.dispose,
    shouldIntercept: options.shouldIntercept ?? defaultShouldIntercept,
    scrollToTop: options.scrollToTop ?? true,
    inflight: null,
    stop: () => {},
  }

  document.addEventListener('click', onClick)
  window.addEventListener('popstate', onPopState)
  // Anchor the entry so a later back-navigation lands here.
  window.history.replaceState({ bfRouter: true }, '', window.location.href)

  state.stop = () => {
    document.removeEventListener('click', onClick)
    window.removeEventListener('popstate', onPopState)
    state.inflight?.abort()
    if (active === state) active = null
  }

  active = state
  return { stop: state.stop, navigate }
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

  // Supersede any in-flight navigation. `inflight` stays pointed at this
  // controller for the whole navigation (including the `res.text()` phase
  // and the swap) so a newer navigation aborts it — and so the abort
  // checks after each `await` below let the latest navigation win.
  state.inflight?.abort()
  const controller = new AbortController()
  state.inflight = controller

  try {
    let res: Response
    try {
      res = await fetch(target.href, {
        headers: { [BF_NAVIGATE_HEADER]: '1', Accept: 'text/html' },
        credentials: 'same-origin',
        signal: controller.signal,
      })
    } catch {
      if (controller.signal.aborted) return
      hardNavigate(target.href)
      return
    }
    if (controller.signal.aborted) return

    if (!res.ok) {
      hardNavigate(target.href)
      return
    }
    // Honour server redirects (trailing slash, auth bounce, …).
    const finalUrl = res.redirected && res.url ? res.url : target.href

    const html = await res.text()
    // A newer navigation may have started while the body streamed in —
    // bail before swapping so we never overwrite it with stale content.
    if (controller.signal.aborted) return

    const content = extractOutlet(html, state.outletSelector)
    const current = document.querySelector(state.outletSelector)
    if (!content || !current) {
      // Target isn't part of this shell — fall back to a full load.
      hardNavigate(finalUrl)
      return
    }

    // Tear down outgoing islands (best-effort) then swap only the outlet.
    state.dispose?.(current)
    current.replaceChildren(...content.nodes)
    if (content.title !== null) document.title = content.title

    if (mode === 'push') {
      window.history.pushState({ bfRouter: true }, '', finalUrl)
    } else if (mode === 'replace') {
      window.history.replaceState({ bfRouter: true }, '', finalUrl)
    }

    if (state.scrollToTop) window.scrollTo(0, 0)

    // Re-hydrate the freshly inserted islands.
    await state.rehydrate()
  } finally {
    // Only clear if we're still the current navigation — a newer one may
    // have replaced `inflight` already.
    if (state.inflight === controller) state.inflight = null
  }
}

// ── internals ──────────────────────────────────────────────────────────────

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
  // The browser already changed the URL — swap without touching history.
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

interface OutletContent {
  nodes: Node[]
  title: string | null
}

/**
 * Extract the outlet content from a navigation response. Accepts both
 * shapes:
 *   - **Full document** (no server cooperation): parse and pull the
 *     `[bf-outlet]` subtree's children.
 *   - **Bare fragment** (server honoured `X-Barefoot-Navigate`): the
 *     parsed body *is* the outlet content.
 *
 * Returns `null` when a full document arrives without the outlet marker
 * — that page belongs to a different shell, so the caller hard-navigates.
 */
function extractOutlet(html: string, selector: string): OutletContent | null {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const outlet = doc.querySelector(selector)
  const title = doc.querySelector('title')?.textContent ?? null

  let source: ParentNode | null = outlet
  if (!source) {
    const looksLikeFullDocument = /<html[\s>]/i.test(html) || /^\s*<!doctype/i.test(html)
    if (looksLikeFullDocument) return null // full page, no outlet → can't partial
    if (!doc.body || doc.body.childNodes.length === 0) return null
    source = doc.body
  }

  const nodes = Array.from(source.childNodes).map((n) => document.importNode(n, true))
  return { nodes, title }
}

async function defaultRehydrate(): Promise<void> {
  const w = window as unknown as { __bf_hydrate?: () => void }
  if (typeof w.__bf_hydrate === 'function') {
    w.__bf_hydrate()
    return
  }
  // Fall back to the runtime's named export. Variable specifier keeps the
  // client an optional peer (no static type/bundle dependency); the browser
  // resolves the bare specifier through the page's import map.
  try {
    const spec = '@barefootjs/client/runtime'
    const mod = (await import(spec)) as { rehydrateAll?: () => void }
    mod.rehydrateAll?.()
  } catch {
    // No client runtime on the page (static shell) — nothing to hydrate.
  }
}

function hardNavigate(url: string): void {
  window.location.assign(url)
}
