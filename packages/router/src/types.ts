/**
 * Public + internal types for the BarefootJS partial-navigation router.
 *
 * A **region** (`[bf-region]`, spec/router.md) is the page-lifecycle boundary
 * the router swaps: everything outside it persists across a navigation;
 * everything inside is disposed, re-loaded, and re-hydrated. v0 swaps a single
 * authored region (the broadest match); compiler-derived nested regions are v2.
 */

export interface RouterOptions {
  /**
   * Selector for the swappable region. Defaults to `[bf-region]`. The first
   * match in the document is the v0 swap point ("single authored region");
   * if a page has none, the router hard-navigates (never worse than an MPA).
   */
  region?: string
  /**
   * Re-hydrate the freshly swapped region. Defaults to {@link defaultRehydrate},
   * which prefers the `@barefootjs/client` runtime's subtree-scoped walk and
   * degrades through the shared fallback chain. Never silently no-ops on a page
   * that has islands.
   */
  rehydrate?: (region: Element) => void | Promise<void>
  /**
   * Dispose the outgoing region's islands before it is removed. Defaults to
   * {@link defaultDispose}. Pass `() => {}` to opt out (e.g. a fully static
   * shell with no client runtime).
   */
  dispose?: (region: Element) => void | Promise<void>
  /** Import an island module by src. Defaults to `(src) => import(src)`. */
  loadModule?: (src: string) => Promise<unknown>
  /**
   * Fetch a page's HTML. Defaults to the global `fetch`. Inject to add auth
   * headers / a custom transport, or to drive the router under test without
   * monkeypatching the global.
   */
  fetch?: typeof fetch
  /** Decide whether to intercept an anchor click. Defaults to {@link defaultShouldIntercept}. */
  shouldIntercept?: (anchor: HTMLAnchorElement, event: Event) => boolean
  /** Scroll to the top of the document after a swap. Default `true`. */
  scrollToTop?: boolean
  /** Move focus to the swapped region + announce the route change. Default `true`. */
  manageFocus?: boolean
  /** Enable hover/focus/pointerdown prefetch. Default `true`. */
  prefetch?: boolean
  /** Hover dwell before prefetch (ms). Default `65`. */
  prefetchDelay?: number
  /** How long a cached page stays fresh (no refetch), ms. Default `15000`. */
  cacheFreshMs?: number
  /** How long a cached page may be served (stale-while-revalidate), ms. Default `60000`. */
  cacheStaleMs?: number
  /** Max cached pages (LRU). Default `30`. */
  cacheCap?: number
}

export interface NavigateOptions {
  /**
   * How to commit history. `'push'` (default) adds an entry, `'replace'`
   * overwrites the current one, `false` writes nothing (used by `popstate`,
   * where the browser already moved history).
   */
  history?: 'push' | 'replace' | false
}

export interface Router {
  /** Tear down all listeners and abort any in-flight navigation. */
  stop(): void
  /** Navigate programmatically. SSR no-op. */
  navigate: (url: string, options?: NavigateOptions) => Promise<void>
  /** Warm the cache (and modulepreload islands) for a URL. */
  prefetch: (url: string) => void
}

/** A fetched page: its HTML plus the redirect-resolved final URL. */
export interface PageSnapshot {
  html: string
  finalUrl: string
}

export interface CacheEntry {
  snap: Promise<PageSnapshot | null>
  /** Past this (jittered) instant → serve cached AND refresh in the background. */
  refreshAt: number
  /** Past this instant → too old to serve, refetch synchronously. */
  staleAt: number
  /** Single-flight guard for the background refresh. */
  refreshing: boolean
}

/** The swappable content lifted out of a fetched page. */
export interface RegionContent {
  nodes: Node[]
  title: string | null
  moduleSrcs: string[]
}

/** Mutable state for the one active router instance. */
export interface RouterState {
  regionSelector: string
  rehydrate: (region: Element) => void | Promise<void>
  dispose: (region: Element) => void | Promise<void>
  loadModule: (src: string) => Promise<unknown>
  /** Fetch used for page loads (injectable; defaults to the global `fetch`). */
  fetchFn: typeof fetch
  /** Absolute URLs of island modules already loaded (deduped across navigations). */
  loadedModules: Set<string>
  prefetchEnabled: boolean
  prefetchDelay: number
  cacheFreshMs: number
  cacheStaleMs: number
  cacheCap: number
  cache: Map<string, CacheEntry>
  /** Module srcs already `<link rel=modulepreload>`-ed. */
  preloaded: Set<string>
  shouldIntercept: (anchor: HTMLAnchorElement, event: Event) => boolean
  scrollToTop: boolean
  manageFocus: boolean
  /** Pathname of the currently-displayed region (for the query-only short-circuit). */
  currentPath: string
  inflight: AbortController | null
  /** Hover-prefetch dwell timer + the anchor it is counting down for (per instance). */
  hoverTimer: ReturnType<typeof setTimeout> | null
  hoverAnchor: HTMLAnchorElement | null
  stop: () => void
}
