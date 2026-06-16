/**
 * @barefootjs/router v1 — `data-bf-permanent` persistence across a region swap.
 *
 * A marked element's LIVE node (and its state) survives a navigation instead of
 * being disposed and recreated; everything else swaps as usual.
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
let fetchCalls = 0

const flush = (ms = 10) => new Promise((r) => setTimeout(r, ms))

function page(body: string, title = 'p'): string {
  return `<!doctype html><html><head><title>${title}</title></head><body><header>shell</header><main bf-region>${body}</main></body></html>`
}

function setURL(url: string): void {
  const happy = (globalThis as unknown as { happyDOM?: { setURL?: (u: string) => void } }).happyDOM
  if (happy?.setURL) happy.setURL(url)
  else window.history.replaceState(window.history.state, '', url)
}

function mockFetch(htmlFor: (url: string) => string | null): void {
  fetchCalls = 0
  ;(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL) => {
    fetchCalls++
    const html = htmlFor(String(input))
    if (html === null) return { ok: false, status: 404, redirected: false, url: String(input), text: async () => '' } as unknown as Response
    return { ok: true, status: 200, redirected: false, url: String(input), text: async () => html } as unknown as Response
  }) as typeof fetch
}

function region(): Element {
  return document.querySelector('[bf-region]') as Element
}

beforeEach(() => {
  setURL('https://example.test/a')
  document.body.innerHTML = `<header>shell</header>
    <main bf-region>
      <p id="content">page A</p>
      <div data-bf-permanent="player" id="player">player</div>
    </main>`
  ;(window as unknown as { __bf_dispose_within?: (r: Element) => void }).__bf_dispose_within = () => {}
})

afterEach(() => {
  router?.stop()
  router = null
  delete (window as unknown as Record<string, unknown>).__bf_dispose_within
})

describe('@barefootjs/router v1 — data-bf-permanent', () => {
  test('a permanent element keeps its live node (and state) across a swap', async () => {
    // Tag the live node + give it some live state.
    const live = document.getElementById('player') as HTMLElement & { __state?: string }
    live.__state = 'playing'
    mockFetch(() =>
      page('<p id="content">page B</p><div data-bf-permanent="player" id="player">player</div>', 'B'),
    )
    router = startRouter({ rehydrate: () => {}, dispose: () => {} })

    await navigate('/b')
    await flush()

    // Non-permanent content swapped.
    expect(document.getElementById('content')?.textContent).toBe('page B')
    // The permanent node is the SAME live instance, state intact.
    const after = document.getElementById('player') as HTMLElement & { __state?: string }
    expect(after).toBe(live)
    expect(after.__state).toBe('playing')
  })

  test('a non-permanent element is replaced (fresh node)', async () => {
    const oldContent = document.getElementById('content') as HTMLElement & { __old?: boolean }
    oldContent.__old = true
    mockFetch(() =>
      page('<p id="content">page B</p><div data-bf-permanent="player" id="player">player</div>'),
    )
    router = startRouter({ rehydrate: () => {}, dispose: () => {} })
    await navigate('/b')
    await flush()
    const newContent = document.getElementById('content') as HTMLElement & { __old?: boolean }
    expect(newContent.__old).toBeUndefined() // it's a fresh node
  })

  test('matches by data-bf-permanent key, falling back to id', async () => {
    // Incoming marks the node with a value-less `data-bf-permanent` + an `id`,
    // so `permanentKey()` falls back to the `id` to match the live node (whose
    // key comes from its `data-bf-permanent="player"` value — both resolve to
    // "player").
    const live = document.getElementById('player') as HTMLElement & { __keep?: number }
    live.__keep = 7
    mockFetch(() =>
      page('<p id="content">B</p><div data-bf-permanent id="player">player</div>'),
    )
    router = startRouter({ rehydrate: () => {}, dispose: () => {} })
    await navigate('/b')
    await flush()
    expect((document.getElementById('player') as { __keep?: number }).__keep).toBe(7)
  })

  test('nested permanents: inner stays inside its preserved outer (not yanked out)', async () => {
    document.body.innerHTML = `<header>shell</header>
      <main bf-region>
        <div data-bf-permanent="outer" id="outer"><span data-bf-permanent="inner" id="inner">inner</span></div>
      </main>`
    const outer = document.getElementById('outer') as HTMLElement & { __k?: string }
    const inner = document.getElementById('inner') as HTMLElement & { __k?: string }
    outer.__k = 'O'
    inner.__k = 'I'
    mockFetch(() =>
      page('<div data-bf-permanent="outer" id="outer"><span data-bf-permanent="inner" id="inner">inner</span></div>'),
    )
    router = startRouter({ rehydrate: () => {}, dispose: () => {} })
    await navigate('/b')
    await flush()

    const outerAfter = document.getElementById('outer') as HTMLElement & { __k?: string }
    const innerAfter = document.getElementById('inner') as HTMLElement & { __k?: string }
    // Both live nodes preserved (same instances, state intact)…
    expect(outerAfter).toBe(outer)
    expect(outerAfter.__k).toBe('O')
    expect(innerAfter).toBe(inner)
    expect(innerAfter.__k).toBe('I')
    // …and the inner is STILL inside the outer (not detached), with no duplicate.
    expect(outerAfter.contains(innerAfter)).toBe(true)
    expect(document.querySelectorAll('#inner').length).toBe(1)
  })

  test('a navigation superseded during dispose does not orphan the permanent node', async () => {
    // Exercises the last-wins window: the swap is synchronous and dispose runs
    // after it, so a permanent node is never detached across the dispose await.
    const live = document.getElementById('player') as HTMLElement & { __keep?: number }
    live.__keep = 9
    let releaseDispose: () => void = () => {}
    const gate = new Promise<void>((r) => {
      releaseDispose = r
    })
    let disposeCalls = 0
    mockFetch(() =>
      page('<p id="content">swapped</p><div data-bf-permanent="player" id="player">player</div>'),
    )
    router = startRouter({
      rehydrate: () => {},
      dispose: async () => {
        // The first navigation's dispose hangs, parking it across an await.
        if (++disposeCalls === 1) await gate
      },
    })

    const navA = navigate('/a')
    await flush(5) // let A reach (and park in) dispose, after it has swapped
    const navB = navigate('/b') // supersedes A while A is parked in dispose
    releaseDispose() // let A resume — it should bail on the abort check
    await Promise.all([navA, navB])
    await flush()

    const after = document.getElementById('player') as HTMLElement & { __keep?: number }
    // Same live node, state intact, still under the region — never orphaned.
    expect(after).toBe(live)
    expect(after.__keep).toBe(9)
    expect(region().contains(after)).toBe(true)
  })

  test('a permanent node absent from the new page is not preserved (removed)', async () => {
    const live = document.getElementById('player') as HTMLElement & { __state?: string }
    live.__state = 'x'
    mockFetch(() => page('<p id="content">page B, no player</p>')) // no permanent node
    router = startRouter({ rehydrate: () => {}, dispose: () => {} })
    await navigate('/b')
    await flush()
    expect(document.getElementById('player')).toBeNull()
  })

  test('morph: false falls back to a plain swap (permanent node replaced)', async () => {
    const live = document.getElementById('player') as HTMLElement & { __state?: string }
    live.__state = 'playing'
    mockFetch(() =>
      page('<p id="content">B</p><div data-bf-permanent="player" id="player">player</div>'),
    )
    router = startRouter({ rehydrate: () => {}, dispose: () => {}, morph: false })
    await navigate('/b')
    await flush()
    // Replaced: fresh node, no preserved state.
    expect((document.getElementById('player') as { __state?: string }).__state).toBeUndefined()
  })

  test('dispose is not called on a preserved permanent node', async () => {
    const disposed: Element[] = []
    // Custom dispose records what it would tear down; the region root is passed,
    // but the permanent node must already have been moved out of it.
    mockFetch(() =>
      page('<p id="content">B</p><div data-bf-permanent="player" id="player">player</div>'),
    )
    router = startRouter({
      rehydrate: () => {},
      dispose: (regionEl) => {
        // At dispose time the permanent node should no longer be inside the region.
        if (regionEl.querySelector('[data-bf-permanent]')) disposed.push(regionEl)
      },
    })
    await navigate('/b')
    await flush()
    expect(disposed.length).toBe(0)
  })
})
