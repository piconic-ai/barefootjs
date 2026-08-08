/**
 * Single door for building "does this expression text reference identifier
 * X?" regexes (#2592).
 *
 * The naive `new RegExp(`\\b${name}\\b`)` idiom used throughout the compiler
 * breaks for `$`-containing identifiers (legal in JS: `$item`, `item$`,
 * `a$b`) in two independent ways:
 *
 *   1. Unescaped: an interpolated `$` is a regex metacharacter (end-of-
 *      input/line anchor), so `\b$item\b` / `\ba$b\b` can (almost) never
 *      match mid-string — false negative.
 *   2. Even escaped, `\b` requires a `\w`/non-`\w` transition and `$` is
 *      not `\w` (`[A-Za-z0-9_]`) — so `\b\$item\b` still fails to match the
 *      leading boundary in `($item)` (both `(` and `$` are non-word, so no
 *      transition occurs there).
 *
 * `identifierPattern` / `identifierCallPattern` fix both: the identifier
 * text is escaped before interpolation, and the boundary is asserted with
 * lookaround against `\p{ID_Continue}` (Unicode "can continue an
 * identifier") unioned with `$`, so `$` is correctly treated as
 * identifier-like on both sides of the match.
 *
 * Scope: these remain the same *bounded lexical heuristic* the compiler has
 * always used for expression-text scanning (not a general JS/TS parse —
 * see CLAUDE.md's structural-parsing rule, which does not apply to this
 * class of check). This module only fixes the `$` boundary bug; it does not
 * change what the heuristic considers a "reference" (string literals,
 * comments, and member-access tails are still opaque to it — callers that
 * need that precision use `tokenContainsIdent` / `node.freeIdentifiers`
 * instead, per #1267).
 */

/** Escape regex metacharacters in a literal identifier before interpolation. */
export function escapeIdentifierForRegex(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Lookaround fragments asserting "not preceded/followed by an identifier
 * continuation character (including `$`)". `$` is a legal identifier char
 * in JS but is not `\p{ID_Continue}`, so it's unioned in explicitly.
 *
 * Exported for the few call sites that must splice extra assertions
 * between the identifier and the trailing boundary (e.g. "not followed by
 * a call" as well as "not followed by an identifier char") — compose with
 * these fragments rather than reintroducing a bare `\b`.
 */
export const ID_BOUNDARY_BEFORE = '(?<![\\p{ID_Continue}$])'
export const ID_BOUNDARY_AFTER = '(?![\\p{ID_Continue}$])'

/**
 * Regex matching a standalone reference to identifier `name` — the `$`-safe
 * replacement for `new RegExp(`\\b${name}\\b`)`. Always carries the `u`
 * (unicode) flag, required for `\p{ID_Continue}`; pass additional flags
 * (e.g. `'g'` for `String.replace`/`matchAll` substitution sites) via
 * `flags`.
 */
export function identifierPattern(name: string, flags = ''): RegExp {
  const esc = escapeIdentifierForRegex(name)
  return new RegExp(`${ID_BOUNDARY_BEFORE}${esc}${ID_BOUNDARY_AFTER}`, `${flags}u`)
}

/**
 * Regex matching identifier `name` used in call position (`name(...)`,
 * allowing whitespace before the paren) — the `$`-safe replacement for
 * `new RegExp(`\\b${name}\\s*\\(`)`. No trailing boundary assertion is
 * needed: `\s`/`(` are already not `\p{ID_Continue}`/`$`, so they can't be
 * mistaken for a continuation of `name`.
 */
export function identifierCallPattern(name: string, flags = ''): RegExp {
  const esc = escapeIdentifierForRegex(name)
  return new RegExp(`${ID_BOUNDARY_BEFORE}${esc}\\s*\\(`, `${flags}u`)
}
