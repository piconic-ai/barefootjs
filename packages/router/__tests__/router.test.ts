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

  // Re-hydration fired once; fetch carried the partial-nav header.
  expect(rehydrate).toHaveBeenCalledTimes(1)
  expect(fetchCalls).toHaveLength(1)
  expect(fetchCalls[0].headers['X-Barefoot-Navigate']).toBe('1')
})

test('accepts a bare fragment response (server-optimized payload)', async () => {
  mockFetch(() => `<article id="content">fragment body</article>`)
  const router = startRouter({ rehydrate: () => {} })
  stop = router.stop

  clickLink('next')
  await flush()

  expect(document.querySelector('[bf-outlet]')!.textContent).toContain('fragment body')
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
