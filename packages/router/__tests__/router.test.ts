/**
 * @barefootjs/router — partial-navigation router contract (v0).
 *
 * Swaps only the `[bf-region]` subtree, preserves the shell, disposes/re-
 * hydrates islands, with SWR caching, prefetch, last-wins, focus/a11y on swap,
 * and history.state preservation. DOM via @happy-dom.
 */

import { describe, test, expect, beforeAll, beforeEach, afterEach } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

beforeAll(() => {
  if (typeof window === 'undefined') {
    GlobalRegistrator.register({ url: 'https://example.test/blog/1' })
  }
  // happy-dom doesn't implement scrollTo; the router calls it after a swap.
  if (typeof window.scrollTo !== 'function') {
    ;(window as unknown as { scrollTo: () => void }).scrollTo = () => {}
  }
})

const { startRouter, navigate } = await import('../src/index.ts')

type FetchCall = { url: string; headers?: Record<string, string> }

let router: { stop(): void; navigate: (u: string, o?: { history?: 'push' | 'replace' | false }) => Promise<void>; prefetch: (u: string) => void } | null = null
let fetchCalls: FetchCall[] = []
let pushed: Array<{ state: unknown; url: string }> = []
let originalPushState: typeof window.history.pushState

const flush = (ms = 10) => new Promise((r) => setTimeout(r, ms))

function fullPage(body: string, opts: { title?: string; modules?: string[] } = {}): string {
  const scripts = (opts.modules ?? []).map((s) => `<script type="module" src="${s}"></script>`).join('')
  return `<!doctype html><html><head><title>${opts.title ?? 'Page'}</title></head>
    <body><header id="hdr">shell</header><main bf-region>${body}</main>${scripts}</body></html>`
}

function setURL(url: string): void {
  const happy = (globalThis as unknown as { happyDOM?: { setURL?: (u: string) => void } }).happyDOM
  if (happy?.setURL) happy.setURL(url)
  else window.history.replaceState(window.history.state, '', url)
}

function mockFetch(htmlFor: (url: string) => string | null, finalUrlFor?: (u: string) => string): void {
  ;(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    fetchCalls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> })
    const html = htmlFor(url)
    if (html === null) return { ok: false, status: 404, redirected: false, url, text: async () => '' } as unknown as Response
    const finalUrl = finalUrlFor?.(url) ?? url
    return {
      ok: true,
      status: 200,
      redirected: finalUrl !== url,
      url: finalUrl,
      text: async () => html,
    } as unknown as Response
  }) as typeof fetch
}

function clickLink(id: string, init: MouseEventInit = {}): void {
  const a = document.getElementById(id) as HTMLAnchorElement
  const ev = new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init })
  a.dispatchEvent(ev)
}

function region(): Element {
  return document.querySelector('[bf-region]') as Element
}

beforeEach(() => {
  fetchCalls = []
  pushed = []
  setURL('https://example.test/blog/1')
  document.title = 'page 1'
  document.body.innerHTML = `<header id="hdr">shell</header>
    <main bf-region><p>page 1 body</p><a id="next" href="/blog/2">next</a></main>`
  // Capture history writes without losing real behaviour. Save the (real,
  // unwrapped) pushState — `afterEach` restores it, so each test starts from a
  // single wrapper rather than stacking one per test.
  originalPushState = window.history.pushState
  window.history.pushState = ((state: unknown, _t: string, url: string) => {
    pushed.push({ state, url: String(url) })
    originalPushState.call(window.history, state, _t, url)
  }) as typeof window.history.pushState
  mockFetch((url) => (url.includes('/blog/2') ? fullPage('<p>page 2 body</p>', { title: 'page 2' }) : null))
  // A no-op dispose seam so the default-dispose dynamic import isn't exercised.
  ;(window as unknown as { __bf_dispose_within?: (r: Element) => void }).__bf_dispose_within = () => {}
})

afterEach(() => {
  router?.stop()
  router = null
  // Restore the unwrapped pushState so wrappers don't stack across tests.
  window.history.pushState = originalPushState
  const w = window as unknown as Record<string, unknown>
  delete w.__bf_dispose_within
  delete w.__bf_hydrate_within
  delete w.__bf_pushSearch
})

