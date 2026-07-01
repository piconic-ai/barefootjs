/**
 * BarefootJS - Reactive Primitives
 *
 * Minimal reactive system for DOM manipulation.
 * Inspired by SolidJS signals.
 */

import { BF_SEAM_NAV_SEARCH, BF_SEAM_PUSH_SEARCH } from '@barefootjs/shared'

/**
 * Phantom brand for compile-time reactivity detection.
 * The compiler checks for the '__reactive' property via TypeChecker
 * to identify reactive expressions.
 */
export type Reactive<T> = T & { readonly __reactive: true }

export type Signal<T> = [
  /** Get current value (registers dependency when called inside effect) */
  Reactive<() => T>,
  /** Update value (accepts value or updater function) */
  (valueOrFn: T | ((prev: T) => T)) => void
]

export type CleanupFn = () => void
export type EffectFn = () => void | CleanupFn
export type Memo<T> = Reactive<() => T>

// -- Dev-only instrumentation (SR1 / SR8, #1690) ------------------------------
//
// A single, gated sink the reactive choke points call when profiling is on.
// When `profilerSink` is null (the production default) every choke point is a
// single null-check branch with no allocation, and the sink + id params
// dead-code-eliminate from prod builds since they are never set (#1690).
// The sink, its state, and the identity bookkeeping all live in this module
// because `reactive.ts` is published as one physical entry
// (`@barefootjs/client/reactive`); splitting the sink into a sibling file
// would bundle a second copy into this entry and break the live binding.

export type SubscriberKind = 'effect' | 'memo' | 'root'

/**
 * Reactive measurement hooks. Every method is a measurement-only notification —
 * implementations MUST NOT mutate reactive state or throw (a throw would change
 * `set()`'s synchronous semantics). Ids are stable handles; `''` means the
 * node was created while profiling was off. The compiler will later emit
 * IR-aligned ids (SR3); until then ids are runtime-assigned counters.
 */
export interface ProfilerEventSink {
  /** A signal's value changed (post `Object.is` bail). `batched` = inside `batch()`. */
  signalSet(signalId: string, batched: boolean): void
  /** A subscriber began reading a signal (dependency edge added). */
  subscribeAdd(signalId: string, subscriberId: string): void
  /** A subscriber stopped reading a signal (edge removed on re-run / dispose). */
  subscribeRemove(signalId: string, subscriberId: string): void
  /** An effect / memo / root scope was created. */
  effectCreate(subscriberId: string, kind: SubscriberKind): void
  /** An effect/memo body is about to run. */
  effectEnter(subscriberId: string): void
  /** An effect/memo body finished. `durationMs` is wall time. */
  effectExit(subscriberId: string, durationMs: number): void
  /**
   * An effect/memo run produced an output fingerprint (#1690, §4.2.2).
   * `changed` is `true` when the run produced new output (a memo value that
   * differs by `Object.is`, or a DOM write that changed the node) and `false`
   * when it recomputed but produced output identical to its previous run — a
   * *wasted* re-run. Emitted at most once per run, only for runs whose output
   * is fingerprintable (memo recompute / instrumented DOM write); a run that
   * reports no output emits no event and isn't counted as wasted.
   *
   * Optional: it was added after the initial sink contract, so a pre-existing
   * custom sink that omits it stays valid (the call site guards with `?.`). A
   * sink without it simply opts out of the wasted-re-runs analysis.
   */
  effectOutput?(subscriberId: string, changed: boolean): void
  /** An effect / memo / root scope was disposed. */
  effectDispose(subscriberId: string): void
  /** A `batch()` block opened at the given (post-increment) depth. */
  batchBegin(depth: number): void
  /** A batch flush ran `flushed` effects. */
  batchFlush(flushed: number): void
  /**
   * A user interaction (one event handler invocation) began. Compiler-emitted
   * `beginTurn(...)` wraps the handler body so subsequent events in this turn
   * are attributed to `handlerId`. `loc` is the optional source location.
   */
  turnBegin(handlerId: string, loc?: string): void
  /** The current turn ended (handler returned). */
  turnEnd(): void
}

