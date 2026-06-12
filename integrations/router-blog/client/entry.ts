/**
 * Client entry for the router-blog reference app (stress edition).
 *
 * Three pieces:
 *   1. Shell islands (OUTSIDE the outlet): a ticking uptime clock, a
 *      partial-navigation counter, a live-island gauge, and a theme
 *      toggle — all must survive every navigation.
 *   2. An outlet hydrate/dispose contract that stands in for the
 *      BarefootJS client runtime: `window.__bf_hydrate` (the seam the
 *      router calls by default) inits any un-hydrated `[data-island]`
 *      inside the outlet and registers a teardown; the router's
 *      `dispose` hook tears down the outgoing ones. This mirrors the
 *      planned per-scope `createRoot`/dispose registry in
 *      `@barefootjs/client`.
 *   3. `startRouter({ dispose })`.
 *
 * A small `window.__bf` bag exposes counters so the stress harness can
 * measure re-hydration, disposal, and leaks from the page.
 */
import { startRouter, navigate } from '@barefootjs/router'

interface Bf {
  live: number // currently-hydrated outlet islands
  hydrated: number // cumulative islands hydrated
  disposed: number // cumulative islands disposed
  ticks: Record<string, number> // per-island timer fire counts (leak gauge)
  disposeEnabled: boolean
  registry: Map<Element, () => void>
}

declare global {
  interface Window {
    __bf: Bf
    __bf_hydrate?: () => void
    // Exposed only so the stress harness can drive deterministic
    // rapid-fire navigations from the page.
    __bfNavigate?: (url: string) => Promise<void>
  }
}

const bf: Bf = {
  live: 0,
  hydrated: 0,
  disposed: 0,
  ticks: {},
  disposeEnabled: true,
  registry: new Map(),
}
window.__bf = bf

const liveEl = () => document.getElementById('shell-live')
function paintLive(): void {
  const el = liveEl()
  if (el) el.textContent = String(bf.live)
}

/** Init one outlet island, returning its teardown. */
function initIsland(el: HTMLElement): () => void {
  const id = el.dataset.id ?? ''
  bf.ticks[id] ??= 0

  if (el.dataset.island === 'like') {
    let n = 0
    const v = el.querySelector('.v')!
    const onClick = () => {
      n += 1
      v.textContent = String(n)
    }
    el.addEventListener('click', onClick)
    return () => el.removeEventListener('click', onClick)
  }

  // 'timer': ticks every 100ms. If not torn down it keeps firing forever
  // (and keeps incrementing bf.ticks[id]) — the leak gauge.
  const start = Date.now()
  const v = el.querySelector('.v')!
  const handle = setInterval(() => {
    bf.ticks[id] += 1
    v.textContent = ((Date.now() - start) / 1000).toFixed(1)
  }, 100)
  return () => clearInterval(handle)
}

/** Hydrate any un-hydrated islands in the outlet. The router's default
 *  rehydrate seam (`window.__bf_hydrate`) calls this after a swap. */
function hydrateOutlet(): void {
  const outlet = document.querySelector('[bf-outlet]')
  if (!outlet) return
  for (const el of outlet.querySelectorAll<HTMLElement>('[data-island]')) {
    if (bf.registry.has(el)) continue
    bf.registry.set(el, initIsland(el))
    bf.live += 1
    bf.hydrated += 1
  }
  paintLive()
}

/** Tear down islands inside the outgoing outlet before it is swapped. */
function disposeOutlet(outlet: Element): void {
  if (!bf.disposeEnabled) return
  for (const [el, teardown] of bf.registry) {
    if (outlet.contains(el)) {
      teardown()
      bf.registry.delete(el)
      bf.live -= 1
      bf.disposed += 1
    }
  }
  paintLive()
}

function bootShell(): void {
  const uptimeEl = document.getElementById('shell-uptime')
  const navEl = document.getElementById('shell-navs')
  const outlet = document.querySelector('[bf-outlet]')

  const start = Date.now()
  setInterval(() => {
    if (uptimeEl) uptimeEl.textContent = `${((Date.now() - start) / 1000).toFixed(1)}s`
  }, 100)

  let navs = 0
  if (outlet) {
    new MutationObserver(() => {
      navs += 1
      if (navEl) navEl.textContent = String(navs)
      // Did this click reuse a prefetched page? It's a cache hit when no
      // navigation fetch fired for the clicked URL (the swap runs before
      // pushState, so we can't read location here — track the click instead).
      const lastNav = document.getElementById('shell-lastnav')
      if (lastNav && pendingNav) {
        lastNav.textContent = pendingNav.fetched ? 'network' : '⚡ cache'
        pendingNav = null
      }
    }).observe(outlet, { childList: true })
  }

  const toggle = document.getElementById('theme-toggle')
  toggle?.addEventListener('click', () => {
    const root = document.documentElement
    const light = root.dataset.theme === 'light'
    root.dataset.theme = light ? 'dark' : 'light'
    toggle.textContent = light ? '🌙 dark' : '☀️ light'
  })
}

// ── prefetch visualization (demo instrumentation, not part of the router) ──
//
// Wrap fetch to spot the router's hover-prefetch fetches (a fetch that isn't
// the navigation the user just clicked). Mark prefetched links with a badge
// and surface a live count, so the prefetch — normally invisible — is
// observable in screenshots.
const prefetched = new Set<string>()
let pendingNav: { href: string; fetched: boolean } | null = null
document.addEventListener(
  'click',
  (e) => {
    const a = (e.target as Element)?.closest?.('a') as HTMLAnchorElement | null
    if (a) pendingNav = { href: new URL(a.href, location.href).href, fetched: false }
  },
  true,
)
const origFetch = window.fetch.bind(window)
window.fetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  try {
    const raw = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input)
    const abs = new URL(raw, location.href).href
    if (pendingNav && pendingNav.href === abs) {
      // The clicked navigation had to hit the network → not a cache hit.
      pendingNav.fetched = true
    } else if (!prefetched.has(abs)) {
      // A fetch with no matching click is a hover prefetch.
      prefetched.add(abs)
      markPrefetchedLinks(abs)
      const counter = document.getElementById('shell-prefetched')
      if (counter) counter.textContent = String(prefetched.size)
    }
  } catch {
    /* ignore */
  }
  return origFetch(input, init)
}) as typeof fetch

function markPrefetchedLinks(abs: string): void {
  for (const a of document.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    try {
      if (new URL(a.href, location.href).href === abs) a.dataset.prefetched = '1'
    } catch {
      /* ignore */
    }
  }
}

window.__bf_hydrate = hydrateOutlet

bootShell()
hydrateOutlet() // hydrate the first-load outlet
startRouter({ dispose: disposeOutlet })
window.__bfNavigate = navigate
