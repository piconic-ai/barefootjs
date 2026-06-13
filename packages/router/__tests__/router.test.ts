/**
 * Partial-navigation router: a same-origin link click must swap **only**
 * the `[bf-outlet]` region, leave the shell mounted, update history +
 * title, and trigger re-hydration. Covers the full-page response shape
 * and the non-intercept cases.
 */
import { describe, test, expect, beforeAll, beforeEach, afterEach, mock, spyOn } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { startRouter } from '../src/index.ts'

beforeAll(() => {
  if (typeof window === 'undefined') {
    GlobalRegistrator.register({ url: 'https://example.test/blog/1' })
  }
})

const flush = () => new Promise((r) => setTimeout(r, 10))

function fullPage2(): string {
  return `<!doctype html><html><head><title>Blog — Page 2</title></head>
    <body>
      <header id="hdr">SHELL</header>
      <main bf-outlet><article id="content">page 2 body</article></main>
    </body></html>`
}

let stop: (() => void) | undefined
let fetchCalls: Array<{ url: string; headers: Record<string, string> }>

function mockFetch(body: () => string): void {
  ;(globalThis as { fetch: unknown }).fetch = mock(async (url: unknown, init: { headers?: Record<string, string> } = {}) => {
    fetchCalls.push({ url: String(url), headers: init.headers ?? {} })
    return {
      ok: true,
      redirected: false,
      url: String(url),
      text: async () => body(),
    } as unknown as Response
  })
}

beforeEach(() => {
  document.body.innerHTML = `
    <header id="hdr">SHELL</header>
    <main bf-outlet>
      <article id="content">page 1 body</article>
      <a id="next" href="/blog/2">Next</a>
    </main>`
  document.title = 'Blog — Page 1'
  fetchCalls = []
  mockFetch(fullPage2)
})

afterEach(() => {
  stop?.()
  stop = undefined
  // Some tests install the searchParams seam — don't leak it across tests.
  delete (window as unknown as { __bf_set_search?: unknown }).__bf_set_search
})

function setURL(href: string): void {
  ;(window as unknown as { happyDOM?: { setURL?: (u: string) => void } }).happyDOM?.setURL?.(href)
}

function clickLink(id: string, init: MouseEventInit = {}): void {
  document
    .getElementById(id)!
    .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init }))
}

test('link click swaps only the outlet, preserves the shell, updates history + title', async () => {
  const rehydrate = mock(() => {})
  const pushSpy = spyOn(window.history, 'pushState')

  const router = startRouter({ rehydrate })
  stop = router.stop

  // Tag the shell element to prove its identity survives the swap.
  ;(document.getElementById('hdr') as unknown as { __kept: string }).__kept = 'yes'

  clickLink('next')
  await flush()

  // Outlet content replaced …
  expect(document.querySelector('[bf-outlet]')!.textContent).toContain('page 2 body')
  // … the old page body is gone …
  expect(document.body.textContent).not.toContain('page 1 body')
  // … but the shell element is the very same node (not re-rendered).
  expect((document.getElementById('hdr') as unknown as { __kept?: string }).__kept).toBe('yes')

  // Title + history advanced.
  expect(document.title).toBe('Blog — Page 2')
  expect(pushSpy).toHaveBeenCalledTimes(1)
  expect(String(pushSpy.mock.calls[0][2])).toContain('/blog/2')

  // Re-hydration fired once; the router fetched the full page and extracts
  // the outlet client-side (no server-side content negotiation).
  expect(rehydrate).toHaveBeenCalledTimes(1)
  expect(fetchCalls).toHaveLength(1)
})

