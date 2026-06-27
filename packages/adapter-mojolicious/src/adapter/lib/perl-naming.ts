/**
 * Perl identifier / hash-key conventions for the Mojolicious EP adapter.
 *
 * Pure helpers extracted from `mojo-adapter.ts` (domain-module refactor,
 * issue #2018 track D): none read adapter instance state, so they live at
 * module scope as the single source of truth for Perl-identifier quoting
 * and marker-id encoding.
 */

/**
 * (#checkbox) Quote a `render_child` named-arg / hashref key when it isn't a
 * bare Perl identifier. A JSX attribute name like `data-slot` would otherwise
 * emit `data-slot => '...'`, which Perl parses as the subtraction
 * `data - slot`. Identifier-safe names (`className`, `size`, `_bf_slot`) pass
 * through unquoted to keep the generated template readable.
 */
export function perlHashKey(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `'${name.replace(/'/g, "\\'")}'`
}

/**
 * Encode an `IRLoop.markerId` into a Perl-identifier-safe suffix
 * for the `bf_iter_…` hoist var. Collision-free for marker ids
 * that differ in any character — `-` and `_` map to distinct
 * encodings (`_x2d` vs `__`) so `l-0` and `l_0` stay distinct.
 *
 * Today the IR only emits `l<digits>` so the encoding is mostly
 * an identity, but pinning collision-freeness up front avoids a
 * silent variable-shadow bug if a future marker generator widens
 * the alphabet.
 */
export function perlIdentifierFromMarkerId(markerId: string): string {
  return markerId.replace(/[^a-zA-Z0-9]/g, (ch) =>
    ch === '_' ? '__' : `_x${ch.charCodeAt(0).toString(16)}`
  )
}
