/**
 * Partial-navigation router: a same-origin link click must swap **only**
 * the `[bf-outlet]` region, leave the shell mounted, update history +
 * title, and trigger re-hydration. Covers both response shapes (full
 * document and bare fragment) and the non-intercept cases.
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
})

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

  // Re-hydration fired once; the router fetched the full page (no special
  // content-negotiation header — it extracts the outlet client-side).
  expect(rehydrate).toHaveBeenCalledTimes(1)
  expect(fetchCalls).toHaveLength(1)
  expect(fetchCalls[0].headers['X-Barefoot-Navigate']).toBeUndefined()
})

test('tolerates a bare fragment response (if a backend returns one)', async () => {
  mockFetch(() => `<article id="content">fragment body</article>`)
  const router = startRouter({ rehydrate: () => {} })
  stop = router.stop

  clickLink('next')
  await flush()

  expect(document.querySelector('[bf-outlet]')!.textContent).toContain('fragment body')
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
