/**
 * Built-in lowering plugins — shipped with the compiler and applied by default,
 * with no `barefoot.config.ts` registration required (#2057).
 *
 * These use the *exact same* {@link LoweringPlugin} seam as userland plugins.
 * "Built-in" means only that the compiler registers them itself, so consumers
 * get them for free. This is deliberate: it keeps a first-party API like
 * `queryHref` from being a bespoke special-case branch in every adapter. Instead
 * of each adapter carrying an `if (isQueryHref) …` recognizer, `queryHref` is a
 * pre-registered plugin — indistinguishable, at the adapter, from any other. The
 * adapters have one path (registry matcher → neutral node → render), and the
 * only queryHref-specific knowledge left is the plugin registration below.
 */

import type { LoweringPlugin } from './lowering-registry.ts'
import { registerLoweringPlugin } from './lowering-registry.ts'
import { queryHrefLocalNames } from './adapters/env-signal.ts'
import { matchQueryHrefCall } from './query-href-lowering.ts'
import { datePlugin } from './date-lowering.ts'

/**
 * `queryHref(base, { … })` — the pure URL-query builder (#2042). Its runtime
 * lives in `@barefootjs/client`; this plugin recognises the call structurally
 * and returns a backend-neutral `guard-list` on the `query` helper, which each
 * adapter maps to its own runtime helper (`bf_query` / `bf->query` / `$bf.query`).
 * `prepare` resolves the local names `queryHref` is imported under once per
 * component; a component that never imports it gets no matcher (the adapter skips
 * it entirely).
 */
export const queryHrefPlugin: LoweringPlugin = {
  name: 'queryHref',
  prepare(metadata) {
    const locals = queryHrefLocalNames(metadata)
    if (locals.size === 0) return null
    return (callee, args) => {
      const q = matchQueryHrefCall(callee, args, locals)
      return q
        ? { kind: 'guard-list', helper: 'query', base: q.base, triples: q.triples }
        : null
    }
  },
}

/** Every plugin the compiler ships and applies by default. */
export const BUILTIN_LOWERING_PLUGINS: readonly LoweringPlugin[] = [queryHrefPlugin, datePlugin]

/**
 * Register the built-in plugins into the shared registry. Called for its side
 * effect when `@barefootjs/jsx` is loaded (see `index.ts`), so adapters see
 * `queryHref` without any explicit setup. Idempotent — `registerLoweringPlugin`
 * dedups by name, so re-invoking (e.g. after a test reset) can't stack copies.
 */
export function registerBuiltinLoweringPlugins(): void {
  for (const plugin of BUILTIN_LOWERING_PLUGINS) registerLoweringPlugin(plugin)
}
