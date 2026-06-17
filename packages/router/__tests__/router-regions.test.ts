/**
 * @barefootjs/router v2 — compiler-derived nested / sibling regions.
 *
 * When both documents expose the same `bf-region` ids, the router swaps only
 * the deepest regions whose *owned* content differs: a nested inner region
 * swaps while its outer shell persists; one sibling region swaps while the
 * other keeps its live DOM/state; an outer change rebuilds its nested regions;
 * and a mismatched id set falls back to the single broadest swap (v0).
 */

import { describe, test, expect, beforeAll, beforeEach, afterEach } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

beforeAll(() => {
  if (typeof window === 'undefined') {
    GlobalRegistrator.register({ url: 'https://example.test/a' })
  }
  if (typeof window.scrollTo !== 'function') {
    ;(window as unknown as { scrollTo: () => void }).scrollTo = () => {}
  }
})

const { startRouter, navigate } = await import('../src/index.ts')

let router: { stop(): void } | null = null
const flush = (ms = 10) => new Promise((r) => setTimeout(r, ms))

function setURL(url: string): void {
  const happy = (globalThis as unknown as { happyDOM?: { setURL?: (u: string) => void } }).happyDOM
  if (happy?.setURL) happy.setURL(url)
  else window.history.replaceState(window.history.state, '', url)
}

/** Full HTML page wrapping `body` in a shell, with a `<title>`. */
function page(body: string, title = 'p'): string {
  return `<!doctype html><html><head><title>${title}</title></head><body><header>shell</header>${body}</body></html>`
}

function mockFetch(htmlFor: (url: string) => string | null): void {
  ;(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL) => {
    const html = htmlFor(String(input))
    if (html === null)
      return { ok: false, status: 404, redirected: false, url: String(input), text: async () => '' } as unknown as Response
    return { ok: true, status: 200, redirected: false, url: String(input), text: async () => html } as unknown as Response
  }) as typeof fetch
}

/** Tag a live element with an identity marker; read it back later to prove the node survived. */
function mark(id: string, value: number): void {
  ;(document.getElementById(id) as unknown as { __k?: number }).__k = value
}
function readMark(id: string): number | undefined {
  return (document.getElementById(id) as unknown as { __k?: number } | null)?.__k
}

beforeEach(() => {
  setURL('https://example.test/a')
  ;(window as unknown as { __bf_dispose_within?: (r: Element) => void }).__bf_dispose_within = () => {}
})

afterEach(() => {
  router?.stop()
  router = null
  delete (window as unknown as Record<string, unknown>).__bf_dispose_within
})

