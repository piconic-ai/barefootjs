/**
 * `createQuery` runtime (spec/async.md §7, async layer 0 2/4, #3157). One
 * describe per numbered rule in the doc comment on `createQuery` itself.
 *
 * `createQuery` is not exported from `../src/index.ts` yet (#3158 wires up
 * compiler recognition first) — imported directly from its module.
 */

import { describe, test, expect, beforeEach, afterEach, setSystemTime } from 'bun:test'
import { createSignal, createMemo, createRoot } from '../src/reactive'
import { http, type HttpDescriptor } from '../src/http'
import { createQuery, __resetQueryCacheForTests } from '../src/create-query'

// -- fetch stubs --------------------------------------------------------

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/** Every call resolves immediately with `body`. */
function stubFetch(body: unknown, status = 200): { calls: string[] } {
  const calls: string[] = []
  // @ts-expect-error — test stub
  globalThis.fetch = (url: string) => {
    calls.push(url)
    return Promise.resolve(jsonResponse(body, status))
  }
  return { calls }
}

/** Calls are recorded but resolve only when `resolveNth` is invoked. */
function deferredFetch(): {
  calls: string[]
  resolveNth: (n: number, body: unknown, status?: number) => void
} {
  const calls: string[] = []
  const resolvers: Array<(r: Response) => void> = []
  // @ts-expect-error — test stub
  globalThis.fetch = (url: string) => {
    calls.push(url)
    return new Promise<Response>((resolve) => {
      resolvers.push(resolve)
    })
  }
  return {
    calls,
    resolveNth(n, body, status = 200) {
      resolvers[n]!(jsonResponse(body, status))
    },
  }
}

async function waitUntil(predicate: () => boolean, maxIters = 200): Promise<void> {
  for (let i = 0; i < maxIters; i++) {
    if (predicate()) return
    await Promise.resolve()
  }
  throw new Error(`waitUntil: condition not met after ${maxIters} microtask ticks`)
}

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

const originalFetch = globalThis.fetch
beforeEach(() => {
  // Each real page load gets a fresh module instance (an empty cache); the
  // test process reuses the same module across cases, so reset it explicitly
  // — otherwise an earlier test's cached key answers a later test's query
  // synchronously with stale data instead of exercising a real send.
  __resetQueryCacheForTests()
})
afterEach(() => {
  globalThis.fetch = originalFetch
  setSystemTime()
})

// -- rule 1: descriptors only --------------------------------------------

describe('rule 1: only descriptors in v0', () => {
  test('a request function returning a Promise throws synchronously, naming createQuery', () => {
    expect(() =>
      createQuery(() => Promise.resolve({ id: 1 }) as unknown as HttpDescriptor<unknown>),
    ).toThrow(/createQuery/)
  })

  test('a request function returning a plain object throws', () => {
    expect(() =>
      createQuery(() => ({ url: '/api/posts' }) as unknown as HttpDescriptor<unknown>),
    ).toThrow(/createQuery/)
  })
})

// -- rule 2: tracking ------------------------------------------------------

describe('rule 2: tracking', () => {
  test('re-sends when a signal read inside the function changes', async () => {
    const { calls } = stubFetch([])
    const [page, setPage] = createSignal(1)
    createQuery(() => http.get('/api/posts', { page: page() }))
    await waitUntil(() => calls.length === 1)
    expect(calls[0]).toBe('/api/posts?page=1')

    setPage(2)
    await waitUntil(() => calls.length === 2)
    expect(calls[1]).toBe('/api/posts?page=2')
  })

  test('does not re-send when an untracked signal changes', async () => {
    const { calls } = stubFetch([])
    const [page] = createSignal(1)
    const [unrelated, setUnrelated] = createSignal('a')
    createQuery(() => http.get('/api/posts', { page: page() }))
    await waitUntil(() => calls.length === 1)

    setUnrelated('b')
    await settle()
    expect(calls.length).toBe(1)
  })
})

// -- rule 3: one send per tick, including the diamond case -----------------

