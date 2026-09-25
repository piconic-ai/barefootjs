/**
 * `createMutation` runtime (spec/async.md §7, async layer 0, #3200). One
 * describe per numbered rule in the doc comment on `createMutation` itself.
 *
 * `createMutation` is not exported from `../src/index.ts` yet (same gap as
 * `createQuery`, #3157) — imported directly from its module.
 */

import { describe, test, expect, afterEach } from 'bun:test'
import { createSignal, createEffect, createRoot } from '../src/reactive'
import { http, type HttpDescriptor } from '../src/http'
import { createMutation } from '../src/create-mutation'
import { onInvalidate } from '@barefootjs/shared'
import { jsonResponse, stubFetch, deferredFetch, waitUntil, settle } from './http-test-helpers'

const originalFetch = globalThis.fetch
const originalWarn = console.warn
afterEach(() => {
  globalThis.fetch = originalFetch
  console.warn = originalWarn
})

// -- rule 1: sends only when called -----------------------------------------

describe('rule 1: sends only when called', () => {
  test('nothing is sent at creation', async () => {
    const { calls } = stubFetch({ ok: true })
    createMutation(() => http.post('/api/comments', { body: 'hi' }))
    await settle()
    expect(calls.length).toBe(0)
  })

  test('nothing is sent when a signal the function reads changes', async () => {
    const { calls } = stubFetch({ ok: true })
    const [draft, setDraft] = createSignal('hi')
    createMutation(() => http.post('/api/comments', { body: draft() }))
    setDraft('bye')
    await settle()
    expect(calls.length).toBe(0)
  })
})

// -- untracked evaluation reads current values at call time ------------------

describe('untracked evaluation', () => {
  test('the request reflects the signal value at call time, not at creation', async () => {
    const bodies: unknown[] = []
    // @ts-expect-error — test stub
    globalThis.fetch = (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(init.body as string))
      return Promise.resolve(jsonResponse({ ok: true }))
    }
    const [draft, setDraft] = createSignal('first')
    const [, save] = createMutation(() => http.post('/api/comments', { body: draft() }))
    setDraft('second') // changed before the action is ever called
    await save()
    expect(bodies).toEqual([{ body: 'second' }])
  })

  test('two calls in a row each read the value current at their own call time', async () => {
    const bodies: unknown[] = []
    // @ts-expect-error — test stub
    globalThis.fetch = (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(init.body as string))
      return Promise.resolve(jsonResponse({ ok: true }))
    }
    const [draft, setDraft] = createSignal('first')
    const [, save] = createMutation(() => http.post('/api/comments', { body: draft() }))
    await save()
    setDraft('second')
    await save()
    expect(bodies).toEqual([{ body: 'first' }, { body: 'second' }])
  })

  test('calling the action inside an effect does not subscribe the effect to what fn reads', async () => {
    const { calls } = stubFetch({ ok: true })
    const [draft, setDraft] = createSignal('first')
    const [, save] = createMutation(() => http.post('/api/comments', { body: draft() }))
    let runs = 0
    createRoot(() => {
      createEffect(() => {
        runs++
        save().catch(() => {})
      })
    })
    await settle()
    expect(runs).toBe(1)
    expect(calls.length).toBe(1)

    setDraft('second') // must not re-run the effect, so no second write goes out
    await settle()
    expect(runs).toBe(1)
    expect(calls.length).toBe(1)
  })
})

// -- rule 2: descriptors only -------------------------------------------

describe('rule 2: only descriptors in v0', () => {
  test('a request function returning a Promise throws synchronously, naming createMutation', () => {
    const [, save] = createMutation(() => Promise.resolve({ id: 1 }) as unknown as HttpDescriptor<unknown>)
    expect(() => save()).toThrow(/createMutation/)
  })

  test('a request function returning a plain object throws', () => {
    const [, save] = createMutation(() => ({ url: '/api/x' }) as unknown as HttpDescriptor<unknown>)
    expect(() => save()).toThrow(/createMutation/)
  })
})

// -- rule 3: no cache, no single-flight -----------------------------------

describe('rule 3: no cache, no single-flight', () => {
  test('two calls send twice, even with identical descriptors', async () => {
    const { calls } = stubFetch({ ok: true })
    const [, save] = createMutation(() => http.post('/api/comments', { body: 'same' }))
    await save()
    await save()
    expect(calls.length).toBe(2)
    expect(calls).toEqual(['/api/comments', '/api/comments'])
  })
})