/** A signal's subscriber set, tagged with the signal's id for edge-removal events. */
type SubscriberSet = Set<EffectContext> & { __bfSignalId?: string }

let profilerSink: ProfilerEventSink | null = null
let signalSeq = 0
let subscriberSeq = 0

/**
 * Install (or clear) the dev-only reactive measurement sink. Pass `null` to
 * disable. Calling this before a scenario runs lets `bf debug profile` collect
 * the event stream; production code never calls it, so the sink stays null and
 * the choke points stay free (dev-only instrumentation, #1690).
 */
export function setProfilerSink(sink: ProfilerEventSink | null): void {
  profilerSink = sink
}

/**
 * Mark the start of a user-interaction turn (#1690, SR3). Compiler-emitted in
 * profile mode at every event-handler boundary as
 * `beginTurn(handlerId, loc); try { … } finally { endTurn() }`. Measurement
 * only — it does not change `set()`'s synchronous semantics; it just stamps a
 * turn onto the events emitted between begin and end. No-op when profiling is
 * off.
 */
export function beginTurn(handlerId: string, loc?: string): void {
  if (profilerSink) profilerSink.turnBegin(handlerId, loc)
}

/** Mark the end of the current interaction turn (#1690, SR3). */
export function endTurn(): void {
  if (profilerSink) profilerSink.turnEnd()
}

/**
 * Report the current run's output fingerprint (#1690, §4.2.2). Called from the
 * places that produce an effect's observable output — a memo recompute (the
 * written value's `Object.is` identity) and instrumented DOM writes (whether the
 * node actually changed). Accumulated onto the running effect (`Owner`) and
 * flushed as one `effectOutput` event at run exit, so several writes in one run
 * collapse to a single "did this run change anything" verdict.
 *
 * No-op when profiling is off or called outside a run — the wasted-re-runs
 * analysis is the only consumer and it lives behind the dev-only sink (SR8).
 */
export function __bfReportOutput(changed: boolean): void {
  if (!profilerSink || !Owner) return
  Owner.outputReported = true
  if (changed) Owner.outputChanged = true
}

type EffectContext = {
  fn: EffectFn
  cleanup: CleanupFn | null
  dependencies: Set<SubscriberSet>
  owner: EffectContext | null   // Parent scope for hierarchical disposal
  children: EffectContext[]     // Owned child effects/roots
  disposed: boolean
  runCount: number              // Per-effect re-entry counter for circular dependency detection
  id: string                    // Dev instrumentation id ('' when profiling is off)
  kind: SubscriberKind          // effect | memo | root
  // Per-run output fingerprint accumulator (SR1, §4.2.2). Reset at the start of
  // every run; set by `__bfReportOutput` (memo recompute / DOM write) during the
  // body; flushed as one `effectOutput` event at exit. Dev-only — untouched when
  // profiling is off.
  outputReported: boolean
  outputChanged: boolean
}

let Owner: EffectContext | null = null
let Listener: EffectContext | null = null
const MAX_EFFECT_RUNS = 100

let BatchDepth = 0
const PendingEffects = new Set<EffectContext>()

/**
 * Create a reactive value
 *
 * @param initialValue - Initial value
 * @returns [getter, setter] tuple
 *
 * @example
 * const [count, setCount] = createSignal(0)
 * count()              // 0
 * setCount(5)          // Update to 5
 * setCount(n => n + 1) // Update with function (becomes 6)
 */
