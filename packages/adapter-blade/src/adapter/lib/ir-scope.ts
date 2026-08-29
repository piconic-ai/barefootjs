/**
 * IR traversal helpers for the Blade template adapter.
 *
 * Ported from `packages/adapter-twig/src/adapter/lib/ir-scope.ts`.
 * `resolveJsxChildrenProp` used to live here too (byte-identical across
 * every adapter carrying a copy of this file); it moved to
 * `@barefootjs/shared` (#2773) so every adapter — DSL and Go template
 * alike — calls the one implementation instead of each keeping a copy
 * that can silently re-diverge. `collectRootScopeNodes` — the "which
 * elements are this component's own render root(s)" walk this file used
 * to duplicate too — moved into `jsx-to-ir.ts`'s `resolveRootKeyAttr`
 * (#2753): the decision it fed (a `data-key` relay attribute) is resolved
 * once, onto `IRElement.keyAttr`, instead of re-derived at emit time by
 * every adapter.
 *
 * `extractTopLevelIdentifiers` is SIMPLER than the Twig port's. Twig
 * identifiers have no sigil, so that port had to strip quoted strings first,
 * exclude dotted property/method names, and drop a closed set of Twig-
 * grammar keywords the adapter's own codegen could emit (`is`, `defined`,
 * `and`, `not`, `null`, `true`, `false`, `bf`) to avoid false-matching one of
 * those as a genuine context-var reference. Blade variables carry PHP's `$`
 * sigil — the SAME property that made Kolon's own `\$([A-Za-z_]\w*)` scan
 * trivially safe (see the Twig port's file header, which calls this out
 * explicitly as the thing Twig's sigil-less grammar lacked). So this port
 * needs no quote-stripping, no dotted-name exclusion (member/index access
 * here is `data_get(...)`, a function call, not a `.`/`[]` postfix that
 * could attach to a preceding bare word), and no keyword-exclusion set at
 * all — the ONLY non-context-var `$name` this adapter's own codegen ever
 * emits is `$bf` (the runtime handle), excluded explicitly below.
 */

/**
 * Extract the set of "top-level identifier" tokens (bare `$name` references,
 * `$bf` excluded) from a rendered Blade expression. `memo/seed.ts` uses this
 * to detect a constant lowering (no real variable reference at all) that
 * should keep the static ssr-defaults seed instead of an in-template
 * `@php($x = ...)`; scope AVAILABILITY itself is the shared
 * `computeSsrSeedPlan`'s job (packages/jsx/src/ssr-seed-plan.ts), not this
 * module's.
 */
export function extractTopLevelIdentifiers(bladeExpr: string): string[] {
  // Strip single-quoted string literals (this adapter only ever emits
  // single-quoted string literals, backslash-escaped) so a literal `$name`-
  // shaped substring inside one can't leak into the scan.
  const stripped = bladeExpr.replace(/'(?:\\.|[^'\\])*'/g, ' ')
  const out: string[] = []
  for (const m of stripped.matchAll(/\$([A-Za-z_]\w*)/g)) {
    if (m[1] !== 'bf') out.push(m[1])
  }
  return out
}