test('rapid navigation: the latest target wins even if an earlier response resolves last', async () => {
  // /slow's body resolves AFTER /fast's, modelling a slow first request the
  // user navigates away from. The stale /slow swap must not land.
  ;(globalThis as { fetch: unknown }).fetch = mock((url: unknown) => {
    const href = String(url)
    const slow = href.includes('/slow')
    const body = slow
      ? `<main bf-outlet><p>SLOW body</p></main>`
      : `<main bf-outlet><p>FAST body</p></main>`
    return Promise.resolve({
      ok: true,
      redirected: false,
      url: href,
      // Slow response's text() resolves on a later turn than the fast one.
      text: () => new Promise<string>((r) => setTimeout(() => r(body), slow ? 40 : 0)),
    } as unknown as Response)
  })

  const pushSpy = spyOn(window.history, 'pushState')
  const router = startRouter({ rehydrate: () => {} })
  stop = router.stop

  // Kick off the slow navigation, then immediately supersede it.
  const p1 = router.navigate('/slow')
  const p2 = router.navigate('/fast')
  await Promise.all([p1, p2])
  await flush()

  expect(document.querySelector('[bf-outlet]')!.textContent).toContain('FAST body')
  expect(document.querySelector('[bf-outlet]')!.textContent).not.toContain('SLOW body')
  // The last committed history entry is the winner, not the stale /slow one.
  const lastPush = pushSpy.mock.calls.at(-1)
  expect(String(lastPush?.[2])).toContain('/fast')
})

test('does not intercept external links or modified clicks', async () => {
  const router = startRouter({ rehydrate: () => {} })
  stop = router.stop

  const external = document.createElement('a')
  external.id = 'ext'
  external.href = 'https://other.test/elsewhere'
  external.textContent = 'out'
  document.body.appendChild(external)

  clickLink('ext') // cross-origin
  clickLink('next', { metaKey: true }) // cmd/ctrl-click on internal link
  await flush()

  expect(fetchCalls).toHaveLength(0)
})

test('module-aware swap: a navigated-to island loads its module then hydrates (deduped)', async () => {
  // A prior test's cross-origin anchor click can move the happy-dom
  // location; reset it so relative module URLs resolve predictably.
  ;(window as unknown as { happyDOM?: { setURL?: (u: string) => void } }).happyDOM?.setURL?.(
    'https://example.test/blog/1',
  )

  // Faithful stand-in for the client runtime: an island only hydrates once
  // its module (which would call hydrate(name, def)) has loaded and
  // registered the def. `rehydrate` inits [bf-s] elements whose def exists.
  const registry = new Map<string, (el: Element) => void>()
  const hydrated: string[] = []
  const rehydrate = (outlet: Element) => {
    for (const el of outlet.querySelectorAll('[bf-s]')) {
      const name = el.getAttribute('bf-s')!.split('_')[0]
      const init = registry.get(name)
      if (init) {
        init(el)
        hydrated.push(name)
      }
    }
  }
  const imported: string[] = []
  const loadModule = async (src: string) => {
    imported.push(src)
    if (src.endsWith('/counter.js')) registry.set('Counter', (el) => (el.textContent = 'hydrated'))
  }

  // Response carries a Counter island + its module script (BfScripts).
  const page = () => `<!doctype html><html><head><title>P2</title></head><body>
      <header id="hdr">SHELL</header>
      <main bf-outlet><div bf-s="Counter_1">SSR</div></main>
      <script type="module" src="/static/counter.js"></script>
    </body></html>`
  mockFetch(page)

  const router = startRouter({ rehydrate, loadModule })
  stop = router.stop

  // First navigation: the new module loads, then the island hydrates.
  clickLink('next')
  await flush()
  expect(imported).toEqual(['https://example.test/static/counter.js'])
  expect(hydrated).toEqual(['Counter']) // hydrated only because the def loaded first
  expect(document.querySelector('[bf-s="Counter_1"]')!.textContent).toBe('hydrated')

  // Second navigation to a page referencing the same module → not re-imported.
  await router.navigate('/blog/3')
  await flush()
  expect(imported).toEqual(['https://example.test/static/counter.js']) // still just once
})

function hover(id: string): void {
  document.getElementById(id)!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
}

test('hover prefetches the page so the click reuses it (no second fetch)', async () => {
  ;(window as unknown as { happyDOM?: { setURL?: (u: string) => void } }).happyDOM?.setURL?.(
    'https://example.test/blog/1',
  )
  const router = startRouter({ rehydrate: () => {}, prefetchDelay: 5 })
  stop = router.stop

  hover('next')
  await new Promise((r) => setTimeout(r, 25)) // past the prefetch dwell
  expect(fetchCalls).toHaveLength(1) // prefetched on hover

  clickLink('next')
  await flush()
  expect(fetchCalls).toHaveLength(1) // click reused the cache — no new fetch
  expect(document.querySelector('[bf-outlet]')!.textContent).toContain('page 2 body')
})

