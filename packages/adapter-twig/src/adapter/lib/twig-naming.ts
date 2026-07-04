/**
 * Twig/PHP identifier and hash-key conventions for the Twig adapter.
 *
 * Ported from `packages/adapter-jinja/src/adapter/lib/jinja-naming.ts`
 * (itself adjusted from the Kolon equivalent), adjusted for the two real
 * syntax divergences between Jinja and Twig that matter here:
 *
 * 1. **Hash-literal keys are always quoted.** Twig's `{ key: value }` hash
 *    literal has the SAME bareword-key trap Jinja's dict literal has — an
 *    unquoted `key` means "look up the *variable* `key` and use its value as
 *    the key", not the string `"key"`. `twigHashKey` therefore ALWAYS emits a
 *    quoted string literal, identifier-safe or not — same rule as
 *    `jinjaHashKey`, for the same reason.
 * 2. **Reserved-word identifier mangling.** The FROZEN Twig reserved-word set
 *    below (operators, literals, and a conservative margin of block/tag/test
 *    names) is defined once here — the design doc for this adapter fixes the
 *    exact list — and the PHP runtime's `naming.php` (`twig_ident()`) MUST
 *    mirror it EXACTLY (docstring cross-pointers on both sides + a parity
 *    test on each side asserting the shared list), the same contract the
 *    Jinja adapter has with `barefootjs.runtime.jinja_ident`. Every bare Twig
 *    variable reference / `{% set %}` target is passed through `twigIdent()`;
 *    the PHP runtime applies the IDENTICAL mangling when it builds the
 *    per-render template-var array, so a prop/signal literally named e.g.
 *    `if` is threaded through as template var `'if_'` on both sides.
 */

/**
 * Escape a string for a Twig single-quoted literal: backslash first (so it
 * doesn't double-escape the quote we add next), then the quote. Verified
 * empirically against Twig 3.x: `\'` and `\\` are Twig's only single-quoted
 * string escapes (same rule PHP itself uses for single-quoted strings), so
 * this is byte-identical to `escapeJinjaSingleQuoted` / `escapeKolonSingleQuoted`.
 */
export function escapeTwigSingleQuoted(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

/**
 * Quote a hash-literal KEY for Twig. UNLIKE a Kolon hashref's fat-comma
 * bareword-key sugar, this always quotes — see the file header for why a
 * bareword key would silently become a variable lookup instead of a string
 * key.
 */
export function twigHashKey(name: string): string {
  return `'${escapeTwigSingleQuoted(name)}'`
}

/**
 * Twig-reserved bare words (operators + literals + a conservative margin of
 * block/tag/test names) that must not appear as a bare Twig identifier.
 * FROZEN by the adapter design doc — this is the single source of truth;
 * the PHP runtime's `naming.php` (`twig_ident()`) mirrors this exact set
 * verbatim, and each side carries a parity test asserting it against the
 * other.
 */
const RESERVED_WORDS = new Set([
  'and', 'or', 'not', 'in', 'is', 'matches', 'starts', 'ends',
  'if', 'else', 'elseif', 'for', 'set', 'true', 'false', 'null', 'none',
  'with', 'block', 'macro', 'import', 'from', 'as', 'extends', 'include',
  'embed', 'use', 'filter', 'do', 'then', 'endif', 'endfor', 'endset',
  'defined', 'same', 'divisible', 'constant', 'even', 'odd', 'iterable',
])

/**
 * Mangle a JS identifier (prop name, signal getter, loop param, …) into a
 * Twig-safe variable name: reserved words get a trailing `_` suffix,
 * everything else passes through unchanged. Applied at every point the
 * adapter emits a bare Twig variable reference or `{% set %}` target —
 * mirrors `jinjaIdent`'s role for the Jinja port.
 */
export function twigIdent(name: string): string {
  return RESERVED_WORDS.has(name) ? `${name}_` : name
}
