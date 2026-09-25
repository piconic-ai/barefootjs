/**
 * `createQuery` — async layer 0 runtime (spec/async.md §7). A composite of the
 * primitives in `reactive.ts` (a signal for the value, a signal each for
 * `isPending`/`error`, and an effect that tracks the request function's
 * dependencies), the same way `createForm` (`packages/form/src/create-form.ts`)
 * is a composite over `createSignal`/`createMemo`.
 *
 * NOT exported from `./index.ts` yet (#3157 is runtime-only). Until the
 * compiler recognises the call (#3158) and seeds `initial` / `isPending` /
 * `error` server-side, a real component that imported this from the public
 * entry would hit the silent "unrecognised call → prop accessor" gap
 * spec/async.md §7.8 describes. Import it from this file directly (tests,
 * and #3158's own work) until then.
 */

import { createSignal, createEffect, onCleanup, untrack, type Reactive } from './reactive.ts'
import { isHttpDescriptor, requestKey, requestUrl, sendRequest, HttpError, type HttpDescriptor } from './http.ts'
import { scheduleMicrotask } from './schedule-microtask.ts'
import { onInvalidate } from '@barefootjs/shared'

/** Default freshness window — the router page cache's fresh window (spec/async.md §7.5). */
const DEFAULT_TTL_MS = 15_000

/**
 * Options `createQuery` accepts. `initial` is the **already-obtained result**
 * of the initial request (spec/async.md §7.5) — not a placeholder.
 *
 * @since 0.38.0
 * @stability alpha
 */
export interface CreateQueryOptions<T> {
  /** The initial request's own result. Present → the first send is skipped and this value is primed into the cache as fresh. */
  readonly initial?: T
  /** Freshness window in ms. A fresh cache entry answers synchronously with no send. Default 15000 (15s). */
  readonly ttl?: number
}

/**
 * The callable `action` a query returns alongside its value: re-sends the
 * current descriptor when called, and carries two reactive accessors.
 *
 * @since 0.38.0
 * @stability alpha
 */
export interface QueryAction<T> {
  /** Re-send the current descriptor, bypassing freshness. Resolves with the value or rejects with the error. */
  (): Promise<T>
  /** Whether the last send has not settled. */
  readonly isPending: Reactive<() => boolean>
  /** The last send's error, if it failed; cleared by the next success. */
  readonly error: Reactive<() => HttpError | Error | undefined>
}

type CacheEntry<T> = {
  value: T
  timestamp: number
  /** The descriptor's URL (params serialised, method-agnostic) — what an invalidation prefix matches against (spec/async.md §7.4). */
  url: string
}

// Module-level cache, keyed by `requestKey` (spec/async.md §7.5): a fresh
// entry answers synchronously with no send, so re-mounting on the same page
// (or a second query instance with the same key, cross-island) never
// refetches. `inflight` is tracked separately so two queries with the same
// key in flight share one underlying `sendRequest` call (single-flight).
const cache = new Map<string, CacheEntry<unknown>>()
const inflight = new Map<string, Promise<unknown>>()

function isStale(entry: CacheEntry<unknown>, ttl: number): boolean {
  return Date.now() - entry.timestamp >= ttl
}

/** Force `entry` stale regardless of `ttl` — an invalidation match (rule 10). */
function markStale(entry: CacheEntry<unknown>): void {
  entry.timestamp = -Infinity
}

function matchesAnyPrefix(url: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => url.startsWith(prefix))
}

/**
 * Live (mounted, undisposed) query instances, so the module-level
 * invalidation subscriber (rule 10) can re-send the ones whose *current* key
 * matches, not just mark the shared cache entry stale for whoever reads it
 * next. Populated by `createQuery` itself; removed via `onCleanup`.
 */
interface LiveQuery {
  /** Re-send now if the query isn't already fetching this exact key — the same path a stale cache hit takes in `flush()`. */
  revalidate(): void
  /** The URL (method-agnostic) of the descriptor this instance is currently tracking, or `null` before the first effect run. */
  currentUrl(): string | null
}
const liveQueries = new Set<LiveQuery>()

