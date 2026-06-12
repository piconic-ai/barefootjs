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
 * Backend-agnostic by design: the router fetches the full page and
 * extracts `[bf-outlet]` client-side, so **no server cooperation is
 * required** (works against any backend). It deliberately does *not* do
 * server-side fragment content-negotiation: returning just the outlet
 * would shave only highly-compressible shell markup (gzip already
 * handles it) while costing `Vary`-fragmented caching and the burden of
 * re-including island scripts + `<title>` in every fragment. The real
 * navigation cost is the round-trip, addressed by prefetch, not by
 * shrinking the payload. (`extractOutlet` still tolerates a bare-fragment
 * response, but the router never asks for one.)
 */

import { BF_OUTLET } from '@barefootjs/shared'

export interface RouterOptions {
  /**
   * CSS selector for the swappable content region.
   * Defaults to `[bf-outlet]`.
   */
  outlet?: string
  /**
   * Called with the (post-swap) outlet element to re-hydrate the new
   * islands. Defaults to `window.__bf_hydrate_within(outlet)` — the
   * client runtime's **subtree-scoped** walk (O(outlet), not O(document))
   * — falling back to the whole-document `window.__bf_hydrate()`, then to
   * a dynamic import of `@barefootjs/client/runtime`'s `rehydrateAll`.
   */
  rehydrate?: (outlet: Element) => void | Promise<void>
  /**
   * Called with the current outlet element **before** it is replaced, to
   * dispose the reactive scopes of the outgoing islands. Defaults to
   * `window.__bf_dispose_within(outlet)` — the client runtime's precise
   * per-scope disposal — so timers/listeners/subscriptions are released
   * rather than leaked. Pass `() => {}` to opt out.
   */
  dispose?: (outlet: Element) => void
  /**
   * Loads an island JS module the navigation introduced — the response's
   * `<script type="module" src>` tags (BfScripts) carry exactly which
   * modules the swapped-in islands need. Importing a module runs it, which
   * registers its `hydrate(name, def)` so the subsequent re-hydration can
   * init the island. Defaults to `(src) => import(src)`; already-loaded
   * modules (the initial page's, plus ones loaded on earlier navigations)
   * are skipped. Without this, an island whose module wasn't on the first
   * page would never hydrate after navigation.
   */
  loadModule?: (src: string) => Promise<unknown>
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
  rehydrate: (outlet: Element) => void | Promise<void>
  dispose: (outlet: Element) => void
  loadModule: (src: string) => Promise<unknown>
  /** Absolute URLs of module scripts already loaded (deduped across navs). */
  loadedModules: Set<string>
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
    dispose: options.dispose ?? defaultDispose,
    loadModule: options.loadModule ?? ((src) => import(src)),
    // Seed with the modules already on the page so we never re-import them.
    loadedModules: collectModuleScripts(document),
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
        headers: { Accept: 'text/html' },
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

    if (state.scrollToTop) window.scrollTo(0, 0)

    // Re-hydrate the freshly inserted islands (subtree-scoped).
    await state.rehydrate(current)
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
  /** `<script type="module" src>` URLs found anywhere in the response. */
  moduleSrcs: string[]
}

/** Absolute URLs of every `<script type="module" src>` under `root`. */
function collectModuleScripts(root: ParentNode): Set<string> {
  const out = new Set<string>()
  for (const s of root.querySelectorAll('script[type="module"][src]')) {
    const src = s.getAttribute('src')
    if (!src) continue
    try {
      out.add(new URL(src, window.location.href).href)
    } catch {
      /* skip un-resolvable src */
    }
  }
  return out
}

/** Import the modules in `srcs` not already loaded; records them as loaded. */
async function loadNewModules(state: RouterState, srcs: string[]): Promise<void> {
  const fresh = srcs.filter((s) => !state.loadedModules.has(s))
  await Promise.all(
    fresh.map(async (src) => {
      state.loadedModules.add(src) // mark first so a concurrent nav won't re-import
      try {
        await state.loadModule(src)
      } catch {
        // A failed import leaves the island un-hydrated; the page still
        // shows the swapped SSR HTML. Leave it marked to avoid retry storms.
      }
    }),
  )
}

/**
 * Extract the outlet content from a navigation response. The router
 * always fetches the full page, but this stays tolerant of both shapes:
 *   - **Full document** (the normal case): parse and pull the
 *     `[bf-outlet]` subtree's children.
 *   - **Bare fragment** (if a backend chooses to return just the region):
 *     the parsed body *is* the outlet content.
 *
 * Returns `null` when a full document arrives without the outlet marker
 * — that page belongs to a different shell, so the caller hard-navigates.
 */
function extractOutlet(html: string, selector: string): OutletContent | null {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const outlet = doc.querySelector(selector)
  const title = doc.querySelector('title')?.textContent ?? null
  // Island module scripts sit at body-end (BfScripts), outside the outlet —
  // collect from the whole response, not just the swapped subtree.
  const moduleSrcs = [...collectModuleScripts(doc)]

  let source: ParentNode | null = outlet
  if (!source) {
    const looksLikeFullDocument = /<html[\s>]/i.test(html) || /^\s*<!doctype/i.test(html)
    if (looksLikeFullDocument) return null // full page, no outlet → can't partial
    if (!doc.body || doc.body.childNodes.length === 0) return null
    source = doc.body
  }

  const nodes = Array.from(source.childNodes).map((n) => document.importNode(n, true))
  return { nodes, title, moduleSrcs }
}

interface ClientSeams {
  __bf_hydrate_within?: (root: Element) => void
  __bf_dispose_within?: (root: Element) => void
  __bf_hydrate?: () => void
}

async function defaultRehydrate(outlet: Element): Promise<void> {
  const w = window as unknown as ClientSeams
  // Prefer the subtree-scoped walk — O(outlet), not O(document).
  if (typeof w.__bf_hydrate_within === 'function') {
    w.__bf_hydrate_within(outlet)
    return
  }
  if (typeof w.__bf_hydrate === 'function') {
    w.__bf_hydrate()
    return
  }
  // Fall back to the runtime's named exports. Variable specifier keeps the
  // client an optional peer (no static type/bundle dependency); the browser
  // resolves the bare specifier through the page's import map.
  try {
    const spec = '@barefootjs/client/runtime'
    const mod = (await import(spec)) as {
      rehydrateScope?: (root: Element) => void
      rehydrateAll?: () => void
    }
    if (mod.rehydrateScope) mod.rehydrateScope(outlet)
    else mod.rehydrateAll?.()
  } catch {
    // No client runtime on the page (static shell) — nothing to hydrate.
  }
}

function defaultDispose(outlet: Element): void {
  const w = window as unknown as ClientSeams
  // Precise per-scope disposal when the client runtime exposes it; otherwise
  // a no-op (detached local-state islands are reclaimed by GC).
  w.__bf_dispose_within?.(outlet)
}

function hardNavigate(url: string): void {
  window.location.assign(url)
}