describe('rule 3: one send per tick', () => {
  test('several synchronous dependency changes in one tick coalesce to one send', async () => {
    const { calls } = stubFetch([])
    const [page, setPage] = createSignal(1)
    createQuery(() => http.get('/api/posts', { page: page() }))
    await waitUntil(() => calls.length === 1)

    setPage(2)
    setPage(3)
    setPage(4)
    await waitUntil(() => calls.length === 2)
    expect(calls[1]).toBe('/api/posts?page=4')
    await settle()
    expect(calls.length).toBe(2) // no straggler send for page=2 or page=3
  })

  test('a diamond dependency sends exactly once, keyed by the consistent snapshot', async () => {
    const { calls } = stubFetch([])
    const [base, setBase] = createSignal(1)
    const double = createMemo(() => base() * 2)
    const plusOne = createMemo(() => base() + 1)
    createQuery(() => http.get('/api/x', { a: double(), b: plusOne() }))
    await waitUntil(() => calls.length === 1)
    expect(calls[0]).toBe('/api/x?a=2&b=2')

    setBase(2)
    await waitUntil(() => calls.length === 2)
    // Consistent snapshot: a=double(2)=4, b=plusOne(2)=3 — never the glitched
    // intermediate a=4&b=2 the synchronous diamond re-run produces first.
    expect(calls[1]).toBe('/api/x?a=4&b=3')
    await settle()
    expect(calls.length).toBe(2)
  })
})

// -- rule 4: init rule -------------------------------------------------

describe('rule 4: init rule', () => {
  test('initial present: the first send never happens', async () => {
    const { calls } = stubFetch([])
    const [posts] = createQuery(() => http.get<{ id: number }[]>('/api/posts'), {
      initial: [{ id: 1 }],
    })
    expect(posts()).toEqual([{ id: 1 }])
    await settle()
    expect(calls.length).toBe(0)
  })

  test('initial absent: the first descriptor is sent', async () => {
    const { calls } = stubFetch([{ id: 1 }])
    const [posts] = createQuery(() => http.get<{ id: number }[]>('/api/posts'))
    expect(posts()).toBeUndefined()
    await waitUntil(() => calls.length === 1)
    await waitUntil(() => posts() !== undefined)
    expect(posts()).toEqual([{ id: 1 }])
  })
})

// -- rule 5: cache -----------------------------------------------------

describe('rule 5: cache', () => {
  test('a fresh entry answers synchronously with no send (re-mount on the same page)', async () => {
    const { calls } = stubFetch({ id: 1 })
    const [a] = createQuery(() => http.get('/api/shared-a'))
    await waitUntil(() => calls.length === 1)
    await waitUntil(() => a() !== undefined)

    const [b] = createQuery(() => http.get('/api/shared-a'))
    // No new send: b() resolves from the fresh cache entry `a`'s send populated
    // — via the same microtask-flush path a real dependency change would take.
    await waitUntil(() => b() !== undefined)
    expect(b()).toEqual({ id: 1 })
    await settle()
    expect(calls.length).toBe(1)
  })

  test('a stale entry is shown immediately, then re-fetched', async () => {
    setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    const { calls } = stubFetch({ v: 1 })
    const [a] = createQuery(() => http.get('/api/stale-x'), { ttl: 10 })
    await waitUntil(() => calls.length === 1)
    await waitUntil(() => a() !== undefined)
    expect(a()).toEqual({ v: 1 })

    setSystemTime(new Date('2026-01-01T00:00:01.000Z')) // 1000ms later, ttl=10ms — stale
    globalThis.fetch = (() => Promise.resolve(jsonResponse({ v: 2 }))) as typeof fetch
    const [b] = createQuery(() => http.get('/api/stale-x'), { ttl: 10 })
    // Shown immediately (as soon as the flush runs) from the stale cache
    // entry, not left undefined until the re-fetch resolves.
    await waitUntil(() => b() !== undefined)
    expect(b()).toEqual({ v: 1 })
    await waitUntil(() => b()?.v === 2)
  })

  test('two queries with the same key in flight share one request (single-flight)', async () => {
    const { calls } = stubFetch({ id: 1 })
    const [a] = createQuery(() => http.get('/api/single-flight'))
    const [b] = createQuery(() => http.get('/api/single-flight'))
    await waitUntil(() => a() !== undefined && b() !== undefined)
    expect(calls.length).toBe(1)
    expect(a()).toEqual({ id: 1 })
    expect(b()).toEqual({ id: 1 })
  })
})

// -- rule 6: previous value retention -----------------------------------