// Rule 10 (spec/async.md §7.4, #3199): one subscription for the whole
// module — not per instance — matching every cache entry against every
// invalidation. A prefix matches an entry when the entry's URL (method-
// agnostic) starts with it; the full `requestKey` starts with the method
// (`GET /api/posts?…`), so matching against it would never succeed.
onInvalidate((prefixes) => {
  for (const entry of cache.values()) {
    if (matchesAnyPrefix(entry.url, prefixes)) markStale(entry)
  }
  for (const query of liveQueries) {
    if (query.currentUrl() !== null && matchesAnyPrefix(query.currentUrl() as string, prefixes)) {
      query.revalidate()
    }
  }
})

/**
 * Test-only: clear the module-level query cache, in-flight map, and live
 * query registry. Not part of the public API. A real page load gets a fresh
 * module instance (so these are naturally empty); only a test process
 * reuses the same module across cases, so `createQuery`'s own suite calls
 * this in `beforeEach` — including clearing `liveQueries`, since a test that
 * doesn't explicitly dispose its query would otherwise leave it subscribed
 * to invalidations published by a later, unrelated test.
 *
 * @internal
 */
export function __resetQueryCacheForTests(): void {
  cache.clear()
  inflight.clear()
  liveQueries.clear()
}

const NOT_A_DESCRIPTOR_MESSAGE =
  'createQuery: the request function must return an `http` request descriptor ' +
  '(http.get/query/head/post/put/patch/delete(...) from "@barefootjs/client"). ' +
  'A bare Promise or other async value is not a supported request source in v0 ' +
  '— see spec/async.md §7.2.'

/**
 * `createQuery(fn, options?)` — a value re-sent whenever a signal `fn` reads
 * changes. Returns `[value, action]`, the same `[getter, setter]`-shaped tuple
 * as `createSignal`. See spec/async.md §7 for the full model; the rules this
 * implementation follows (each pinned by its own describe block in
 * `create-query.test.ts`):
 *
 * 1. **Descriptors only.** `fn` must return an `http` descriptor; anything
 *    else throws synchronously, naming `createQuery`.
 * 2. **Tracking.** `fn` runs like an effect body — the signals it reads
 *    synchronously are its dependencies.
 * 3. **One send per tick.** Evaluating `fn` never sends by itself; each run
 *    records the descriptor it produced, and sending happens once, in a
 *    microtask at the end of the tick, for the *last* descriptor recorded.
 * 4. **Init rule.** `initial` present → the first send never happens; `fn`
 *    still runs once (pure) to learn the key, and `initial` is primed into
 *    the cache as fresh. `initial` absent → the first descriptor is sent.
 * 5. **Cache.** Keyed by `requestKey`, TTL `ttl` (default 15s). Fresh → no
 *    send. Stale → shown immediately, then re-fetched. Same key in flight →
 *    single-flight (one underlying request, shared).
 * 6. **Previous value retention.** While pending, and on failure, `value()`
 *    keeps the previous value; `error()` is cleared by the next success.
 * 7. **Generation guard.** Only the response for the latest send may write.
 * 8. **Action.** `action()` re-sends the current descriptor, bypassing
 *    freshness (but still single-flight), and returns `Promise<T>`.
 * 9. **Disposal.** Owned by the current reactive owner; in-flight
 *    resolutions are dropped after disposal and never write.
 * 10. **Invalidation (#3199).** Subscribed once, at module level, to
 *     `@barefootjs/shared`'s invalidation bus. A cache entry whose URL
 *     (method-agnostic) starts with a published prefix is marked stale — the
 *     next read re-fetches it (same as rule 5's stale case). A *live*
 *     query currently tracking a matching key re-sends immediately, through
 *     the same path as a stale cache hit (generation guard, single-flight,
 *     `isPending`), rather than waiting for its next dependency change. A
 *     disposed query does nothing.
 *
 * @since 0.38.0
 * @stability alpha
 */