test('prefetch: false disables hover prefetching', async () => {
  const router = startRouter({ rehydrate: () => {}, prefetch: false })
  stop = router.stop

  hover('next')
  await new Promise((r) => setTimeout(r, 25))
  expect(fetchCalls).toHaveLength(0)
})

test('a failed prefetch does not poison the cache — the click retries (Next.js behavior)', async () => {
  ;(window as unknown as { happyDOM?: { setURL?: (u: string) => void } }).happyDOM?.setURL?.(
    'https://example.test/blog/1',
  )
  // First request (the hover prefetch) fails; the second (the click) succeeds.
  let call = 0
  ;(globalThis as { fetch: unknown }).fetch = mock(async (url: unknown) => {
    call += 1
    if (call === 1) throw new Error('network down') // prefetch fails
    return {
      ok: true,
      redirected: false,
      url: String(url),
      text: async () => fullPage2(),
    } as unknown as Response
  })

  const router = startRouter({ rehydrate: () => {}, prefetchDelay: 5 })
  stop = router.stop

  hover('next')
  await new Promise((r) => setTimeout(r, 25)) // prefetch fires and fails
  await flush() // let the failed entry evict itself

  clickLink('next')
  await flush()

  // The failed prefetch didn't poison the URL: the click retried and swapped.
  expect(call).toBeGreaterThanOrEqual(2)
  expect(document.querySelector('[bf-outlet]')!.textContent).toContain('page 2 body')
})

function press(id: string, init: MouseEventInit = {}): void {
  document
    .getElementById(id)!
    .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, ...init }))
}

test('primary press (pointerdown) prefetches immediately, no dwell; click reuses it', async () => {
  ;(window as unknown as { happyDOM?: { setURL?: (u: string) => void } }).happyDOM?.setURL?.(
    'https://example.test/blog/1',
  )
  const router = startRouter({ rehydrate: () => {} })
  stop = router.stop

  press('next')
  await flush() // no dwell — press prefetches right away
  expect(fetchCalls).toHaveLength(1)

  clickLink('next')
  await flush()
  expect(fetchCalls).toHaveLength(1) // click reused the press-prefetched page
  expect(document.querySelector('[bf-outlet]')!.textContent).toContain('page 2 body')
})

test('non-primary press (e.g. right-click) does not prefetch', async () => {
  const router = startRouter({ rehydrate: () => {} })
  stop = router.stop

  press('next', { button: 2 }) // secondary button
  await flush()
  expect(fetchCalls).toHaveLength(0)
})

/** Mock fetch returning a full page whose outlet says "body <N>" per call. */
function mockCountingFetch(): () => number {
  let call = 0
  ;(globalThis as { fetch: unknown }).fetch = mock(async (url: unknown) => {
    const n = ++call
    return {
      ok: true,
      redirected: false,
      url: String(url),
      text: async () =>
        `<!doctype html><html><head><title>P</title></head><body>
          <main bf-outlet><p id="content">body ${n}</p></main>
        </body></html>`,
    } as unknown as Response
  })
  return () => call
}

test('aging cache entry serves instantly and refreshes in the background (SWR)', async () => {
  const calls = mockCountingFetch()
  // cacheFreshMs:0 → the entry is in its "aging" window immediately.
  const router = startRouter({ rehydrate: () => {}, cacheFreshMs: 0, cacheStaleMs: 60_000 })
  stop = router.stop

  await router.navigate('/p')
  await flush()
  expect(calls()).toBe(1)
  expect(document.querySelector('[bf-outlet]')!.textContent).toContain('body 1')

  // Re-navigate: aging → serve the CACHED page instantly (still body 1) AND
  // kick a background refresh (a second fetch).
  await router.navigate('/p')
  await flush()
  expect(document.querySelector('[bf-outlet]')!.textContent).toContain('body 1') // served cached
  expect(calls()).toBe(2) // background refresh fired

  // The background refresh updated the cache → the next nav shows the new body.
  await router.navigate('/p')
  await flush()
  expect(document.querySelector('[bf-outlet]')!.textContent).toContain('body 2')
})