export function createSignal<T>(initialValue: T, __bfId?: string): Signal<T> {
  let value = initialValue
  const subscribers: SubscriberSet = new Set<EffectContext>()
  // Tag the subscriber set so edge-removal events (which only see the set) can
  // name the signal. Resolved once per creation; '' when profiling is off.
  const id = __bfId ?? (profilerSink ? `s${++signalSeq}` : '')
  subscribers.__bfSignalId = id

  const get = () => {
    if (Listener) {
      subscribers.add(Listener)
      Listener.dependencies.add(subscribers)
      if (profilerSink) profilerSink.subscribeAdd(id, Listener.id)
    }
    return value
  }

  const set = (valueOrFn: T | ((prev: T) => T)) => {
    const newValue = typeof valueOrFn === 'function'
      ? (valueOrFn as (prev: T) => T)(value)
      : valueOrFn

    if (Object.is(value, newValue)) {
      return
    }

    value = newValue

    if (profilerSink) profilerSink.signalSet(id, BatchDepth > 0)

    if (BatchDepth > 0) {
      for (const effect of subscribers) {
        PendingEffects.add(effect)
      }
    } else {
      const effectsToRun = [...subscribers]
      for (const effect of effectsToRun) {
        runEffect(effect)
      }
    }
  }

  return [get, set] as Signal<T>
}

/**
 * Side effect that runs automatically when signals change
 *
 * @param fn - Effect function (can return a cleanup function)
 *
 * @example
 * const [count, setCount] = createSignal(0)
 * createEffect(() => {
 *   console.log("count changed:", count())
 * })
 * setCount(1)  // Logs "count changed: 1"
 */
export function createEffect(fn: EffectFn, __bfId?: string, __bfKind: SubscriberKind = 'effect'): void {
  // Note: Nested effects are now allowed. runEffect() properly saves/restores
  // prevEffect, so nested effects correctly track their own dependencies.
  // This enables synchronous component initialization in reconcileList.

  const effect: EffectContext = {
    fn,
    cleanup: null,
    dependencies: new Set(),
    owner: Owner,
    children: [],
    disposed: false,
    runCount: 0,
    id: __bfId ?? (profilerSink ? `e${++subscriberSeq}` : ''),
    kind: __bfKind,
    outputReported: false,
    outputChanged: false,
  }

  if (profilerSink) profilerSink.effectCreate(effect.id, effect.kind)

  // Register with parent owner for hierarchical disposal
  if (Owner) Owner.children.push(effect)

  runEffect(effect)
}

function runEffect(effect: EffectContext): void {
  if (effect.disposed) return

  effect.runCount++
  if (effect.runCount > MAX_EFFECT_RUNS) {
    effect.runCount = 0
    throw new Error(`Circular dependency detected: effect re-entered itself ${MAX_EFFECT_RUNS} times.`)
  }

  // `effectEnter` is emitted *before* cleanup so the whole run — cleanup
  // included — is bracketed by enter/exit. A `set()` performed inside a cleanup
  // is then recorded at effect-stack depth > 0 (a cascade write) rather than
  // depth 0 (a direct handler write), which keeps the batch advisor's write
  // gate sound (#1865). Dev-only: in production `profilerSink` is null and this
  // is a no-op, so the run is byte-identical to the un-instrumented path.
  if (profilerSink) profilerSink.effectEnter(effect.id)

  if (effect.cleanup) {
    effect.cleanup()
    effect.cleanup = null
  }

  for (const dep of effect.dependencies) {
    dep.delete(effect)
    if (profilerSink) profilerSink.subscribeRemove(dep.__bfSignalId ?? '', effect.id)
  }
  effect.dependencies.clear()

  const prevOwner = Owner
  const prevListener = Listener
  Owner = effect
  Listener = effect

  // Fresh output fingerprint for this run (§4.2.2); `__bfReportOutput` fills it.
  effect.outputReported = false
  effect.outputChanged = false

  // `start` stays here (after cleanup) so the reported duration measures the
  // effect body only, unchanged by moving `effectEnter` above.
  const start = profilerSink ? performance.now() : 0

  try {
    const result = effect.fn()
    if (typeof result === 'function') {
      effect.cleanup = result
    }
  } finally {
    Owner = prevOwner
    Listener = prevListener
    effect.runCount--
    if (profilerSink) {
      profilerSink.effectExit(effect.id, performance.now() - start)
      if (effect.outputReported) profilerSink.effectOutput?.(effect.id, effect.outputChanged)
    }
  }
}