// -- rule 4: concurrent calls -----------------------------------------------

describe('rule 4: concurrent calls', () => {
  test('the latest call wins for the signals; each caller still gets its own result', async () => {
    const { calls, resolveNth } = deferredFetch()
    const [value, save] = createMutation(() => http.post<{ n: number }>('/api/comments', { n: 1 }))

    const p1 = save() // call #0
    const p2 = save() // call #1 — the latest
    await waitUntil(() => calls.length === 2)

    // Resolve the OLDER call first — it must not write the shared signals.
    resolveNth(0, { n: 1 })
    await settle()
    expect(value()).toBeUndefined()

    // Resolve the latest call — this one writes.
    resolveNth(1, { n: 2 })
    await waitUntil(() => value() !== undefined)
    expect(value()).toEqual({ n: 2 })

    // Each caller's own promise still settles with its own result, regardless
    // of which one "wins" for the shared signals.
    await expect(p1).resolves.toEqual({ n: 1 })
    await expect(p2).resolves.toEqual({ n: 2 })
  })

  test('isPending() reflects only the latest call', async () => {
    const { resolveNth } = deferredFetch()
    const [, save] = createMutation(() => http.post('/api/comments', {}))
    expect(save.isPending()).toBe(false)

    const p1 = save()
    const p2 = save()
    expect(save.isPending()).toBe(true)

    resolveNth(0, { ok: true }) // older call settles — still pending (latest hasn't)
    await settle()
    expect(save.isPending()).toBe(true)

    resolveNth(1, { ok: true }) // latest call settles
    await waitUntil(() => !save.isPending())
    await Promise.all([p1, p2])
  })
})

// -- rule 5: value retention -------------------------------------------------

describe('rule 5: value retention', () => {
  test('value() keeps the last successful result across a pending call and a failure', async () => {
    stubFetch({ n: 1 })
    const [value, save] = createMutation(() => http.post<{ n: number }>('/api/comments', {}))
    await save()
    expect(value()).toEqual({ n: 1 })

    globalThis.fetch = (() => Promise.resolve(jsonResponse({ message: 'boom' }, 500))) as typeof fetch
    await expect(save()).rejects.toMatchObject({ status: 500 })
    expect(value()).toEqual({ n: 1 }) // retained across the failure
    expect(save.error()).toMatchObject({ status: 500 })

    globalThis.fetch = (() => Promise.resolve(jsonResponse({ n: 2 }))) as typeof fetch
    await save()
    expect(value()).toEqual({ n: 2 })
    expect(save.error()).toBeUndefined() // cleared by the next success
  })

  test('error() is always a real Error, even when the underlying rejection is not one', async () => {
    globalThis.fetch = (() => Promise.reject('a plain string rejection')) as unknown as typeof fetch
    const [, save] = createMutation(() => http.post('/api/comments', {}))
    await expect(save()).rejects.toBe('a plain string rejection')
    expect(save.error()).toBeInstanceOf(Error)
    expect(save.error()?.message).toBe('a plain string rejection')
  })
})

// -- un-awaited failure -----------------------------------------------------