describe('@barefootjs/router v0', () => {
  test('link click swaps only the region, preserves the shell, updates history + title', async () => {
    const hdr = document.getElementById('hdr')!
    ;(hdr as unknown as { __kept: boolean }).__kept = true
    let rehydrated = 0
    router = startRouter({ rehydrate: () => { rehydrated++ }, dispose: () => {} })

    clickLink('next')
    await flush()

    expect(region().textContent).toContain('page 2 body')
    expect(region().textContent).not.toContain('page 1 body')
    // Same shell node survived (not re-rendered).
    expect((document.getElementById('hdr') as unknown as { __kept?: boolean }).__kept).toBe(true)
    expect(document.title).toBe('page 2')
    expect(pushed.filter((p) => p.url.includes('/blog/2')).length).toBe(1)
    expect(rehydrated).toBe(1)
    expect(fetchCalls.length).toBe(1)
  })

  test('rapid navigation: the latest target wins even if an earlier response resolves last', async () => {
    mockFetch((url) => {
      if (url.includes('/fast')) return fullPage('<p>FAST</p>', { title: 'fast' })
      if (url.includes('/slow')) return fullPage('<p>SLOW</p>', { title: 'slow' })
      return null
    })
    // Make /slow resolve after /fast.
    const baseFetch = globalThis.fetch
    ;(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/slow')) await flush(30)
      return baseFetch(input, init)
    }) as typeof fetch

    router = startRouter({ rehydrate: () => {}, dispose: () => {} })
    void navigate('/slow')
    void navigate('/fast')
    await flush(60)

    expect(region().textContent).toContain('FAST')
    expect(region().textContent).not.toContain('SLOW')
    const last = pushed[pushed.length - 1]
    expect(last?.url).toContain('/fast')
  })

  test('does not intercept external links or modified clicks', async () => {
    document.body.innerHTML += `<a id="ext" href="https://other.test/x">ext</a>`
    router = startRouter({ rehydrate: () => {}, dispose: () => {} })

    clickLink('ext')
    clickLink('next', { metaKey: true })
    await flush()

    expect(fetchCalls.length).toBe(0)
  })

  test('module-aware swap: a navigated-to island loads its module then hydrates (deduped)', async () => {
    const imported: string[] = []
    const hydrated: string[] = []
    mockFetch((url) =>
      url.includes('/app')
        ? fullPage('<div bf-s="x" data-island="Counter">island</div>', {
            title: 'app',
            modules: ['/static/counter.js'],
          })
        : null,
    )
    ;(window as unknown as { __bf_hydrate_within: (r: Element) => void }).__bf_hydrate_within = (r) => {
      const el = r.querySelector('[data-island]')
      if (el && imported.includes('https://example.test/static/counter.js')) {
        hydrated.push(el.getAttribute('data-island')!)
        el.textContent = 'hydrated'
      }
    }
    router = startRouter({
      dispose: () => {},
      loadModule: async (src) => { imported.push(src) },
    })

    await navigate('/app')
    await flush()
    expect(imported).toEqual(['https://example.test/static/counter.js'])
    expect(hydrated).toEqual(['Counter'])
    expect(region().textContent).toContain('hydrated')

    // Second nav to the same module doesn't re-import.
    await navigate('/app?again=1')
    await flush()
    expect(imported.length).toBe(1)
  })

  test('an overlapping navigation does not skip a module whose earlier import is still in-flight', async () => {
    // The module is only marked "loaded" after a successful import, so an
    // overlapping navigation can't mistake an in-flight (or failed) import for a
    // completed one and hydrate without it.
    const attempts: string[] = []
    mockFetch(() => fullPage('<div bf-s="x" data-island="C">x</div>', { modules: ['/static/c.js'] }))
    router = startRouter({
      rehydrate: () => {},
      dispose: () => {},
      loadModule: async () => {
        attempts.push('c')
        if (attempts.length === 1) await flush(30) // first import stays in-flight
      },
    })
    void navigate('/a') // A: begins importing c.js (in-flight)
    await flush(5)
    void navigate('/a?b=1') // B: overlaps — must not skip c.js as already loaded
    await flush(60)
    expect(attempts.length).toBe(2)
  })

  test('navigate() is a no-op outside the DOM (does not throw on the server)', async () => {
    const savedWindow = (globalThis as unknown as { window?: unknown }).window
    delete (globalThis as unknown as { window?: unknown }).window
    try {
      await navigate('/somewhere') // would otherwise hit hardNavigate → window.* → throw
    } finally {
      ;(globalThis as unknown as { window?: unknown }).window = savedWindow
    }
  })

  test('hover prefetches the page so the click reuses it (no second fetch)', async () => {
    router = startRouter({ rehydrate: () => {}, dispose: () => {}, prefetchDelay: 5 })
    const a = document.getElementById('next')!
    a.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }))
    await flush(25)
    expect(fetchCalls.length).toBe(1)
    clickLink('next')
    await flush()
    expect(fetchCalls.length).toBe(1)
    expect(region().textContent).toContain('page 2 body')
  })

  test('hover dwell survives a mouseout between descendants of the same link', async () => {
    const a = document.getElementById('next')!
    a.innerHTML = '<span id="inner">next</span>'
    router = startRouter({ rehydrate: () => {}, dispose: () => {}, prefetchDelay: 15 })
    a.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }))
    // Pointer moves to a child still inside the same <a> → relatedTarget within.
    document
      .getElementById('inner')!
      .dispatchEvent(new window.MouseEvent('mouseout', { bubbles: true, relatedTarget: a }))
    await flush(35)
    expect(fetchCalls.length).toBe(1) // dwell wasn't cancelled
  })

  test('hover dwell cancels once the pointer leaves the link', async () => {
    router = startRouter({ rehydrate: () => {}, dispose: () => {}, prefetchDelay: 15 })
    const a = document.getElementById('next')!
    a.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }))
    // Pointer leaves the anchor entirely (relatedTarget outside it).
    a.dispatchEvent(new window.MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }))
    await flush(35)
    expect(fetchCalls.length).toBe(0) // cancelled
  })

  test('prefetch: false disables hover prefetching', async () => {
    router = startRouter({ rehydrate: () => {}, dispose: () => {}, prefetch: false })
    document.getElementById('next')!.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }))
    await flush(25)
    expect(fetchCalls.length).toBe(0)
  })

  test('a stale cache entry is refetched fresh, never served stale', async () => {
    router = startRouter({ rehydrate: () => {}, dispose: () => {}, cacheStaleMs: 0 })
    await navigate('/blog/2')
    await flush()
    expect(fetchCalls.length).toBe(1)
    await navigate('/blog/2')
    await flush()
    expect(fetchCalls.length).toBe(2)
  })

  test('query-only navigation updates searchParams without swapping (when in use)', async () => {
    const searches: string[] = []
    ;(window as unknown as { __bf_pushSearch: (s: string) => void }).__bf_pushSearch = (s) => searches.push(s)
    let rehydrated = 0
    setURL('https://example.test/list')
    router = startRouter({ rehydrate: () => { rehydrated++ }, dispose: () => {} })

    await navigate('/list?sort=price')
    await flush()

    expect(fetchCalls.length).toBe(0)
    expect(rehydrated).toBe(0)
    expect(searches).toContain('?sort=price')
    expect(pushed.some((p) => p.url.includes('sort=price'))).toBe(true)
  })

  test('query-only navigation swaps when searchParams is not in use (legacy)', async () => {
    let rehydrated = 0
    setURL('https://example.test/blog/2')
    mockFetch((url) => (url.includes('/blog/2') ? fullPage('<p>q body</p>', { title: 'q' }) : null))
    router = startRouter({ rehydrate: () => { rehydrated++ }, dispose: () => {} })

    await navigate('/blog/2?x=1')
    await flush()

    expect(fetchCalls.length).toBe(1)
    expect(rehydrated).toBe(1)
  })

  test('popstate to a different route swaps the region', async () => {
    router = startRouter({ rehydrate: () => {}, dispose: () => {} })
    setURL('https://example.test/blog/2')
    window.dispatchEvent(new window.PopStateEvent('popstate'))
    await flush()
    expect(fetchCalls.length).toBe(1)
    expect(region().textContent).toContain('page 2 body')
  })

  test('requests ordinary HTML without a router-specific navigation protocol', async () => {
    router = startRouter({ rehydrate: () => {}, dispose: () => {} })
    await navigate('/blog/2')
    await flush()
    expect(fetchCalls.length).toBe(1)
    expect(fetchCalls[0].url).toBe('https://example.test/blog/2')
    expect(fetchCalls[0].headers).toEqual({ Accept: 'text/html' })
  })

  test('the fetch option is used instead of the global fetch', async () => {
    const calls: string[] = []
    const injected = (async (input: RequestInfo | URL) => {
      calls.push(String(input))
      return {
        ok: true,
        status: 200,
        redirected: false,
        url: String(input),
        text: async () => fullPage('<p>injected body</p>', { title: 'I' }),
      } as unknown as Response
    }) as typeof fetch
    // Make the global throw to prove the injected fetch is what's used.
    ;(globalThis as unknown as { fetch: typeof fetch }).fetch = (() => {
      throw new Error('global fetch must not be called when one is injected')
    }) as typeof fetch
    router = startRouter({ rehydrate: () => {}, dispose: () => {}, fetch: injected })
    await navigate('/blog/2')
    await flush()
    expect(calls).toEqual(['https://example.test/blog/2'])
    expect(region().textContent).toContain('injected body')
  })

  test('a redirected response commits at the final URL', async () => {
    mockFetch(
      (url) => (url.includes('/old') || url.includes('/new') ? fullPage('<p>moved</p>', { title: 'new' }) : null),
      () => 'https://example.test/new',
    )
    router = startRouter({ rehydrate: () => {}, dispose: () => {} })
    await navigate('/old')
    await flush()
    expect(pushed[pushed.length - 1]?.url).toBe('https://example.test/new')
  })

  test('a relative module src resolves against the response URL, not the current location', async () => {
    const imported: string[] = []
    // Served (after redirect) from /sub/page, carrying a *relative* module src.
    mockFetch(
      () => fullPage('<div bf-s="x" data-island="I">x</div>', { modules: ['./island.js'] }),
      () => 'https://example.test/sub/page',
    )
    router = startRouter({
      rehydrate: () => {},
      dispose: () => {},
      loadModule: async (s) => { imported.push(s) },
    })
    // Current location is /blog/1; without response-URL resolution this would
    // resolve against /blog/ instead of /sub/.
    await navigate('/sub/page')
    await flush()
    expect(imported).toEqual(['https://example.test/sub/island.js'])
  })

  // --- v0 additions over the #1910 reference -----------------------------

  test('focus moves into the swapped region and the route is announced', async () => {
    router = startRouter({ rehydrate: () => {}, dispose: () => {} })
    mockFetch((url) =>
      url.includes('/blog/2') ? fullPage('<h1>Article 2</h1><p>page 2 body</p>', { title: 'page 2' }) : null,
    )
    clickLink('next')
    await flush()

    // Focus landed on the region's first heading.
    expect(document.activeElement?.tagName).toBe('H1')
    // The route announcer carries the new title.
    const announcer = document.getElementById('bf-route-announcer')
    expect(announcer?.getAttribute('aria-live')).toBe('polite')
    expect(announcer?.textContent).toBe('page 2')
  })

  test('manageFocus: false leaves focus and skips the announcer', async () => {
    router = startRouter({ rehydrate: () => {}, dispose: () => {}, manageFocus: false })
    clickLink('next')
    await flush()
    expect(document.getElementById('bf-route-announcer')).toBeNull()
  })

  test('history.state preservation: a router replace keeps existing state keys', async () => {
    // Something else stored scroll state on the entry before the router starts.
    window.history.replaceState({ scrollTop: 42 }, '', window.location.href)
    router = startRouter({ rehydrate: () => {}, dispose: () => {} })
    // The entry-anchor replace must not have clobbered the foreign key.
    const state = window.history.state as { scrollTop?: number; bfRouter?: boolean }
    expect(state.scrollTop).toBe(42)
    expect(state.bfRouter).toBe(true)
  })

  test('a page without a region hard-navigates instead of throwing', async () => {
    let assigned = ''
    const origAssign = window.location.assign
    ;(window.location as unknown as { assign: (u: string) => void }).assign = (u: string) => { assigned = u }
    mockFetch(() => '<!doctype html><html><body><div>no region here</div></body></html>')
    router = startRouter({ rehydrate: () => {}, dispose: () => {} })
    await navigate('/no-region')
    await flush()
    expect(assigned).toContain('/no-region')
    ;(window.location as unknown as { assign: typeof origAssign }).assign = origAssign
  })
})

