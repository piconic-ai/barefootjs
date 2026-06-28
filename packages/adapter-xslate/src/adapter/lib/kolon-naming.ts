/**
 * Kolon identifier / hash-key conventions for the Text::Xslate adapter.
 *
 * Pure helpers extracted from `xslate-adapter.ts` (domain-module refactor,
 * issue #2018 track D): none read adapter instance state, so they live at
 * module scope as the single source of truth for Kolon-literal escaping and
 * hashref-key quoting.
 */

/**
 * Escape a string for a Kolon/Perl single-quoted literal: backslash first
 * (so it doesn't double-escape the quote we add next), then the quote. Used
 * by every `'…'` hashref key/value emitter.
 */
export function escapeKolonSingleQuoted(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

/**
 * Quote a hashref KEY for Kolon when it isn't a bare-identifier-safe name.
 * Kolon parses `data-slot` as `data - slot` (subtraction) and faults on the
 * undefined `data` symbol, so a hyphenated key (`data-slot`, `aria-label`)
 * must be single-quoted: `'data-slot'`. Bare identifiers pass through unquoted.
 */
export function kolonHashKey(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `'${escapeKolonSingleQuoted(name)}'`
}
