/**
 * Call-lowering plugin registry (#2057).
 *
 * The compiler core carries no specific runtime-API names. Instead, a lowering
 * plugin *recognises* a call — by the import it comes from and its argument
 * shape — and returns a **backend-neutral `LoweringNode`**. Each adapter renders
 * that node in its own template syntax. This is a deliberate two-layer split:
 *
 *   - **Layer 1 (this module + plugins):** adapter-agnostic. A plugin matches a
 *     call to a neutral node and never mentions Go/Perl/… syntax.
 *   - **Layer 2 (adapters):** plugin-agnostic. Each adapter has ONE renderer per
 *     node kind, so SSR/CSR parity is enforced once, not per plugin.
 *
 * A first-party package registers its plugin via {@link registerLoweringPlugin}
 * (a side-effect import at build time). Today the only plugin is `queryHref`,
 * still registered by core below; #2057 PR-3 moves that registration into the
 * `@barefootjs/router` layer and removes it from core, at which point core holds
 * zero runtime-API names. The registry itself is the durable *mechanism*.
 *
 * This is NOT the "output-rewriting hook" CLAUDE.md forbids: a plugin returns a
 * structured IR node, never a rewritten output string, so the compiler's output
 * stays determined by the compiler, not by whatever munges the emitted text.
 */

import type { ParsedExpr } from './expression-parser.ts'
import type { IRMetadata } from './types.ts'
import { matchQueryHrefCall } from './query-href-lowering.ts'
import { queryHrefLocalNames } from './adapters/env-signal.ts'

/**
 * A backend-neutral include triple for a {@link LoweringNode} `guard-list`.
 * `guard` is the conditional test of a `key: cond ? v : <omit>` include, or null
 * for a plain `key: v` (included purely on value-truthiness). An adapter renders
 * the guard to decide inclusion; the *runtime helper* then applies the emptiness
 * / array-append rules to the value. (Structurally identical to the query-href
 * lowering's own triple, which the `queryHref` plugin passes through unchanged.)
 */
export interface LoweringTriple {
  guard: ParsedExpr | null
  key: string
  value: ParsedExpr
}

/**
 * A backend-neutral lowering result. Adapters render each variant in their own
 * template language; the shapes carry everything a renderer needs and nothing
 * adapter-specific.
 */
export type LoweringNode =
  /**
   * A guard/key/value include list lowered to a query helper — the shape of
   * `queryHref(base, { … })`. `helper` is the logical helper id (`'query'`),
   * which each adapter maps to its own runtime helper (`bf_query` in go,
   * `bf->query` in mojo, `$bf.query` in xslate). Each triple's `guard` controls
   * inclusion; the runtime helper then applies the non-empty / array-append
   * rules to the value (so an included-but-empty value is dropped and array
   * members are appended), matching the client `queryHref` exactly. Adapters
   * MUST switch on `helper` — a `guard-list` is not implicitly `query`.
   */
  | { kind: 'guard-list'; helper: string; base: ParsedExpr; triples: LoweringTriple[] }
  /**
   * A plain helper call `helper(...args)` — the general escape hatch for a pure
   * builder that lowers to a single runtime-helper invocation. Unused today;
   * present so the neutral vocabulary isn't single-purpose.
   */
  | { kind: 'helper-call'; helper: string; args: readonly ParsedExpr[] }

/**
 * A matcher bound to one component's metadata: given a parsed call's callee +
 * args, returns a neutral node or null to decline. Produced by a plugin's
 * {@link LoweringPlugin.prepare} so the per-component import-name resolution runs
 * once (at adapter init), not on every emit.
 */
export type LoweringMatcher = (
  callee: ParsedExpr,
  args: readonly ParsedExpr[],
) => LoweringNode | null

/**
 * A lowering plugin. `prepare` resolves the local names its import is bound
 * under in this component and returns a bound {@link LoweringMatcher}, or null
 * when the component doesn't use it (so the adapter skips it entirely). A
 * plugin never emits adapter syntax — only neutral nodes.
 */
export interface LoweringPlugin {
  /** Stable id, for dedup/diagnostics (`'queryHref'`). */
  name: string
  prepare(metadata: IRMetadata): LoweringMatcher | null
}

const plugins: LoweringPlugin[] = []

/**
 * Register a lowering plugin. Idempotent by `name` — re-registering the same
 * name replaces the prior plugin, so a double side-effect import can't stack
 * duplicates. First-party packages call this at module load.
 */
export function registerLoweringPlugin(plugin: LoweringPlugin): void {
  const existing = plugins.findIndex(p => p.name === plugin.name)
  if (existing >= 0) plugins[existing] = plugin
  else plugins.push(plugin)
}

/** The registered plugins, in registration order (a copy — mutating the result
 *  can't reorder or corrupt the registry). */
export function getLoweringPlugins(): readonly LoweringPlugin[] {
  return [...plugins]
}

/**
 * Bind every registered plugin to a component's metadata, returning the matchers
 * that are active for it (import present). Adapters call this once at init and
 * store the result, then try each matcher on the calls they lower — replacing a
 * hardcoded per-API recognizer.
 */
export function prepareLoweringMatchers(metadata: IRMetadata): LoweringMatcher[] {
  const matchers: LoweringMatcher[] = []
  for (const plugin of plugins) {
    const matcher = plugin.prepare(metadata)
    if (matcher) matchers.push(matcher)
  }
  return matchers
}

/**
 * Convenience one-shot match against all registered plugins for a given
 * metadata. Prefer {@link prepareLoweringMatchers} on a hot path (it resolves
 * import names once); this re-resolves per call and is meant for tests / cold
 * call sites.
 */
export function matchLoweringCall(
  callee: ParsedExpr,
  args: readonly ParsedExpr[],
  metadata: IRMetadata,
): LoweringNode | null {
  for (const matcher of prepareLoweringMatchers(metadata)) {
    const node = matcher(callee, args)
    if (node) return node
  }
  return null
}

// ---------------------------------------------------------------------------
// First-party default plugins
// ---------------------------------------------------------------------------
//
// `queryHref` (#2042) is registered here by core for now. #2057 PR-3 relocates
// this registration into `@barefootjs/router` (a side-effect import wired by the
// build) and deletes it from core — leaving core with no runtime-API names.

registerLoweringPlugin({
  name: 'queryHref',
  prepare(metadata) {
    const localNames = queryHrefLocalNames(metadata)
    if (localNames.size === 0) return null
    return (callee, args) => {
      const q = matchQueryHrefCall(callee, args, localNames)
      return q ? { kind: 'guard-list', helper: 'query', base: q.base, triples: q.triples } : null
    }
  },
})