export function createQuery<T>(
  fn: () => HttpDescriptor<T>,
  options: { initial: T; ttl?: number },
): [Reactive<() => T>, QueryAction<T>]
export function createQuery<T>(
  fn: () => HttpDescriptor<T>,
  options?: { initial?: undefined; ttl?: number },
): [Reactive<() => T | undefined>, QueryAction<T>]
export function createQuery<T>(
  fn: () => HttpDescriptor<T>,
  options: CreateQueryOptions<T> = {},
): [Reactive<() => T | undefined>, QueryAction<T>] {
  const ttl = options.ttl ?? DEFAULT_TTL_MS
  // "Present" means "not undefined", not "the key was supplied": mode B's
  // `initial: props.posts` (an optional prop) authors the key unconditionally,
  // but when the prop is actually absent at runtime there is no obtained
  // result to prime the cache with, so the query must behave exactly like
  // `initial` was omitted — first send happens, `value()` stays `undefined`
  // until it resolves.
  const hasInitial = options.initial !== undefined

  const [value, setValue] = createSignal<T | undefined>(hasInitial ? (options.initial as T) : undefined)
  const [isPending, setIsPending] = createSignal(false)
  const [error, setError] = createSignal<HttpError | Error | undefined>(undefined)

  let disposed = false
  let generation = 0
  let firstRun = true
  let pendingSend: { descriptor: HttpDescriptor<T>; key: string } | null = null
  // Key of the latest send while it is unsettled; `null` once it settles or
  // is superseded by a cache hit.
  let inflightKey: string | null = null
  let microtaskScheduled = false
  // The descriptor/key/URL the tracking effect last computed, kept live
  // (unlike `pendingSend`, which `flush()` clears) so rule 10's invalidation
  // subscriber can ask "what is this instance's *current* key" at any time,
  // not just while a send is pending.
  let liveDescriptor: HttpDescriptor<T> | null = null
  let liveKey: string | null = null
  let liveUrl: string | null = null

  // Rule 9: owned by the *current* reactive owner — the scope active when
  // `createQuery()` itself is called, not the internal tracking effect below.
  // Registered before the effect so disposal always wins a same-tick race
  // against a resolution that arrives after teardown.
  onCleanup(() => {
    disposed = true
  })

  // Rule 10: register/unregister with the module-level live-query registry
  // that the invalidation subscriber (declared once, above) walks. `disposed`
  // is also checked inside `revalidate` itself, since disposal and an
  // in-flight invalidation can race in the same tick.
  function revalidate(): void {
    if (disposed || liveDescriptor === null || liveKey === null) return
    // Same guard `flush()`'s cache-hit branch applies: a send already in
    // flight for this exact key will write when it settles — don't start a
    // second one (single-flight holds across an invalidation-triggered
    // re-send too).
    if (liveKey === inflightKey) return
    doSend(liveDescriptor, liveKey).catch(() => {})
  }
  const liveQuery: LiveQuery = { revalidate, currentUrl: () => liveUrl }
  liveQueries.add(liveQuery)
  onCleanup(() => {
    liveQueries.delete(liveQuery)
  })

  function flush(): void {
    microtaskScheduled = false
    const send = pendingSend
    pendingSend = null
    if (!send || disposed) return

    // The latest send is already fetching this exact key (e.g. an `action()`
    // force-send, then a re-run of `fn` that reads a signal the key doesn't
    // depend on): its resolution will write, so there is nothing to do. The
    // cache-hit branch below must not run here — its generation bump would
    // discard that send's result.
    if (send.key === inflightKey) return

    const cached = cache.get(send.key)
    if (cached) {
      // Rule 5 / rule 3's diamond exception: the value currently held for this
      // key is necessarily this same cache entry (every successful resolution
      // below writes it), so a fresh hit here is exactly "the last descriptor's
      // key equals the key of the value currently held" — nothing is sent.
      setValue(() => cached.value as T)
      setError(undefined)
      if (!isStale(cached, ttl)) {
        // Rule 7 covers this write too: the value now belongs to `send.key`,
        // so any send still in flight for an earlier key is superseded. Bump
        // the generation so its resolution cannot overwrite this value
        // (1 -> 2 -> 1 where the return to 1 is a cache hit), and clear
        // `isPending`, which described that superseded send.
        generation++
        inflightKey = null
        setIsPending(false)
        return
      }
      // Stale: shown now, re-fetched below — `doSend` bumps the generation
      // and keeps `isPending` true, so it is not toggled off in between.
    }

    // Errors from an internally-scheduled send are already observable via
    // `error()` — swallow the promise's own rejection here so a failing
    // dependency-driven refetch (nobody is `await`ing this call) doesn't
    // surface as an unhandled rejection. `action()` below returns `doSend`'s
    // promise directly instead, so a caller that awaits it still sees the
    // rejection.
    doSend(send.descriptor, send.key).catch(() => {})
  }

  function scheduleSend(descriptor: HttpDescriptor<T>, key: string): void {
    pendingSend = { descriptor, key }
    if (!microtaskScheduled) {
      microtaskScheduled = true
      scheduleMicrotask(flush)
    }
  }

  function doSend(descriptor: HttpDescriptor<T>, key: string): Promise<T> {
    const myGeneration = ++generation
    inflightKey = key
    setIsPending(true)

    let promise = inflight.get(key) as Promise<T> | undefined
    if (!promise) {
      promise = sendRequest<T>(descriptor).finally(() => {
        if (inflight.get(key) === promise) inflight.delete(key)
      })
      inflight.set(key, promise)
    }

    return promise.then(
      (result) => {
        // Rule 7 (generation guard) + rule 9 (disposal): an older or
        // post-disposal resolution never writes.
        if (!disposed && myGeneration === generation) {
          inflightKey = null
          cache.set(key, { value: result, timestamp: Date.now(), url: requestUrl(descriptor) })
          setValue(() => result)
          setError(undefined)
          setIsPending(false)
        }
        return result
      },
      (err) => {
        if (!disposed && myGeneration === generation) {
          inflightKey = null
          // `err` can be anything a rejected promise carries (some fetch
          // polyfills/test runtimes reject with a non-Error) — `error()`'s
          // documented type is `HttpError | Error`, so normalize anything
          // else into a real `Error` rather than lying about the type.
          setError(err instanceof Error ? err : new Error(String(err)))
          setIsPending(false)
        }
        throw err
      },
    )
  }

  createEffect(() => {
    const result = fn()
    if (!isHttpDescriptor(result)) {
      throw new Error(NOT_A_DESCRIPTOR_MESSAGE)
    }
    const descriptor = result as HttpDescriptor<T>
    const key = requestKey(descriptor)
    liveDescriptor = descriptor
    liveKey = key
    liveUrl = requestUrl(descriptor)

    if (firstRun) {
      firstRun = false
      if (hasInitial) {
        // Rule 4: learn the key, prime the cache, no send.
        cache.set(key, { value: options.initial as T, timestamp: Date.now(), url: liveUrl })
        return
      }
      scheduleSend(descriptor, key)
      return
    }

    scheduleSend(descriptor, key)
  })

  function action(): Promise<T> {
    if (disposed) {
      return Promise.reject(new Error('createQuery: action() called after the query was disposed.'))
    }
    // untrack: computing the descriptor to force-send must not register a
    // dependency on whatever reactive context called action() (e.g. a click
    // handler is not itself tracked, but this guards nested-effect callers too).
    const result = untrack(fn)
    if (!isHttpDescriptor(result)) {
      throw new Error(NOT_A_DESCRIPTOR_MESSAGE)
    }
    const descriptor = result as HttpDescriptor<T>
    const key = requestKey(descriptor)
    liveDescriptor = descriptor
    liveKey = key
    liveUrl = requestUrl(descriptor)
    // Rule 8: bypasses the freshness gate `flush()` applies — always sends
    // (joining an in-flight request for the same key via single-flight).
    return doSend(descriptor, key)
  }

  const boundAction = action as QueryAction<T>
  Object.defineProperty(boundAction, 'isPending', { value: isPending, enumerable: true })
  Object.defineProperty(boundAction, 'error', { value: error, enumerable: true })

  return [value, boundAction]
}
