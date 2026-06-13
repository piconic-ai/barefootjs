/**
 * Shared types for `@barefootjs/router`.
 */

export interface RouterOptions {
  /** CSS selector for the swappable content region. Defaults to `[bf-outlet]`. */
  outlet?: string
  /**
   * Called with the (post-swap) outlet element to re-hydrate the new islands.
   * Defaults to `window.__bf_hydrate_within(outlet)` — the client runtime's
   * subtree-scoped walk (O(outlet), not O(document)) — falling back to the
   * whole-document `window.__bf_hydrate()`, then to a dynamic import of
   * `@barefootjs/client/runtime`'s `rehydrateAll`.
   */
  rehydrate?: (outlet: Element) => void | Promise<void>
  /**
   * Called with the current outlet element **before** it is replaced, to
   * dispose the reactive scopes of the outgoing islands. Defaults to
   * `window.__bf_dispose_within(outlet)` — the client runtime's precise
   * per-scope disposal. Pass `() => {}` to opt out.
   */
  dispose?: (outlet: Element) => void
  /**
   * Loads an island JS module the navigation introduced — the response's
   * `<script type="module" src>` tags carry which modules the swapped-in
   * islands need. Importing a module runs it, registering its
   * `hydrate(name, def)` so re-hydration can init the island. Defaults to
   * `(src) => import(src)`; already-loaded modules are skipped.
   */
  loadModule?: (src: string) => Promise<unknown>
  /** Predicate deciding whether a clicked anchor is handled by the router. */
  shouldIntercept?: (anchor: HTMLAnchorElement, event: MouseEvent) => boolean
  /** Reset scroll to the top after a swap (default: true). */
  scrollToTop?: boolean
  /**
   * Prefetch a link's page on hover (dwell), focus, or primary press
   * (`pointerdown`) and cache it, so the click reuses it with no network
   * wait. Also `modulepreload`s the page's island modules. Default: `true`.
   */
  prefetch?: boolean
  /** Hover dwell (ms) before a prefetch fires, to skip quick sweeps (default 65). */
  prefetchDelay?: number
  /**
   * How long (ms) a cached page is served without refetch. Between this and
   * `cacheStaleMs` the cache is "aging": still served instantly, but refreshed
   * in the background for next time (stale-while-revalidate). Default: 15000.
   */
  cacheFreshMs?: number
  /** ms after which a cached page is too old to serve and is refetched fresh. Default: 60000. */
  cacheStaleMs?: number
  /** Max cached pages; least-recently-used evicted past this. Default: 30. */
  cacheCap?: number
}

export interface NavigateOptions {
  /**
   * How to record the navigation in `history`.
   * - `'push'` (default): new entry.
   * - `'replace'`: replace the current entry.
   * - `false`: don't touch history (used for `popstate`).
   */
  history?: 'push' | 'replace' | false
}

export interface Router {
  /** Tear down listeners and abort any in-flight navigation. */
  stop(): void
  /** Programmatically navigate (same logic as a link click). */
  navigate: (url: string, options?: NavigateOptions) => Promise<void>
  /** Warm a URL's page (and its island modules) into the cache. */
  prefetch: (url: string) => void
}

/** A cached page response. */
export interface PageSnapshot {
  html: string
  finalUrl: string
}

/** A snapshot-cache entry with its stale-while-revalidate window. */
export interface CacheEntry {
  snap: Promise<PageSnapshot | null>
  /** Past this (jittered), the next access serves the page AND refreshes it. */
  refreshAt: number
  /** Past this, the page is too old to serve — refetch fresh instead. */
  staleAt: number
  /** A background refresh is in flight (single-flight guard). */
  refreshing: boolean
}

/** The outlet content extracted from a navigation response. */
export interface OutletContent {
  nodes: Node[]
  title: string | null
  /** Same-origin `<script type="module" src>` URLs found in the response. */
  moduleSrcs: string[]
}

/** Internal mutable state for the active router instance. */
export interface RouterState {
  outletSelector: string
  rehydrate: (outlet: Element) => void | Promise<void>
  dispose: (outlet: Element) => void
  loadModule: (src: string) => Promise<unknown>
  /** Absolute URLs of module scripts already loaded (deduped across navs). */
  loadedModules: Set<string>
  prefetchEnabled: boolean
  prefetchDelay: number
  /** ms a cached page is served without refetch (fresh window). */
  cacheFreshMs: number
  /** ms after which a cached page is too old to serve (refetch fresh). */
  cacheStaleMs: number
  /** Max cached pages (least-recently-used evicted). */
  cacheCap: number
  /** Recently fetched / prefetched pages, keyed by absolute URL. */
  cache: Map<string, CacheEntry>
  /** Module srcs already `modulepreload`-ed on hover. */
  preloaded: Set<string>
  shouldIntercept: (anchor: HTMLAnchorElement, event: MouseEvent) => boolean
  scrollToTop: boolean
  /** Pathname of the currently-displayed outlet (query-only vs structural nav). */
  currentPath: string
  inflight: AbortController | null
  stop: () => void
}
