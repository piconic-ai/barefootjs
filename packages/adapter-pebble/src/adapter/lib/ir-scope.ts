/**
 * IR traversal helpers for the Pebble template adapter.
 *
 * Ported from `packages/adapter-jinja/src/adapter/lib/ir-scope.ts` (itself
 * ported from the Xslate adapter's equivalent).
 *
 * `extractTopLevelIdentifiers` scans the RENDERED template text (rather than
 * re-deriving free vars from the original JS AST) so it stays exactly in
 * sync with whatever the emitter actually produced — but Pebble identifiers
 * have no sigil (unlike Kolon's `$`, which made a trivially safe
 * `\$([A-Za-z_]\w*)` scan possible): a bare word in the rendered text could
 * be a genuine context-var reference, a `bf.` runtime-helper method name, a
 * Pebble grammar keyword emitted by this adapter's own condition/logical
 * lowering (`not`/`and`/`or`/`null`/`true`/`false`/`is`), or content inside a
 * single-quoted string literal. This helper makes the scan sound: it strips
 * quoted string spans first, then matches identifier tokens NOT immediately
 * preceded by a `.` (excluding dotted property/method names), then drops the
 * closed set of tokens this adapter's own codegen can emit that aren't
 * context vars. `memo/seed.ts` uses it to detect a constant lowering (no
 * top-level identifier at all) that should keep the static ssr-defaults seed
 * instead of an in-template `{% set %}`.
 *
 * NOTE: unlike the Jinja port's nullish-coalescing lowering (which emits an
 * `is defined` word token that had to be excluded here), this adapter's `??`
 * is Pebble's own native operator (symbol, not a word) and its ternary is
 * the symbolic `(test ? a : b)` form — neither `if`/`else`/`defined` ever
 * appears in RENDERED EXPRESSION text this scan sees (those words are only
 * ever `{% if %}`/`{% endif %}` TAG syntax, outside the expressions this
 * helper is applied to). `is` is kept in the exclusion set defensively for
 * margin even though no current emit path produces it as a bare condition
 * test — see `pebble-adapter.ts`'s file header for the confirmed operator
 * set.
 */

/** Tokens this adapter's own codegen can emit that are never context vars. */
const NON_VAR_TOKENS = new Set([
  'bf', 'not', 'and', 'or', 'in', 'is', 'null', 'true', 'false',
])

/**
 * Extract the set of "top-level identifier" tokens from a rendered Pebble
 * expression: bare words, excluding quoted-string content, dotted
 * property/method names, and this adapter's own non-var keyword vocabulary.
 * See the file header for why this replaces a direct `\w+` scan.
 */
export function extractTopLevelIdentifiers(pebbleExpr: string): string[] {
  // Strip single-quoted string literals (this adapter only ever emits
  // single-quoted string literals, backslash-escaped) so their content can't
  // leak into the identifier scan.
  const stripped = pebbleExpr.replace(/'(?:\\.|[^'\\])*'/g, ' ')
  const out: string[] = []
  for (const m of stripped.matchAll(/(?<!\.)\b([A-Za-z_]\w*)\b/g)) {
    if (!NON_VAR_TOKENS.has(m[1])) out.push(m[1])
  }
  return out
}