describe('@barefootjs/router v2 — nested / sibling regions', () => {
  test('sibling regions: only the one whose content differs swaps', async () => {
    document.body.innerHTML = `<header>shell</header>
      <div bf-region="r:0" id="list"><p id="list-item">list A</p></div>
      <div bf-region="r:1" id="detail"><p id="detail-body">detail A</p></div>`
    mark('list-item', 1) // tag the list region's live node — it must survive

    // Incoming: identical list region, changed detail region.
    mockFetch(() =>
      page(
        `<div bf-region="r:0" id="list"><p id="list-item">list A</p></div>` +
          `<div bf-region="r:1" id="detail"><p id="detail-body">detail B</p></div>`,
      ),
    )
    router = startRouter({ rehydrate: () => {}, dispose: () => {} })
    await navigate('/b')
    await flush()

    // list region untouched → same live node (marker intact); detail swapped.
    expect(readMark('list-item')).toBe(1)
    expect(document.getElementById('detail-body')?.textContent).toBe('detail B')
  })

  test('sibling regions: both swap when both differ', async () => {
    document.body.innerHTML = `<header>shell</header>
      <div bf-region="r:0" id="list"><p id="list-item">list A</p></div>
      <div bf-region="r:1" id="detail"><p id="detail-body">detail A</p></div>`
    mark('list-item', 1)
    mockFetch(() =>
      page(
        `<div bf-region="r:0" id="list"><p id="list-item">list B</p></div>` +
          `<div bf-region="r:1" id="detail"><p id="detail-body">detail B</p></div>`,
      ),
    )
    router = startRouter({ rehydrate: () => {}, dispose: () => {} })
    await navigate('/b')
    await flush()

    expect(readMark('list-item')).toBeUndefined() // fresh node — list swapped too
    expect(document.getElementById('list-item')?.textContent).toBe('list B')
    expect(document.getElementById('detail-body')?.textContent).toBe('detail B')
  })

  test('nested regions: only the inner swaps; the outer shell persists', async () => {
    // Compact markup (no inter-element whitespace): both pages come from the
    // same compiler, so a region's markup is byte-identical except for real
    // content changes — owned-content comparison is an exact string compare.
    document.body.innerHTML =
      `<header>shell</header>` +
      `<div bf-region="r:0" id="outer"><p id="outer-own">shell content</p>` +
      `<div bf-region="r:1" id="inner"><p id="inner-body">inner A</p></div></div>`
    mark('outer-own', 2) // outer's own live node must survive

    // Incoming: outer's own content identical, inner content changed.
    mockFetch(() =>
      page(
        `<div bf-region="r:0" id="outer">` +
          `<p id="outer-own">shell content</p>` +
          `<div bf-region="r:1" id="inner"><p id="inner-body">inner B</p></div>` +
          `</div>`,
      ),
    )
    router = startRouter({ rehydrate: () => {}, dispose: () => {} })
    await navigate('/b')
    await flush()

    expect(readMark('outer-own')).toBe(2) // outer not swapped
    expect(document.getElementById('inner-body')?.textContent).toBe('inner B') // inner swapped
  })

  test('nested regions: an outer change rebuilds the outer (inner rides along)', async () => {
    document.body.innerHTML =
      `<header>shell</header>` +
      `<div bf-region="r:0" id="outer"><p id="outer-own">shell A</p>` +
      `<div bf-region="r:1" id="inner"><p id="inner-body">inner A</p></div></div>`
    mark('outer-own', 3)
    mark('inner-body', 4)
    // Incoming: outer's OWN content changed (inner unchanged).
    mockFetch(() =>
      page(
        `<div bf-region="r:0" id="outer">` +
          `<p id="outer-own">shell B</p>` +
          `<div bf-region="r:1" id="inner"><p id="inner-body">inner A</p></div>` +
          `</div>`,
      ),
    )
    router = startRouter({ rehydrate: () => {}, dispose: () => {} })
    await navigate('/b')
    await flush()

    expect(document.getElementById('outer-own')?.textContent).toBe('shell B')
    expect(readMark('outer-own')).toBeUndefined() // outer rebuilt
    expect(readMark('inner-body')).toBeUndefined() // inner rebuilt as part of the outer swap
  })

  test('mismatched region ids fall back to the broadest single swap', async () => {
    document.body.innerHTML = `<header>shell</header>
      <div bf-region="r:0" id="outer"><p id="body">A</p></div>`
    // Incoming exposes a DIFFERENT id set → can't match 1:1 → broadest fallback.
    mockFetch(() => page(`<div bf-region="r:9" id="outer"><p id="body">B</p></div>`))
    router = startRouter({ rehydrate: () => {}, dispose: () => {} })
    await navigate('/b')
    await flush()
    // The broadest region (first [bf-region]) still swapped its content.
    expect(document.getElementById('body')?.textContent).toBe('B')
  })

  test('a navigation that changes no region commits history without swapping', async () => {
    document.body.innerHTML = `<header>shell</header>
      <div bf-region="r:0" id="outer"><p id="body">same</p></div>`
    mark('body', 5)
    // Incoming is structurally identical inside every region.
    mockFetch(() => page(`<div bf-region="r:0" id="outer"><p id="body">same</p></div>`))
    router = startRouter({ rehydrate: () => {}, dispose: () => {} })
    await navigate('/b')
    await flush()
    expect(readMark('body')).toBe(5) // nothing swapped — live node preserved
    expect(window.location.pathname).toBe('/b') // but the navigation committed
  })
})
