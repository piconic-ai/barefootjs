/**
 * IR traversal helpers for the Twig template adapter.
 *
 * Ported from `packages/adapter-jinja/src/adapter/lib/ir-scope.ts`.
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
 * `extractTopLevelIdentifiers` scans the RENDERED template text (rather than
 * re-deriving free vars from the original JS AST) so it stays exactly in
 * sync with whatever the emitter actually produced — but Twig identifiers
 * have no sigil (unlike Kolon's `$`, which made a trivially safe
 * `\$([A-Za-z_]\w*)` scan possible): a bare word in the rendered text could
 * be a genuine context-var reference, a `bf.` runtime-helper method name, a
 * Twig grammar keyword emitted by this adapter's own condition/attribute-
 * omission lowering (`is`/`not`/`and`/`null`/`true`/`false`/`defined`), or
 * content inside a single-quoted string literal. This helper makes the scan
 * sound: it strips quoted string spans first, then matches identifier tokens
 * NOT immediately preceded by a `.` (excluding dotted property/method names
 * — the same exclusion the `$` sigil gave Kolon for free, since Kolon's
 * regex only ever matched right after `$`), then drops the closed set of
 * tokens this adapter's own codegen can emit that aren't context vars (`bf`
 * and the Twig keywords above). Note this set is SMALLER than the Jinja
 * port's — Twig's ternary is symbolic (`t ? a : b`, no `if`/`else` words)
 * and `??` is native (no `is defined and is not none` dance for THAT
 * operator), so `if`/`else` never appear in rendered EXPRESSION text here;
 * `is`/`defined`/`and`/`not null` still can, from the nullable-optional-prop
 * attribute-omission guard (`jinja-adapter.ts`'s Twig counterpart). `memo/
 * seed.ts` uses this to detect a constant lowering (no top-level identifier
 * at all) that should keep the static ssr-defaults seed instead of an
 * in-template `{% set %}`; scope AVAILABILITY itself is the shared
 * `computeSsrSeedPlan`'s job (packages/jsx/src/ssr-seed-plan.ts), not this
 * module's.
 */

/** Tokens this adapter's own codegen can emit that are never context vars. */
const NON_VAR_TOKENS = new Set([
  'bf', 'not', 'and', 'true', 'false', 'null',
  // `is defined` / `is not null` — the nullable-optional-prop attribute-
  // omission guard (`twig-adapter.ts`) emits these Twig test keywords;
  // they're never context vars.
  'is', 'defined',
])

/**
 * Extract the set of "top-level identifier" tokens from a rendered Twig
 * expression: bare words, excluding quoted-string content, dotted
 * property/method names, and this adapter's own non-var keyword vocabulary.
 * See the file header for why this replaces a direct `\w+` scan.
 */
export function extractTopLevelIdentifiers(twigExpr: string): string[] {
  // Strip single-quoted string literals (this adapter only ever emits
  // single-quoted string literals, backslash-escaped) so their content can't
  // leak into the identifier scan.
  const stripped = twigExpr.replace(/'(?:\\.|[^'\\])*'/g, ' ')
  const out: string[] = []
  for (const m of stripped.matchAll(/(?<!\.)\b([A-Za-z_]\w*)\b/g)) {
    if (!NON_VAR_TOKENS.has(m[1])) out.push(m[1])
  }
  return out
}
