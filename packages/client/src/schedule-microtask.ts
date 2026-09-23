/**
 * Cross-runtime microtask scheduler. `queueMicrotask` is widely supported but
 * absent in some test DOMs / older runtimes; fall back to
 * `Promise.resolve().then(...)` so a module scheduling work "once per tick"
 * never throws on an environment missing the global.
 *
 * Shared by `runtime/hydrate.ts` (the document-order hydration walk) and
 * `create-query.ts` (the "one send per tick" flush) — both coalesce
 * synchronous work into a single end-of-tick callback and need the same
 * fallback, so this is the one implementation both call rather than two
 * copies that could drift.
 */
export const scheduleMicrotask: (cb: () => void) => void =
  typeof queueMicrotask === 'function'
    ? queueMicrotask
    : (cb) => {
        Promise.resolve().then(cb)
      }