test('a stale cache entry is refetched fresh, never served stale', async () => {
  const calls = mockCountingFetch()
  // cacheStaleMs:0 → entries are immediately too old to serve.
  const router = startRouter({ rehydrate: () => {}, cacheStaleMs: 0 })
  stop = router.stop

  await router.navigate('/p')
  await flush()
  expect(document.querySelector('[bf-outlet]')!.textContent).toContain('body 1')

  // Past staleAt → fetch fresh and show the new body (never the stale one).
  await router.navigate('/p')
  await flush()
  expect(calls()).toBe(2)
  expect(document.querySelector('[bf-outlet]')!.textContent).toContain('body 2')
})

test('query-only navigation updates searchParams without swapping (when in use)', async () => {
  setURL('https://example.test/list')
  const searches: string[] = []
  ;(window as unknown as { __bf_set_search: (s: string) => void }).__bf_set_search = (s) =>
    searches.push(s)
  const rehydrate = mock(() => {})
  const pushSpy = spyOn(window.history, 'pushState')
  const router = startRouter({ rehydrate })
  stop = router.stop

  await router.navigate('/list?sort=price') // same path, query-only
  await flush()

  expect(fetchCalls).toHaveLength(0) // no fetch → no swap
  expect(rehydrate).not.toHaveBeenCalled() // no re-hydration
  expect(searches).toEqual(['?sort=price']) // searchParams signal updated
  expect(String(pushSpy.mock.calls.at(-1)?.[2])).toContain('sort=price') // URL updated
})

test('query-only navigation swaps when searchParams is not in use (legacy)', async () => {
  setURL('https://example.test/list')
  // no __bf_set_search seam → query change has no island consumer → swap.
  const rehydrate = mock(() => {})
  const router = startRouter({ rehydrate })
  stop = router.stop

  await router.navigate('/list?sort=price')
  await flush()

  expect(fetchCalls).toHaveLength(1) // swapped (fetched)
  expect(rehydrate).toHaveBeenCalledTimes(1)
})

test('a pathname change swaps even when searchParams is in use', async () => {
  setURL('https://example.test/list')
  ;(window as unknown as { __bf_set_search: (s: string) => void }).__bf_set_search = () => {}
  const rehydrate = mock(() => {})
  const router = startRouter({ rehydrate })
  stop = router.stop

  await router.navigate('/other?x=1') // different pathname → structural
  await flush()

  expect(fetchCalls).toHaveLength(1) // swapped
  expect(rehydrate).toHaveBeenCalledTimes(1)
})

test('popstate query-only (same route) does not swap when searchParams is in use', async () => {
  setURL('https://example.test/list')
  ;(window as unknown as { __bf_set_search: (s: string) => void }).__bf_set_search = () => {}
  const rehydrate = mock(() => {})
  const router = startRouter({ rehydrate }) // currentPath = /list
  stop = router.stop

  // Back/forward to a query-only URL on the same route.
  setURL('https://example.test/list?sort=date')
  window.dispatchEvent(new Event('popstate'))
  await flush()

  expect(fetchCalls).toHaveLength(0) // no swap
  expect(rehydrate).not.toHaveBeenCalled()
})

test('popstate to a different route swaps the outlet', async () => {
  setURL('https://example.test/list')
  const rehydrate = mock(() => {})
  const router = startRouter({ rehydrate }) // currentPath = /list
  stop = router.stop

  setURL('https://example.test/other')
  window.dispatchEvent(new Event('popstate'))
  await flush()

  expect(fetchCalls).toHaveLength(1) // pathname changed → swapped
  expect(rehydrate).toHaveBeenCalledTimes(1)
})

test('cache eviction is LRU: a re-accessed page survives over an older one', async () => {
  setURL('https://example.test/start')
  const router = startRouter({ rehydrate: () => {}, cacheCap: 2 })
  stop = router.stop

  await router.navigate('/a') // cache [a]            fetch 1
  await flush()
  await router.navigate('/b') // cache [a,b]          fetch 2
  await flush()
  await router.navigate('/a') // hit a → bump [b,a]   (no fetch)
  await flush()
  await router.navigate('/c') // [b,a,c] > cap 2 → evict LRU b → [a,c]   fetch 3
  await flush()
  const after3 = fetchCalls.length
  expect(after3).toBe(3)

  await router.navigate('/a') // a survived the bump → cache hit, no fetch
  await flush()
  expect(fetchCalls).toHaveLength(after3)

  await router.navigate('/b') // b was evicted → refetch
  await flush()
  expect(fetchCalls).toHaveLength(after3 + 1)
})