/**
 * Dispose an effect and its entire owned subtree, without touching the
 * parent's `children` list. Internal to `disposeEffect` — every recursive
 * step uses this path so cascade disposal can never mutate a list it's
 * currently iterating over.
 */
function disposeSubtree(effect: EffectContext): void {
  if (effect.disposed) return
  effect.disposed = true

  for (const child of effect.children) {
    disposeSubtree(child)
  }
  effect.children.length = 0

  if (effect.cleanup) {
    effect.cleanup()
    effect.cleanup = null
  }

  for (const dep of effect.dependencies) {
    dep.delete(effect)
    if (profilerSink) profilerSink.subscribeRemove(dep.__bfSignalId ?? '', effect.id)
  }
  effect.dependencies.clear()

  if (profilerSink) profilerSink.effectDispose(effect.id)

  effect.owner = null
}

/**
 * Public dispose entry point: detach `effect` from its parent's `children`
 * list, then dispose the subtree rooted at `effect`. The detach step lives
 * only here so the recursion (which doesn't need it — the parent clears
 * `children.length = 0` itself) cannot splice entries out of the array
 * it is iterating. The splice-during-iter shape was the root cause of
 * #1366; separating the two responsibilities makes it structurally
 * unreachable.
 */
function disposeEffect(effect: EffectContext): void {
  if (effect.disposed) return

  if (effect.owner) {
    const idx = effect.owner.children.indexOf(effect)
    if (idx >= 0) effect.owner.children.splice(idx, 1)
  }

  disposeSubtree(effect)
}

/**
 * Create an isolated reactive scope with explicit disposal.
 * All effects/memos created inside run within this root and are
 * disposed together when the returned dispose function is called.
 *
 * Used internally by mapArray for per-item reactive scopes.
 *
 * @param fn - Function to run in the new scope. Receives a dispose function.
 * @returns The return value of fn
 */
export function createRoot<T>(fn: (dispose: () => void) => T): T {
  const root: EffectContext = {
    fn: () => {},
    cleanup: null,
    dependencies: new Set(),
    owner: Owner,
    children: [],
    disposed: false,
    runCount: 0,
    id: profilerSink ? `r${++subscriberSeq}` : '',
    kind: 'root',
    outputReported: false,
    outputChanged: false,
  }

  if (profilerSink) profilerSink.effectCreate(root.id, 'root')

  if (Owner) Owner.children.push(root)

  const prevOwner = Owner
  const prevListener = Listener
  Owner = root
  Listener = null  // Isolate: signal reads inside root don't track in parent effect

  try {
    return fn(() => disposeEffect(root))
  } finally {
    Owner = prevOwner
    Listener = prevListener
  }
}

/**
 * Create an effect that can be explicitly disposed (unsubscribed from all signals).
 * Used for effects inside conditional branches that need cleanup on branch switch.
 *
 * @returns A dispose function that stops the effect and removes it from all signal dependencies.
 */
export function createDisposableEffect(fn: EffectFn, __bfId?: string): () => void {
  let disposed = false

  const effect: EffectContext = {
    fn: () => {
      if (disposed) return  // Prevent re-activation after disposal
      return fn()
    },
    cleanup: null,
    dependencies: new Set(),
    owner: Owner,
    children: [],
    disposed: false,
    runCount: 0,
    id: __bfId ?? (profilerSink ? `e${++subscriberSeq}` : ''),
    kind: 'effect',
    outputReported: false,
    outputChanged: false,
  }

  if (profilerSink) profilerSink.effectCreate(effect.id, effect.kind)

  if (Owner) Owner.children.push(effect)

  runEffect(effect)

  return () => {
    disposeEffect(effect)
  }
}

/**
 * Register cleanup function for effects
 *
 * @param fn - Cleanup function
 *
 * @example
 * createEffect(() => {
 *   const timer = setInterval(() => console.log('tick'), 1000)
 *   onCleanup(() => clearInterval(timer))
 * })
 */
