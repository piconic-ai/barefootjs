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

import type { LoopBindingPathSegment } from '@barefootjs/jsx'

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

/**
 * Build a Twig accessor expression that walks a `.map()` destructure
 * binding's structured `segments` path (#2087 Phase A, `LoopBindingPathSegment`)
 * off `base` — the per-iteration loop var (`__bf_item`) for a fixed binding
 * or a top-level rest binding, or an already-built PARENT accessor for a
 * nested rest binding (`segments` there is the prefix up to, not including,
 * the rest token).
 *
 * Verified empirically against Twig 3.x (`vendor/twig/twig` bundled under
 * `packages/adapter-twig/php`) — the two SSR item shapes this walk ever
 * touches are a JSON-decoded `stdClass` (an object field) or a PHP list
 * array (an array index), per the "canonical value convention" documented in
 * `test-render.ts` (JSON objects → stdClass, JSON arrays → PHP lists):
 *
 *   - `index` segments ALWAYS use bracket subscript (`base[N]`), never Twig's
 *     `base.N` dot form. Chaining two dot-number steps (`base.0.1`) mis-lexes
 *     as the single FLOAT LITERAL `0.1` — Twig's lexer greedily consumes
 *     `NUMBER '.' NUMBER` as one token right after the leading dot — which
 *     silently produces the wrong accessor instead of a parse error.
 *     Bracket subscript has no such collision, at any chain position, and
 *     works identically on a PHP list.
 *   - `field` segments with an identifier-safe key (`isIdent`) use dot
 *     notation (`base.key`): Twig's dot accessor resolves an object PROPERTY
 *     first, which is correct on `stdClass` — confirmed empirically that
 *     even reserved-word-shaped keys (`if`, `and`, `class`) read fine as
 *     `.if` / `.and` / `.class`, since Twig's NAME token is not
 *     keyword-reserved at the lexer level (only bareword HASH-LITERAL keys
 *     are, which is why `twigHashKey` above always quotes).
 *   - `field` segments with a non-identifier key (e.g. `'data-priority'`)
 *     do NOT use bracket subscript the way a JS accessor string would —
 *     confirmed empirically that Twig's `[...]` subscript on a `stdClass` is
 *     an ARRAY-item lookup only and silently resolves to nothing (no error,
 *     under `strict_variables: false`). Twig's built-in `attribute(receiver,
 *     key)` function is the one accessor that checks object-property AND
 *     array-item access uniformly (confirmed against both `stdClass` and PHP
 *     arrays, string or integer key), so non-ident field steps route through
 *     it instead.
 */
export function twigLoopBindingAccessor(
  base: string,
  segments: readonly LoopBindingPathSegment[],
): string {
  let acc = base
  for (const seg of segments) {
    if (seg.kind === 'index') {
      acc = `${acc}[${seg.index}]`
    } else if (seg.isIdent) {
      acc = `${acc}.${seg.key}`
    } else {
      acc = `attribute(${acc}, '${escapeTwigSingleQuoted(seg.key)}')`
    }
  }
  return acc
}
