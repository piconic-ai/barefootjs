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

type EffectContext = {
  fn: EffectFn
  cleanup: CleanupFn | null
  dependencies: Set<Set<EffectContext>>
}

let Owner: EffectContext | null = null
let Listener: EffectContext | null = null
let effectDepth = 0
const MAX_EFFECT_RUNS = 100

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
export function createSignal<T>(initialValue: T): Signal<T> {
  let value = initialValue
  const subscribers = new Set<EffectContext>()

  const get = () => {
    if (Listener) {
      subscribers.add(Listener)
      Listener.dependencies.add(subscribers)
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

    const effectsToRun = [...subscribers]
    for (const effect of effectsToRun) {
      runEffect(effect)
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
export function createEffect(fn: EffectFn): void {
  // Note: Nested effects are now allowed. runEffect() properly saves/restores
  // prevEffect, so nested effects correctly track their own dependencies.
  // This enables synchronous component initialization in reconcileList.

  const effect: EffectContext = {
    fn,
    cleanup: null,
    dependencies: new Set(),
  }

  runEffect(effect)
}

function runEffect(effect: EffectContext): void {
  effectDepth++
  if (effectDepth > MAX_EFFECT_RUNS) {
    effectDepth = 0
    throw new Error(`Effect exceeded maximum run limit (${MAX_EFFECT_RUNS}). Possible circular dependency.`)
  }

  if (effect.cleanup) {
    effect.cleanup()
    effect.cleanup = null
  }

  for (const dep of effect.dependencies) {
    dep.delete(effect)
  }
  effect.dependencies.clear()

  const prevOwner = Owner
  const prevListener = Listener
  Owner = effect
  Listener = effect

  try {
    const result = effect.fn()
    if (typeof result === 'function') {
      effect.cleanup = result
    }
  } finally {
    Owner = prevOwner
    Listener = prevListener
    effectDepth--
  }
}

/**
 * Create an effect that can be explicitly disposed (unsubscribed from all signals).
 * Used for effects inside conditional branches that need cleanup on branch switch.
 *
 * @returns A dispose function that stops the effect and removes it from all signal dependencies.
 */
export function createDisposableEffect(fn: EffectFn): () => void {
  const effect: EffectContext = {
    fn,
    cleanup: null,
    dependencies: new Set(),
  }

  runEffect(effect)

  return () => {
    if (effect.cleanup) {
      effect.cleanup()
      effect.cleanup = null
    }
    for (const dep of effect.dependencies) {
      dep.delete(effect)
    }
    effect.dependencies.clear()
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
export function createMemo<T>(fn: () => T): Memo<T> {
  const [value, setValue] = createSignal<T>(undefined as T)

  createEffect(() => {
    const result = fn()
    setValue(() => result)
  })

  return value
}