export function onCleanup(fn: CleanupFn): void {
  if (Owner) {
    const effect = Owner
    const prevCleanup = effect.cleanup
    effect.cleanup = () => {
      if (prevCleanup) prevCleanup()
      fn()
    }
  }
}

/**
 * Run a function without tracking signal dependencies
 *
 * @param fn - Function to run without tracking
 * @returns The return value of fn
 *
 * @example
 * createEffect(() => {
 *   const value = untrack(() => someSignal()) // won't re-run when someSignal changes
 *   console.log(value)
 * })
 */
export function untrack<T>(fn: () => T): T {
  const prevListener = Listener
  Listener = null
  try {
    return fn()
  } finally {
    Listener = prevListener
  }
}

/**
 * Batch multiple signal updates and propagate once
 *
 * Collects all signal writes inside `fn`, then flushes
 * dependent effects after `fn` returns. Duplicate effects
 * are deduplicated, so a deep memo chain only propagates once
 * regardless of how many times the source signal was written.
 *
 * Batches can be nested — effects flush when the outermost batch ends.
 *
 * @param fn - Function containing signal writes to batch
 * @returns The return value of fn
 *
 * @example
 * const [a, setA] = createSignal(0)
 * const [b, setB] = createSignal(0)
 * batch(() => {
 *   setA(1)  // queued
 *   setB(2)  // queued
 * })
 * // effects run once here, not twice
 */
export function batch<T>(fn: () => T): T {
  BatchDepth++
  if (profilerSink) profilerSink.batchBegin(BatchDepth)
  try {
    return fn()
  } finally {
    BatchDepth--
    if (BatchDepth === 0) {
      flushEffects()
    }
  }
}

function flushEffects(): void {
  while (PendingEffects.size > 0) {
    const effects = [...PendingEffects]
    PendingEffects.clear()
    if (profilerSink) profilerSink.batchFlush(effects.length)
    for (const effect of effects) {
      runEffect(effect)
    }
  }
}

/**
 * Run a function once when the component mounts
 *
 * Thin wrapper around createEffect for one-time mount code.
 * The function runs immediately and does not track any dependencies.
 *
 * @param fn - Function to run on mount
 *
 * @example
 * onMount(() => {
 *   console.log('Component mounted!')
 *   onCleanup(() => console.log('Component unmounted!'))
 * })
 */
export function onMount(fn: () => void): void {
  createEffect(() => untrack(fn))
}

/**
 * Create a memoized computed value
 *
 * A derived signal that:
 * - Tracks dependencies automatically (like createEffect)
 * - Caches the computed result
 * - Acts as a read-only signal (can be used as dependency by other effects/memos)
 *
 * @param fn - Computation function that returns a value
 * @returns Getter function for the memoized value
 *
 * @example
 * const [count, setCount] = createSignal(2)
 * const doubled = createMemo(() => count() * 2)
 * doubled()    // 4
 * setCount(5)
 * doubled()    // 10
 */
export function createMemo<T>(fn: () => T, __bfId?: string): Memo<T> {
  // A memo is an effect that writes a private signal. Share one id across both
  // so the profiler's IR join can collapse the effect-run + signal-set pair
  // back into a single memo node (#1690).
  const id = __bfId ?? (profilerSink ? `m${++subscriberSeq}` : '')
  const [value, setValue] = createSignal<T>(undefined as T, id)

  // Memo output fingerprint (§4.2.2): a recompute that yields an `Object.is`-equal
  // value is a wasted re-run. Tracked here (not via the private signal's bail)
  // so the first run reads as a genuine output, never as "unchanged".
  let prev: T
  let hasPrev = false

  createEffect(() => {
    const result = fn()
    if (profilerSink) {
      __bfReportOutput(!hasPrev || !Object.is(prev, result))
      prev = result
      hasPrev = true
    }
    setValue(() => result)
  }, id, 'memo')

  return value
}