describe('rule 6: previous value retention', () => {
  test('value() keeps the previous value while pending and on failure; error() clears on the next success', async () => {
    const [page, setPage] = createSignal(1)
    globalThis.fetch = (() => Promise.resolve(jsonResponse({ page: 1 }))) as typeof fetch
    const [posts, fetchAction] = createQuery(() => http.get<{ page: number }>('/api/posts', { page: page() }))
    await waitUntil(() => posts() !== undefined)
    expect(posts()).toEqual({ page: 1 })
    expect(fetchAction.error()).toBeUndefined()

    globalThis.fetch = (() => Promise.resolve(jsonResponse({ message: 'boom' }, 500))) as typeof fetch
    setPage(2)
    await waitUntil(() => fetchAction.error() !== undefined)
    expect(posts()).toEqual({ page: 1 }) // previous value retained
    expect(fetchAction.error()).toBeDefined()

    globalThis.fetch = (() => Promise.resolve(jsonResponse({ page: 3 }))) as typeof fetch
    setPage(3)
    await waitUntil(() => posts()?.page === 3)
    expect(fetchAction.error()).toBeUndefined() // cleared by the next success
  })

  test('error() is always a real Error, even when the underlying rejection is not one', async () => {
    // Some fetch polyfills / embedded runtimes reject with a plain value
    // rather than an Error instance; error()'s type is `HttpError | Error`.
    globalThis.fetch = (() => Promise.reject('a plain string rejection')) as unknown as typeof fetch
    const [, fetchAction] = createQuery(() => http.get('/api/posts'))
    await waitUntil(() => fetchAction.error() !== undefined)
    expect(fetchAction.error()).toBeInstanceOf(Error)
    expect(fetchAction.error()?.message).toBe('a plain string rejection')
  })
})

// -- rule 7: generation guard --------------------------------------------

describe('rule 7: generation guard', () => {
  test('1 -> 2 -> 1 dependency changes: only the latest send may write', async () => {
    const { calls, resolveNth } = deferredFetch()
    const [page, setPage] = createSignal(1)
    const [posts] = createQuery(() => http.get<{ page: number }>('/api/posts', { page: page() }))
    await waitUntil(() => calls.length === 1) // send #0: page=1

    setPage(2)
    await waitUntil(() => calls.length === 2) // send #1: page=2

    setPage(1)
    await waitUntil(() => calls.length === 2) // send #2 for page=1 joins send #0's still-inflight promise — no new fetch call
    await settle()
    expect(calls.length).toBe(2)

    // Resolve the OLDER page=2 send first — its generation is stale by now
    // (page=1's re-send bumped the generation past it) and must not write.
    resolveNth(1, { page: 2 })
    await settle()
    expect(posts()).toBeUndefined() // still nothing written

    // Resolve the shared page=1 promise — this is the latest generation.
    resolveNth(0, { page: 1 })
    await waitUntil(() => posts() !== undefined)
    expect(posts()).toEqual({ page: 1 })
  })

  test('1 -> 2 -> 1 where the return to 1 is a fresh cache hit: the stale send for 2 never writes', async () => {
    const { calls, resolveNth } = deferredFetch()
    const [page, setPage] = createSignal(1)
    const [posts, fetchPosts] = createQuery(
      () => http.get<{ page: number }>('/api/posts', { page: page() }),
      { initial: { page: 1 } }, // primes page=1 into the cache as fresh; no send
    )
    await settle()
    expect(calls.length).toBe(0)

    setPage(2)
    await waitUntil(() => calls.length === 1) // send for page=2, left in flight
    expect(fetchPosts.isPending()).toBe(true)

    setPage(1) // fresh cache hit: answered synchronously in the flush, no send
    await settle()
    expect(calls.length).toBe(1)
    expect(posts()).toEqual({ page: 1 })
    expect(fetchPosts.isPending()).toBe(false) // nothing is in flight for the current key

    // The older page=2 response arrives last and must not overwrite page=1.
    resolveNth(0, { page: 2 })
    await settle()
    expect(posts()).toEqual({ page: 1 })
    expect(fetchPosts.isPending()).toBe(false)
  })

  test('a re-run that lands on the key already in flight does not supersede that send', async () => {
    const { calls, resolveNth } = deferredFetch()
    // `unrelated` is read by the request function but does not change its key.
    const [unrelated, setUnrelated] = createSignal(0)
    const [posts, fetchPosts] = createQuery(
      () => {
        unrelated()
        return http.get<{ v: number }>('/api/same-key')
      },
      { initial: { v: 0 } }, // the key is cached fresh; no automatic send
    )

    const forced = fetchPosts() // action(): force-sends the key, left in flight
    await waitUntil(() => calls.length === 1)
    expect(fetchPosts.isPending()).toBe(true)

    setUnrelated(1) // re-run: same key, fresh in the cache, and already in flight
    await settle()
    expect(calls.length).toBe(1)
    expect(fetchPosts.isPending()).toBe(true) // the forced send is still the one that counts

    resolveNth(0, { v: 1 })
    await forced
    await settle()
    expect(posts()).toEqual({ v: 1 })
    expect(fetchPosts.isPending()).toBe(false)
  })
})