describe('action(): un-awaited failure', () => {
  test('a fire-and-forget failed call reports no unhandled rejection; error() holds it', async () => {
    stubFetch({ message: 'nope' }, 500)
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => unhandled.push(reason)
    process.on('unhandledRejection', onUnhandled)
    try {
      const [, save] = createMutation(() => http.post('/api/comments', { body: 'hi' }))
      save() // not awaited, as in `onClick={() => save()}`
      await waitUntil(() => save.error() !== undefined)
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(unhandled).toEqual([])
      expect(save.error()).toMatchObject({ status: 500 })
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })
})

// -- rule 6: invalidates -----------------------------------------------------

describe('rule 6: invalidates', () => {
  test('fires on success only, with the given prefixes', async () => {
    const received: (readonly string[])[] = []
    const unsubscribe = onInvalidate((prefixes) => received.push(prefixes))
    try {
      stubFetch({ ok: true })
      const [, save] = createMutation(() => http.post('/api/comments', {}), {
        invalidates: ['/api/posts'],
      })
      await save()
      expect(received).toEqual([['/api/posts']])
    } finally {
      unsubscribe()
    }
  })

  test('does not fire on failure', async () => {
    const received: (readonly string[])[] = []
    const unsubscribe = onInvalidate((prefixes) => received.push(prefixes))
    try {
      globalThis.fetch = (() => Promise.resolve(jsonResponse({ msg: 'no' }, 400))) as typeof fetch
      const [, save] = createMutation(() => http.post('/api/comments', {}), {
        invalidates: ['/api/posts'],
      })
      await expect(save()).rejects.toBeDefined()
      expect(received).toEqual([])
    } finally {
      unsubscribe()
    }
  })

  test('a superseded call still invalidates on its own success', async () => {
    // The generation guard decides who writes value(); it does not decide
    // whether a write happened on the server. Both successes invalidate.
    const received: (readonly string[])[] = []
    const unsubscribe = onInvalidate((prefixes) => received.push(prefixes))
    try {
      const { resolveNth } = deferredFetch()
      const [, save] = createMutation(() => http.post('/api/comments', {}), {
        invalidates: ['/api/posts'],
      })
      const first = save()
      const second = save()
      resolveNth(1, { n: 2 })
      await second
      resolveNth(0, { n: 1 }) // the superseded call settles last
      await first
      expect(received).toEqual([['/api/posts'], ['/api/posts']])
    } finally {
      unsubscribe()
    }
  })

  test('a call that succeeds after disposal still invalidates', async () => {
    const received: (readonly string[])[] = []
    const unsubscribe = onInvalidate((prefixes) => received.push(prefixes))
    try {
      const { resolveNth } = deferredFetch()
      let save!: () => Promise<unknown>
      const dispose = createRoot((dispose) => {
        ;[, save] = createMutation(() => http.post('/api/comments', {}), { invalidates: ['/api/posts'] })
        return dispose
      })
      const pending = save()
      dispose()
      resolveNth(0, { ok: true })
      await pending
      expect(received).toEqual([['/api/posts']])
    } finally {
      unsubscribe()
    }
  })

  test('with no invalidates option, the bus is never touched', async () => {
    const received: (readonly string[])[] = []
    const unsubscribe = onInvalidate((prefixes) => received.push(prefixes))
    try {
      stubFetch({ ok: true })
      const [, save] = createMutation(() => http.post('/api/comments', {}))
      await save()
      expect(received).toEqual([])
    } finally {
      unsubscribe()
    }
  })
})

// -- rule 7: safe-method warning ----------------------------------------

describe('rule 7: safe-method warning', () => {
  test('a GET descriptor still sends, but warns once naming createQuery', async () => {
    const warnings: unknown[][] = []
    console.warn = (...args: unknown[]) => warnings.push(args)
    const { calls } = stubFetch({ ok: true })

    const [, save] = createMutation(() => http.get('/api/posts'))
    await save()
    await save()

    expect(calls.length).toBe(2) // still sends, both times
    expect(warnings.length).toBe(1) // warned only once
    expect(String(warnings[0]?.[0])).toMatch(/createQuery/)
  })

  test('an unsafe method (POST) never warns', async () => {
    const warnings: unknown[][] = []
    console.warn = (...args: unknown[]) => warnings.push(args)
    stubFetch({ ok: true })

    const [, save] = createMutation(() => http.post('/api/comments', {}))
    await save()
    expect(warnings.length).toBe(0)
  })
})

// -- rule 8: disposal --------------------------------------------------

describe('rule 8: disposal', () => {
  test('calling the action after disposal rejects', async () => {
    let save!: () => Promise<unknown>
    const dispose = createRoot((dispose) => {
      const [, s] = createMutation(() => http.post('/api/comments', {}))
      save = s
      return dispose
    })
    dispose()
    await expect(save()).rejects.toThrow(/disposed/)
  })

  test('a call already in flight at disposal still settles its own promise, but never writes the signals', async () => {
    const { resolveNth } = deferredFetch()
    let value!: () => unknown
    let save!: () => Promise<unknown>
    const dispose = createRoot((dispose) => {
      const [v, s] = createMutation(() => http.post<{ id: number }>('/api/comments', {}))
      value = v
      save = s
      return dispose
    })

    const pending = save()
    dispose()
    resolveNth(0, { id: 1 })

    await expect(pending).resolves.toEqual({ id: 1 }) // the caller's own promise still settles
    expect(value()).toBeUndefined() // but never written to the (now-disposed) signal
  })
})