// ---------------------------------------------------------------------------
// Request-scoped environment signals (router v0.5, spec/router.md "The wedge")
// ---------------------------------------------------------------------------
//
// An environment signal is ambient request/browser state — the query string,
// later cookies — that is correct per-request under SSR (read from the adapter's
// per-request context, never a process-wide module global, which would race) and
// reactive on the client (a query-only navigation updates it with no swap and no
// re-hydration; islands reconcile fine-grained). It rides the `Reactive<>` brand,
// so the compiler's reactivity analysis wires DOM updates with no new feature.
//
// These live HERE, in the single physical `@barefootjs/client/reactive` module,
// for the same reason the signal primitives do: both `@barefootjs/client` and
// the `/runtime` entry re-export them from this one module, so a page has ONE
// `searchParams` signal instance regardless of which entry an island imports
// from. A relative copy bundled into each entry would create two disconnected
// signals — the #1910 failure (the router would push into one while an island
// reads the other).
//
// No import-time side effect: the underlying signal is created lazily on first
// read and the router push seam is installed there (not at module top-level), so
// reading is the only thing that materialises anything.

/**
 * SSR reader for request-scoped environment signals, keyed by env id
 * (`'search'` today; `'cookie'` etc. later). Injected by an adapter / host so
 * each value resolves per-request inside the host's async context — no shared
 * mutable server state. ONE keyed reader serves every env signal, so a new
 * signal needs no new seam or setter.
 */
let serverEnvReader: ((key: string) => string | undefined) | null = null

/**
 * Adapter/host hook: teach `@barefootjs/client` how to read the current
 * request's environment values during SSR. The reader receives an env key
 * (`'search'`, …) and returns the raw value, or `undefined` to defer (to the
 * `globalThis` seam, else the empty default). Call once with a reader that
 * resolves per-request.
 */
export function __bfSetServerEnvReader(
  reader: ((key: string) => string | undefined) | null,
): void {
  serverEnvReader = reader
}

/**
 * Resolve a request-scoped env value during SSR: the reader set via
 * {@link __bfSetServerEnvReader}, else a `globalThis.__bf_serverEnvReader` seam
 * — so a host can wire request-scoped SSR *without* importing
 * `@barefootjs/client` (the server-side analogue of the `window.__bf_*` client
 * seams). `undefined` when no reader resolves the key.
 */
function resolveServerEnv(key: string): string | undefined {
  if (serverEnvReader) {
    const v = serverEnvReader(key)
    if (v !== undefined) return v
  }
  const seam = (
    globalThis as unknown as { __bf_serverEnvReader?: (key: string) => string | undefined }
  ).__bf_serverEnvReader
  return typeof seam === 'function' ? seam(key) : undefined
}

/**
 * Build a request-scoped reactive environment signal, keyed by `key` — the env
 * id the SSR reader resolves (`'search'`, …) — as a `createSignal`-shaped
 * `[getter, setter]` tuple. Internal: only concrete factories
 * (`createSearchParams`, …) are exported.
 *
 * The tuple shape is deliberate (#2057): the compiler recognises the getter
 * *structurally* — the same path as `createSignal` — so it needs no env-signal
 * name allow-list, and the getter is pure-within-render for the block fold. The
 * setter is the single imperative navigation path.
 */
