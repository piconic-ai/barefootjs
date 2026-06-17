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
