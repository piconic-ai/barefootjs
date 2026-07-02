/**
 * Ruby identifier / literal / hash-key conventions for the ERB adapter.
 *
 * Pure helpers, ported from (and extending) the Mojolicious adapter's
 * `lib/perl-naming.ts` for Ruby's syntax. None read adapter instance
 * state, so they live at module scope as the single source of truth for
 * Ruby-identifier quoting, literal escaping, and marker-id encoding.
 *
 * ## Variable model
 *
 * Templates receive exactly two locals: `bf` (runtime) and `v` (vars Hash,
 * symbol keys). Every prop / signal / memo / module-constant reference
 * lowers to `v[:name]` — never a bare Ruby local — which sidesteps Ruby
 * identifier-validity and reserved-word issues for that whole class of
 * names (a prop literally named `class` or `Foo` is a non-issue: it's a
 * *symbol* key, not a variable reference).
 *
 * The ONE place a bare Ruby local is still needed is a loop/block
 * parameter (`todos().map(todo => ...)` → `|todo|`) — `rubyLocal` is the
 * single naming rule for that case, matching the ERB adapter's binding
 * architecture doc.
 */

/**
 * Ruby's reserved words — cannot be used as a local variable / block
 * parameter name (the parser reads them as keywords, not identifiers).
 * `self`, `nil`, `true`, `false` are technically pseudo-variables/keywords
 * with special meaning even in expression position, so they're included
 * too — using one of these as a block param name is either a SyntaxError
 * or silently shadows a builtin literal, either of which we want to avoid
 * for the same "load-bearing loop var" reason the Perl side avoids
 * `my $if = ...`.
 */
const RUBY_KEYWORDS: ReadonlySet<string> = new Set([
  '__ENCODING__', '__LINE__', '__FILE__',
  'BEGIN', 'END',
  'alias', 'and', 'begin', 'break', 'case', 'class', 'def', 'defined?',
  'do', 'else', 'elsif', 'end', 'ensure', 'false', 'for', 'if', 'in',
  'module', 'next', 'nil', 'not', 'or', 'redo', 'rescue', 'retry',
  'return', 'self', 'super', 'then', 'true', 'undef', 'unless', 'until',
  'when', 'while', 'yield',
  // Not Ruby keywords, but the two RESERVED locals every compiled template
  // receives (the binding architecture contract: `bf` the runtime context,
  // `v` the vars Hash). A loop/block param named `v` or `bf` (e.g.
  // `items.values().map(v => ...)`, whose synthesized `.entries()` value
  // binding is literally `v`) would otherwise shadow the vars Hash inside
  // the loop body, silently breaking every subsequent `v[:name]` read for
  // the rest of that scope. Route through the same collision-suffix path
  // as a real keyword.
  'bf', 'v',
])

/** A syntactically valid Ruby local-variable / block-parameter identifier
 *  (must start lowercase-letter-or-underscore; a leading uppercase letter
 *  parses as a constant reference, not a variable). */
const VALID_RUBY_LOCAL = /^[a-z_][A-Za-z0-9_]*$/

/**
 * Map a JS loop/block parameter name (`todo`, `index`, `class`, `Item`) to
 * a safe bare Ruby local. Appends a trailing `_` when the name collides
 * with a Ruby keyword; when the name isn't even a syntactically valid
 * local (leading uppercase — parses as a constant — or another invalid
 * leading character), prefixes `_` instead so the result still starts
 * lowercase/underscore. Every loop-var / block-param emission site in the
 * adapter goes through this one helper — no inline mangling.
 */
export function rubyLocal(name: string): string {
  if (RUBY_KEYWORDS.has(name)) return `${name}_`
  if (VALID_RUBY_LOCAL.test(name)) return name
  // Invalid leading character (most commonly a JS param starting with an
  // uppercase letter, which Ruby would otherwise parse as a constant
  // reference) — prefix rather than suffix so the fixed name still starts
  // with a valid local-variable leading character.
  return `_${name}`
}

/** Escape a string for a Ruby single-quoted literal: backslash first (so
 *  it doesn't double-escape the quote we add next), then the quote. */
export function escapeRubySingleQuoted(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

/** Wrap a raw string value as a Ruby single-quoted literal. */
export function rubyStringLiteral(s: string): string {
  return `'${escapeRubySingleQuoted(s)}'`
}

/** A syntactically valid bare Ruby hash-key / symbol identifier. */
const VALID_RUBY_SYMBOL = /^[A-Za-z_][A-Za-z0-9_]*[?!]?$/

/**
 * Render `name` as a Ruby Hash literal SYMBOL key in `key: value` position.
 * A JSX attribute / prop name like `data-slot` isn't a valid bare Ruby
 * identifier — Ruby's `"quoted": value` symbol-key syntax accepts an
 * arbitrary string, so a non-identifier name still renders as a valid
 * symbol key (`"data-slot": value` → `{:"data-slot" => value}`).
 * Identifier-safe names (`className`, `size`, `_bf_slot`) pass through
 * unquoted (`size: value`) for readability.
 */
export function rubySymbolKey(name: string): string {
  return VALID_RUBY_SYMBOL.test(name) ? `${name}:` : `"${name.replace(/"/g, '\\"')}":`
}

/**
 * Render `name` as a Ruby symbol LITERAL (`:name` / `:"data-slot"`) — used
 * for a compile-time-known Hash key read (`item[:field]`), as opposed to
 * `rubySymbolKey`'s `key: value` Hash-literal position.
 */
export function rubySymbolLiteral(name: string): string {
  return VALID_RUBY_SYMBOL.test(name) ? `:${name}` : `:"${name.replace(/"/g, '\\"')}"`
}

/**
 * Encode an `IRLoop.markerId` into a Ruby-identifier-safe suffix for the
 * `bf_iter_…` sort hoist local. Collision-free for marker ids that differ
 * in any character — `-` and `_` map to distinct encodings (`_x2d` vs
 * `__`) so `l-0` and `l_0` stay distinct.
 *
 * Today the IR only emits `l<digits>` so the encoding is mostly an
 * identity, but pinning collision-freeness up front avoids a silent
 * variable-shadow bug if a future marker generator widens the alphabet.
 */
export function rubyIdentifierFromMarkerId(markerId: string): string {
  return markerId.replace(/[^a-zA-Z0-9]/g, (ch) =>
    ch === '_' ? '__' : `_x${ch.charCodeAt(0).toString(16)}`
  )
}