function createEnvSignal<T>(
  key: string,
  readClient: () => string,
  parse: (raw: string) => T,
  pushSeam: string,
  navSeam: string,
): readonly [Reactive<() => T>, (nextRaw: string) => void] {
  let getRaw: (() => string) | null = null

  function ensureClientSignal(): string {
    if (!getRaw) {
      const [get, set] = createSignal(readClient())
      getRaw = get
      // Install the router push seam inside the lazily-invoked accessor (not at
      // module top-level), so reading is the only thing with an effect.
      const w = window as unknown as Record<string, (next: string) => void>
      // `set` already bails on `Object.is` equality, so no equality guard is
      // needed — and a `get()` here would register a spurious dependency if a
      // caller ever pushed from inside an effect.
      w[pushSeam] = (next: string) => {
        set(next)
      }
    }
    return getRaw()
  }

  const getter = (() => {
    if (typeof window === 'undefined') {
      // SSR: resolve per-call inside the host's request context. Never cache a
      // module-level signal — it would be a process-wide global that races.
      return parse(resolveServerEnv(key) ?? '')
    }
    return parse(ensureClientSignal())
  }) as Reactive<() => T>

  // Imperative navigation. The setter writes the new raw value through the
  // router's nav seam (soft, same-route query navigation) when a router has
  // installed it; otherwise it hard-navigates — "never worse than an MPA" — so
  // the write is correct standalone. The getter is then updated by the router
  // through `pushSeam`, keeping read reactivity in one place. On the server a
  // setter call is a no-op (there is nothing to navigate).
  const setter = (nextRaw: string) => {
    if (typeof window === 'undefined') return
    const w = window as unknown as Record<string, ((next: string) => void) | undefined>
    const nav = w[navSeam]
    if (typeof nav === 'function') {
      nav(nextRaw)
      return
    }
    window.location.search = nextRaw
  }

  return [getter, setter] as const
}

/** Accepted inputs for `setSearchParams` — a raw query string (with or without
 *  a leading `?`), a `URLSearchParams`, or a plain record (array = multi-value,
 *  form-encoded like the client `queryHref`, cf. #2048). */
export type SearchParamsInit =
  | string
  | URLSearchParams
  | Record<string, string | readonly string[]>

function toSearchString(next: SearchParamsInit): string {
  let usp: URLSearchParams
  if (next instanceof URLSearchParams) {
    usp = next
  } else if (typeof next === 'string') {
    usp = new URLSearchParams(next.startsWith('?') ? next.slice(1) : next)
  } else {
    usp = new URLSearchParams()
    for (const [k, v] of Object.entries(next)) {
      if (Array.isArray(v)) {
        for (const item of v) usp.append(k, item)
      } else {
        usp.append(k, v as string)
      }
    }
  }
  const s = usp.toString()
  return s ? `?${s}` : ''
}

const [searchParamsGetter, setSearchParamsRaw] = createEnvSignal(
  'search',
  () => window.location.search,
  (raw) => new URLSearchParams(raw),
  BF_SEAM_PUSH_SEARCH,
  BF_SEAM_NAV_SEARCH,
)

/**
 * `createSearchParams()` — the request-scoped query-string env signal, returned
 * as a `createSignal`-shaped `[getter, setter]` tuple (#2057):
 *
 * ```tsx
 * const [searchParams, setSearchParams] = createSearchParams()
 * const sort = createMemo(() => searchParams().get('sort') ?? 'recent')
 * // …
 * setSearchParams({ sort: 'price' })   // imperative, same-route navigation
 * ```
 *
 * **Read** (`searchParams()`): the current query as `URLSearchParams`. A
 * same-route, query-only navigation (`/list?sort=price`) driven by
 * `@barefootjs/router` updates this signal and the URL **without a swap or
 * re-hydration**. On the server it reflects the current request's query.
 * Reactivity is **router-driven**: the signal is seeded once on first read and
 * thereafter updated only through the `window.__bf_pushSearch` seam, which
 * `startRouter()` drives (including on `popstate`).
 *
 * **Write** (`setSearchParams(next)`): the single imperative navigation path —
 * a soft same-route navigation when a router is running, a hard navigation
 * otherwise. This replaces mutating a live `URLSearchParams` reader (which only
 * ever changed a throwaway copy), so there is exactly one way to change the
 * query.
 *
 * Every call returns the same request-scoped getter/setter — there is one query
 * per document, so the tuple is a stable view, not per-call state.
 */
const setSearchParams = (next: SearchParamsInit): void => setSearchParamsRaw(toSearchString(next))
const searchParamsTuple: readonly [
  Reactive<() => URLSearchParams>,
  (next: SearchParamsInit) => void,
] = [searchParamsGetter, setSearchParams]

export function createSearchParams(): readonly [
  Reactive<() => URLSearchParams>,
  (next: SearchParamsInit) => void,
] {
  return searchParamsTuple
}