// -- rule 8: action --------------------------------------------------------

describe('rule 8: action', () => {
  test('action() re-sends the current descriptor and resolves with the value', async () => {
    const { calls } = stubFetch({ id: 1 })
    const [posts, fetchPosts] = createQuery(() => http.get<{ id: number }[]>('/api/posts'), {
      initial: [{ id: 0 }],
    })
    expect(posts()).toEqual([{ id: 0 }])
    await settle()
    expect(calls.length).toBe(0) // init rule: no auto-send

    const result = await fetchPosts()
    expect(result).toEqual({ id: 1 })
    expect(calls.length).toBe(1)
  })

  test('action() bypasses freshness: calling it again immediately still sends', async () => {
    const { calls } = stubFetch({ n: 1 })
    const [n, fetchIt] = createQuery(() => http.get<{ n: number }>('/api/bypass-freshness'))
    // Wait for the automatic send to fully settle (not just for `fetch` to
    // have been *called*) so the in-flight entry has cleared and the next
    // call can't join it via single-flight — this test is about the
    // freshness *cache* check specifically, which action() must skip.
    await waitUntil(() => n() !== undefined)
    expect(calls.length).toBe(1)

    await fetchIt() // fresh cache entry exists, but action() sends anyway
    expect(calls.length).toBe(2)
  })

  test('action() rejects with the error on failure', async () => {
    globalThis.fetch = (() => Promise.resolve(jsonResponse({ msg: 'no' }, 400))) as typeof fetch
    // `initial` set so the automatic init send never fires — isolates the
    // assertion to `action()`'s own rejection.
    const [, fetchIt] = createQuery(() => http.get('/api/will-fail'), { initial: 0 })
    await expect(fetchIt()).rejects.toMatchObject({ status: 400 })
  })

  test('isPending() reflects the last send has not settled', async () => {
    const { resolveNth } = deferredFetch()
    const [, fetchIt] = createQuery(() => http.get('/api/pending-flag'), { initial: 0 })
    expect(fetchIt.isPending()).toBe(false)
    const p = fetchIt()
    await waitUntil(() => fetchIt.isPending())
    resolveNth(0, 1)
    await p
    expect(fetchIt.isPending()).toBe(false)
  })
})

// -- rule 9: disposal --------------------------------------------------

describe('rule 9: disposal', () => {
  test('a resolution that arrives after disposal is dropped', async () => {
    const { calls, resolveNth } = deferredFetch()
    let posts!: () => unknown[] | undefined
    const dispose = createRoot((dispose) => {
      const [p] = createQuery(() => http.get<unknown[]>('/api/disposal'))
      posts = p
      return dispose
    })
    await waitUntil(() => calls.length === 1) // the send is in flight

    dispose()
    resolveNth(0, [{ id: 1 }])
    await settle()

    expect(posts()).toBeUndefined() // never written — dropped by disposal
  })

  test('disposing before the send even fires drops it too', async () => {
    const { calls } = stubFetch([{ id: 1 }])
    let posts!: () => unknown[] | undefined
    const dispose = createRoot((dispose) => {
      const [p] = createQuery(() => http.get<unknown[]>('/api/disposal-early'))
      posts = p
      return dispose
    })
    dispose() // disposed before the microtask-scheduled send ever flushes
    await settle()
    expect(calls.length).toBe(0) // the flush saw `disposed` and never sent
    expect(posts()).toBeUndefined()
  })
})