// --- `<head>`: metadata reconciled, resources not (#2438) ------------------
//
// Two tiers, and the split is the point. Page metadata is page-scoped by
// definition, so it is reconciled on every swap with no opt-in — a stale
// `<meta name="description">` is wrongness you cannot see in development.
// Head *resources* have no derivable lifetime, so they stay untouched, and a
// route-scoped stylesheet belongs inside the region instead.
describe('@barefootjs/router — head metadata reconciliation', () => {
  function pageWithHead(head: string, body: string, title = 'Page'): string {
    return `<!doctype html><html><head><title>${title}</title>${head}</head>
      <body><header id="hdr">shell</header><main bf-region>${body}</main></body></html>`
  }

  afterEach(() => {
    for (const el of Array.from(document.head.querySelectorAll('link, meta'))) el.remove()
  })

  test('allowlisted metadata is replaced, added, and removed', async () => {
    document.head.insertAdjacentHTML(
      'beforeend',
      '<meta name="description" content="page 1">' +
        '<meta property="og:title" content="Page 1">' +
        '<meta name="robots" content="noindex">' + // absent downstream → removed
        '<link rel="canonical" href="https://example.test/blog/1">',
    )
    mockFetch((url) =>
      url.includes('/blog/2')
        ? pageWithHead(
            '<meta name="description" content="page 2">' +
              '<meta property="og:title" content="Page 2">' +
              '<meta name="twitter:card" content="summary">' + // new → added
              '<link rel="canonical" href="https://example.test/blog/2">',
            '<p>page 2 body</p>',
            'page 2',
          )
        : null,
    )
    router = startRouter({ rehydrate: () => {}, dispose: () => {} })
    clickLink('next')
    await flush()

    const meta = (sel: string) => document.head.querySelector(sel)?.getAttribute('content') ?? null
    expect(meta('meta[name="description"]')).toBe('page 2')
    expect(meta('meta[property="og:title"]')).toBe('Page 2')
    expect(meta('meta[name="twitter:card"]')).toBe('summary')
    // Present before, absent in the incoming page → gone, so it can't leak
    // forward into every later route.
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull()
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://example.test/blog/2')
    // Exactly one of each — replaced in place, not appended alongside.
    expect(document.head.querySelectorAll('meta[name="description"]').length).toBe(1)
    expect(document.head.querySelectorAll('link[rel="canonical"]').length).toBe(1)
    expect(document.title).toBe('page 2')
  })

  test('nodes outside the allowlist are never read, replaced, or removed', async () => {
    // A runtime-injected analytics tag and a CSP meta: absent from every
    // server render, and swept away by a "remove everything untracked" merge.
    document.head.insertAdjacentHTML(
      'beforeend',
      '<meta id="rum" name="x-analytics-session" content="abc123">' +
        '<meta id="csp" http-equiv="content-security-policy" content="default-src \'self\'">' +
        '<link id="preconnect" rel="preconnect" href="https://cdn.example.test">' +
        '<link id="alt-sheet" rel="alternate stylesheet" href="/high-contrast.css">',
    )
    mockFetch((url) => (url.includes('/blog/2') ? pageWithHead('<meta name="description" content="page 2">', '<p>page 2 body</p>', 'page 2') : null))
    router = startRouter({ rehydrate: () => {}, dispose: () => {} })
    clickLink('next')
    await flush()

    expect(document.getElementById('rum')?.getAttribute('content')).toBe('abc123')
    expect(document.getElementById('csp')).not.toBeNull()
    expect(document.getElementById('preconnect')).not.toBeNull()
    // Multi-token `rel` is a resource, so it falls outside the allowlist even
    // though the `alternate` token appears in it.
    expect(document.getElementById('alt-sheet')).not.toBeNull()
  })

  test('`data-bf-head="false"` opts a node out in both directions', async () => {
    document.head.insertAdjacentHTML('beforeend', '<meta id="mine" name="description" content="owned by the page" data-bf-head="false">')
    mockFetch((url) => (url.includes('/blog/2') ? pageWithHead('<meta name="description" content="page 2">', '<p>page 2 body</p>', 'page 2') : null))
    router = startRouter({ rehydrate: () => {}, dispose: () => {} })
    clickLink('next')
    await flush()

    // The opted-out node keeps its value…
    expect(document.getElementById('mine')?.getAttribute('content')).toBe('owned by the page')
    // …and is not treated as the slot the incoming description replaces, so
    // the incoming one is appended rather than dropped.
    expect(document.head.querySelector('meta[name="description"]:not([data-bf-head])')?.getAttribute('content')).toBe('page 2')
  })

  test('key attributes are case- and whitespace-insensitive, so a slot is replaced in place', async () => {
    // The same logical slot, spelled differently on each side (`hreflang` is a
    // BCP 47 tag and `type` a MIME type — both case-insensitive). Keyed
    // verbatim the two miss each other, and the slot is rebuilt (old removed,
    // new appended at the end of `<head>`) instead of replaced where it stands.
    document.head.insertAdjacentHTML(
      'beforeend',
      '<link rel="Alternate" hreflang=" en-US " type="TEXT/HTML" href="/en/blog/1">' +
        '<meta name="keywords" content="barefoot">',
    )
    mockFetch((url) =>
      url.includes('/blog/2')
        ? pageWithHead(
            '<link rel="alternate" hreflang="en-us" type="text/html" href="/en/blog/2">' +
              '<meta name="keywords" content="barefoot">',
            '<p>page 2 body</p>',
            'page 2',
          )
        : null,
    )
    router = startRouter({ rehydrate: () => {}, dispose: () => {} })
    clickLink('next')
    await flush()

    // One slot, carrying the incoming value — true either way, since a missed
    // key still removes the stale node rather than leaving a duplicate.
    const alternates = Array.from(document.head.querySelectorAll('link')).filter(
      (el) => (el.getAttribute('rel') ?? '').trim().toLowerCase() === 'alternate',
    )
    expect(alternates.length).toBe(1)
    expect(alternates[0].getAttribute('href')).toBe('/en/blog/2')
    // The part that needs the normalization: it kept its position. A missed key
    // appends, which would put it after the `keywords` meta it preceded.
    const order = Array.from(document.head.children)
    expect(order.indexOf(alternates[0])).toBeLessThan(
      order.indexOf(document.head.querySelector('meta[name="keywords"]') as Element),
    )
  })

  test('metadata identical across routes is left alone (no DOM churn)', async () => {
    document.head.insertAdjacentHTML('beforeend', '<meta property="og:site_name" content="Example">')
    // Mark the live node so survival is checked by identity, not by value.
    const before = document.head.querySelector('meta[property="og:site_name"]') as unknown as { __kept: boolean }
    before.__kept = true
    mockFetch((url) =>
      url.includes('/blog/2') ? pageWithHead('<meta property="og:site_name" content="Example">', '<p>page 2 body</p>', 'page 2') : null,
    )
    router = startRouter({ rehydrate: () => {}, dispose: () => {} })
    clickLink('next')
    await flush()

    // Same live node, not a replacement carrying the same value.
    const after = document.head.querySelector('meta[property="og:site_name"]') as unknown as { __kept?: boolean }
    expect(after.__kept).toBe(true)
  })
})

