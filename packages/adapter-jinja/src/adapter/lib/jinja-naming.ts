/**
 * Jinja2/Python identifier and dict-key conventions for the Jinja adapter.
 *
 * Pure helpers, ported from the Kolon equivalent
 * (`packages/adapter-xslate/src/adapter/lib/kolon-naming.ts`) but adjusted for
 * two real syntax divergences between Kolon and Jinja2:
 *
 * 1. **Dict-literal keys are always quoted.** Kolon's hashref fat-comma
 *    (`key => value`) auto-quotes a bareword key, so `kolonHashKey` only
 *    quotes a non-identifier-safe name (`'data-slot'`). A Jinja/Python dict
 *    LITERAL has no such bareword-key sugar — `{key: value}` means "look up
 *    the *variable* `key` and use its value as the key", not the string
 *    `"key"`. `jinjaHashKey` therefore ALWAYS emits a quoted string literal,
 *    identifier-safe or not — the one place this port is NOT a bare 1:1
 *    syntax substitution, because treating it as one would silently change
 *    dict keys into undefined-variable lookups.
 * 2. **Reserved-word identifier mangling.** Verified empirically against
 *    Jinja 3.1 that most Python keywords (`class`, `import`, `for`, …) parse
 *    fine as bare Jinja variable / loop-target names — Jinja compiles every
 *    user template name to an internally-prefixed Python local (`l_0_…`), so
 *    the template layer itself mostly sidesteps Python's own reserved-word
 *    rules. The genuinely Jinja-reserved bare words are `not` / `and` / `or`
 *    / `in` / `is` / `if` / `else` (grammar keywords) plus the three
 *    constants `true` / `false` / `none` (rejected specifically as
 *    assignment targets). Per the adapter plan, `jinjaIdent` mangles the
 *    FULL Python reserved-word list (a conservative superset of what Jinja's
 *    grammar strictly requires) with a trailing-underscore suffix, trivial
 *    and easy to keep in lock-step with the Python runtime's identical rule
 *    (`barefootjs.runtime.jinja_ident`) — the runtime applies the SAME
 *    mangling when it builds the per-render context dict, so a prop/signal
 *    named e.g. `class` is threaded through as context key `'class_'` on
 *    both sides.
 */

import type { LoopBindingPathSegment } from '@barefootjs/jsx'

/**
 * Escape a string for a Jinja/Python single-quoted literal: backslash first
 * (so it doesn't double-escape the quote we add next), then the quote.
 * Python string-literal escaping treats `\\` / `\'` identically to Perl's,
 * so this is byte-identical to `escapeKolonSingleQuoted`.
 */
export function escapeJinjaSingleQuoted(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

/**
 * Quote a dict-literal KEY for Jinja. UNLIKE Kolon's `kolonHashKey`, this
 * always quotes — see the file header for why a bareword key would silently
 * become a variable lookup instead of a string key.
 */
export function jinjaHashKey(name: string): string {
  return `'${escapeJinjaSingleQuoted(name)}'`
}

/**
 * Python reserved words (the plan's list) that must not appear as a bare
 * Jinja identifier — see the file header. Kept as the single source of
 * truth; the Python runtime's `jinja_ident` mirrors this exact set.
 */
const RESERVED_WORDS = new Set([
  'if', 'else', 'for', 'in', 'is', 'not', 'and', 'or', 'none', 'true', 'false',
  'import', 'from', 'class', 'def', 'pass', 'del', 'return', 'lambda', 'global',
  'with', 'as', 'raise', 'try', 'except', 'finally', 'while', 'break',
  'continue', 'elif', 'yield', 'assert', 'nonlocal',
])

/**
 * Mangle a JS identifier (prop name, signal getter, loop param, …) into a
 * Jinja-safe variable name: reserved words get a trailing `_` suffix,
 * everything else passes through unchanged. Applied at every point the
 * adapter emits a bare Jinja variable reference or `{% set %}` target —
 * mirrors Kolon's `$name` sigil giving those references collision immunity
 * for free; Jinja has no sigil, so the adapter mangles instead.
 */
export function jinjaIdent(name: string): string {
  // The engine binds its own `loop` inside `{% for %}`, so a JS `loop` takes
  // the compiler-internal `__bf_loop` (#3404). Unlike a `_` suffix it cannot
  // collide with a real `loop_`, and mangling it again leaves it unchanged.
  if (name === 'loop') return '__bf_loop'
  return RESERVED_WORDS.has(name) ? `${name}_` : name
}

/**
 * Build a native Jinja accessor expression from a `.map()` destructure
 * binding's structured {@link LoopBindingPathSegment} path (#2087 Phase B) —
 * the per-adapter counterpart to the JS accessor suffix carried in
 * `LoopParamBinding.path`. Walks `segments` (never string-parses `path` —
 * repo rule) appending, per step:
 *
 *   - `{ kind: 'index', index }` → `[N]` (a Python list index — same postfix
 *     Jinja uses for dict-key lookup, so this is unambiguous either way).
 *   - `{ kind: 'field', key, isIdent: true }` → `.key` (bare attribute
 *     access — Jinja resolves it against a dict transparently).
 *   - `{ kind: 'field', key, isIdent: false }` → `[<quoted key>]` (e.g. a
 *     `'data-priority'` sibling key can't be a bare Jinja attribute, same
 *     reasoning as `jinjaHashKey` on dict-literal keys).
 *
 * `base` is the already-`jinjaIdent`-mangled loop variable (or a parent
 * accessor expression when called recursively); an empty `segments` array
 * (a rest binding sitting at the loop root) returns `base` unchanged.
 */
export function jinjaAccessorFromSegments(
  base: string,
  segments: readonly LoopBindingPathSegment[],
): string {
  let acc = base
  for (const seg of segments) {
    if (seg.kind === 'index') {
      acc += `[${seg.index}]`
    } else if (seg.isIdent) {
      acc += `.${seg.key}`
    } else {
      acc += `[${jinjaHashKey(seg.key)}]`
    }
  }
  return acc
}
