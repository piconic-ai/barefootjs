/**
 * `createMutation` — async layer 0 runtime (spec/async.md §7, #3200). The
 * write counterpart to `createQuery` (#3157): a request is sent only when its
 * `action` is called, never automatically and never cached — a write is an
 * event, not a derivation.
 *
 * NOT exported yet: the compiler does not recognise the call until #3210
 * (spec/async.md §7.8's compiler-recognition gap), which also exports it
 * through `./async.ts` next to `createQuery`. Import it from this file
 * directly (tests, and that PR's own work) until then.
 */

import { createSignal, onCleanup, untrack, type Reactive } from '@barefootjs/client/reactive'
import { isSafeMethod, sendRequest, HttpError, type HttpDescriptor } from './http.ts'
import { assertHttpDescriptor, markRejectionHandled, normalizeError } from './request-descriptor.ts'
import { invalidate } from '@barefootjs/shared'

/**
 * Options `createMutation` accepts. Unlike `CreateQueryOptions`, there is no
 * `initial` — a mutation has no initial request to seed from (spec/async.md
 * §7.4); the compiler-side diagnostic for a caller who writes one anyway is
 * later work, not this runtime PR.
 *
 * @since 0.39.0
 * @stability alpha
 */
export interface CreateMutationOptions {
  /** URL prefixes (spec/async.md §7.4) to mark stale on success, riding the invalidation bus. */
  readonly invalidates?: readonly string[]
}

/**
 * The callable `action` a mutation returns alongside its value: sends the
 * request function's current descriptor when called, and carries two
 * reactive accessors.
 *
 * @since 0.39.0
 * @stability alpha
 */
export interface MutationAction<T> {
  /** Send now. Resolves with the value or rejects with the error — the caller's own promise, independent of `value()`/`error()`. The rejection is pre-handled, so an un-awaited call reports no unhandled rejection. */
  (): Promise<T>
  /** Whether the latest call has not settled. */
  readonly isPending: Reactive<() => boolean>
  /** The latest call's error, if it failed; cleared by the next success. */
  readonly error: Reactive<() => HttpError | Error | undefined>
}

/**
 * `createMutation(fn, options?)` — a value written only by calling the
 * returned action. Returns `[value, action]`, the same tuple shape as
 * `createQuery`. See spec/async.md §7.4/§7.5; the rules this implementation
 * follows (each pinned by its own describe block in
 * `create-mutation.test.ts`):
 *
 * 1. **Sends only when called.** Nothing at creation; nothing when a signal
 *    `fn` reads changes — there is no tracking effect at all. `fn` is
 *    evaluated **untracked** at call time, so it reads the signals' current
 *    values.
 * 2. **Descriptors only in v0.** Same rule as `createQuery`: anything else
 *    throws synchronously, naming `createMutation`.
 * 3. **No cache, no single-flight.** Every call sends its own request; two
 *    identical calls are two writes, never deduplicated.
 * 4. **Concurrent calls.** Each call's own returned promise settles with its
 *    own result, independent of the others. `value()`, `isPending()` and
 *    `error()` follow only the **latest** call (generation guard) — an older
 *    call settling later never overwrites them.
 * 5. **Value retention.** `value()` keeps the last successful result across
 *    a pending call and a failure; `error()` is cleared by the next success.
 * 6. **`invalidates`.** On success, `invalidate(prefixes)` (the bus from
 *    #3199) is called with `options.invalidates`. On failure, nothing is
 *    invalidated. This runs regardless of this instance's own disposal — the
 *    write already happened server-side, so other caches still need to know.
 *    With no `invalidates`, the bus is never touched.
 * 7. **Safe-method warning.** A `GET`/`HEAD`/`QUERY` descriptor still sends,
 *    but emits one `console.warn` (the first time only, per instance) naming
 *    `createQuery` as where a read belongs.
 * 8. **Disposal.** Owned by the current reactive owner. After disposal,
 *    calling the action rejects; a call already in flight at disposal still
 *    settles its own caller's promise, but its result never writes the
 *    signals.
 *
 * @since 0.39.0
 * @stability alpha
 */
export function createMutation<T>(
  fn: () => HttpDescriptor<T>,
  options: CreateMutationOptions = {},
): [Reactive<() => T | undefined>, MutationAction<T>] {
  const [value, setValue] = createSignal<T | undefined>(undefined)
  const [isPending, setIsPending] = createSignal(false)
  const [error, setError] = createSignal<HttpError | Error | undefined>(undefined)

  let disposed = false
  let generation = 0
  // Rule 7: at most one warning for the lifetime of this instance, however
  // many times `action()` is called.
  let warnedSafeMethod = false

  // Rule 8: owned by the *current* reactive owner — the scope active when
  // `createMutation()` itself is called.
  onCleanup(() => {
    disposed = true
  })

  function action(): Promise<T> {
    if (disposed) {
      return markRejectionHandled(Promise.reject(new Error('createMutation: action() called after the mutation was disposed.')))
    }
    // Rule 1: untracked, so calling this from a tracked context (a memo, an
    // effect) never registers a dependency, and `fn` reads the signals'
    // CURRENT values rather than whatever they were when this closure was
    // created.
    const descriptor = assertHttpDescriptor<T>(untrack(fn), 'createMutation')

    if (isSafeMethod(descriptor.method) && !warnedSafeMethod) {
      warnedSafeMethod = true
      console.warn(
        `createMutation: a safe method (${descriptor.method}) was sent as a mutation. ` +
          'A safe method is a read — use createQuery for it instead (spec/async.md §7.4).',
      )
    }

    // Rule 4: each call gets its own generation; only the latest may write
    // the shared signals when it settles.
    const myGeneration = ++generation
    setIsPending(true)

    // Rule 3: no `inflight` map, no cache lookup — always a fresh send.
    const sent = sendRequest<T>(descriptor).then(
      (result) => {
        if (!disposed && myGeneration === generation) {
          setValue(() => result)
          setError(undefined)
          setIsPending(false)
        }
        // Rule 6: fires on the write itself, not on whether this instance is
        // still around to observe it, and not gated by the generation guard
        // above — an older call's *own* success is still a real write that
        // happened, and still needs to invalidate.
        if (options.invalidates && options.invalidates.length > 0) {
          invalidate(options.invalidates)
        }
        return result
      },
      (err) => {
        if (!disposed && myGeneration === generation) {
          setError(normalizeError(err))
          setIsPending(false)
        }
        throw err
      },
    )
    return markRejectionHandled(sent)
  }

  const boundAction = action as MutationAction<T>
  Object.defineProperty(boundAction, 'isPending', { value: isPending, enumerable: true })
  Object.defineProperty(boundAction, 'error', { value: error, enumerable: true })

  return [value, boundAction]
}