describe('@barefootjs/router — head resources are not managed', () => {
  function pageWithHead(head: string, body: string, title = 'Page'): string {
    return `<!doctype html><html><head><title>${title}</title>${head}</head>
      <body><header id="hdr">shell</header><main bf-region>${body}</main></body></html>`
  }

  afterEach(() => {
    for (const el of Array.from(document.head.querySelectorAll('link, meta'))) el.remove()
  })

  test('a `<link rel="stylesheet">` in `<head>` is neither added nor removed', async () => {
    // The live page carries a route-scoped sheet in `<head>` — the mistake the
    // issue reports. The incoming page's head lists a different one.
    document.head.insertAdjacentHTML('beforeend', '<link id="old-css" rel="stylesheet" href="/page-1.css">')
    mockFetch((url) =>
      url.includes('/blog/2') ? pageWithHead('<link id="new-css" rel="stylesheet" href="/page-2.css">', '<p>page 2 body</p>', 'page 2') : null,
    )
    router = startRouter({ rehydrate: () => {}, dispose: () => {} })
    clickLink('next')
    await flush()

    expect(region().textContent).toContain('page 2 body')
    // Untouched in both directions: the outgoing sheet still applies and the
    // incoming one never arrives. Hence the in-region placement below.
    expect(document.getElementById('old-css')).not.toBeNull()
    expect(document.getElementById('new-css')).toBeNull()
  })

  test('a route-scoped `<link>` inside the region enters and leaves with the swap', async () => {
    mockFetch((url) => {
      if (url.includes('/editor')) return pageWithHead('', '<link rel="stylesheet" href="/editor.css"><div class="head">editor</div>', 'editor')
      if (url.includes('/blog/2')) return pageWithHead('', '<p>page 2 body</p>', 'page 2')
      return null
    })
    router = startRouter({ rehydrate: () => {}, dispose: () => {} })

    // Navigating *in*: the sheet arrives with the region content.
    await navigate('/editor')
    await flush()
    expect(region().querySelector('link[href="/editor.css"]')).not.toBeNull()
    // …and stays out of the head, so nothing accumulates there.
    expect(document.head.querySelector('link[href="/editor.css"]')).toBeNull()

    // Navigating *out*: the sheet is torn down with the region, so its rules
    // stop applying to every subsequent route.
    await navigate('/blog/2')
    await flush()
    expect(region().querySelector('link[href="/editor.css"]')).toBeNull()
    expect(document.querySelector('link[href="/editor.css"]')).toBeNull()
  })
})
