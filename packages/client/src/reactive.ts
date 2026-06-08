/**
 * BarefootJS - Reactive Primitives
 *
 * Minimal reactive system for DOM manipulation.
 * Inspired by SolidJS signals.
 */

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
// single null-check branch with no allocation — see `spec/profiler.md` SR8.
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
  /** An effect / memo / root scope was disposed. */
  effectDispose(subscriberId: string): void
  /** A `batch()` block opened at the given (post-increment) depth. */
  batchBegin(depth: number): void
  /** A batch flush ran `flushed` effects. */
  batchFlush(flushed: number): void
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
 * the choke points stay free. See `spec/profiler.md`.
 */
export function setProfilerSink(sink: ProfilerEventSink | null): void {
  profilerSink = sink
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

  const start = profilerSink ? performance.now() : 0
  if (profilerSink) profilerSink.effectEnter(effect.id)

  try {
    const result = effect.fn()
    if (typeof result === 'function') {
      effect.cleanup = result
    }
  } finally {
    Owner = prevOwner
    Listener = prevListener
    effect.runCount--
    if (profilerSink) profilerSink.effectExit(effect.id, performance.now() - start)
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
  // back into a single memo node (spec/profiler.md SR1).
  const id = __bfId ?? (profilerSink ? `m${++subscriberSeq}` : '')
  const [value, setValue] = createSignal<T>(undefined as T, id)

  createEffect(() => {
    const result = fn()
    setValue(() => result)
  }, id, 'memo')

  return value
}

