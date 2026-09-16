/**
 * Pebble/Java identifier and hash-key conventions for the Pebble adapter.
 *
 * Ported from `packages/adapter-jinja/src/adapter/lib/jinja-naming.ts` (and,
 * for the loop-binding accessor, informed by
 * `packages/adapter-twig/src/adapter/lib/twig-naming.ts`'s dot/bracket
 * split), adjusted for Pebble's own confirmed syntax and Java's reserved
 * words:
 *
 * 1. **Hash-literal keys are always quoted.** Pebble supports inline map
 *    literals with the same `{'key': value, ...}` shape as Jinja/Twig
 *    (confirmed: a Pebble map literal is passed with quoted string keys,
 *    e.g. `{'test': 'test1', 'test2': 'test2'}`). An UNQUOTED bareword key
 *    would be a *variable* lookup, not the literal string — same trap
 *    `jinjaHashKey`/`twigHashKey` document — so `pebbleHashKey` ALWAYS emits
 *    a quoted string literal, identifier-safe or not.
 * 2. **Reserved-word identifier mangling.** Pebble runs on the JVM, so a bare
 *    Pebble variable name that collided with a JAVA keyword would be fine at
 *    the TEMPLATE-language level (Pebble's own grammar, not Java's, governs
 *    what's a legal `{{ name }}` reference) — but the Java RUNTIME builds the
 *    per-render context as a `Map<String, Object>` whose keys become
 *    `{{ name }}` references, so the actual risk is Pebble's OWN reserved
 *    words (its expression-grammar keywords and operators: `if`/`else`/
 *    `elseif`/`for`/`in`/`is`/`not`/`and`/`or`/`true`/`false`/`null`/`set`/
 *    …) colliding with a JS prop/signal name, not Java's. `pebbleIdent`
 *    mangles Pebble's own reserved-word set (confirmed via `{% if %}` /
 *    `{% elseif %}` / `{% for %}` / `{% set %}` tag syntax, plus the
 *    documented operator keywords) with a trailing-underscore suffix — the
 *    Java runtime's per-render context-map builder must apply the IDENTICAL
 *    mangling (mirrors `jinjaIdent`/`twigIdent`'s contract with their
 *    respective runtimes), so a prop literally named e.g. `if` is threaded
 *    through as context key `'if_'` on both sides. A conservative margin of
 *    Java keywords is mangled too (`class`, `new`, `this`, …) — not because
 *    Pebble's grammar rejects them as bare names, but because a JS prop
 *    named `class` landing in the per-render `Map<String, Object>` under the
 *    key `"class"` is the exact shape of the well-known JavaBean
 *    introspection hazard where a generic bean-property resolver mistakes
 *    `Object.getClass()` for a property named `class` — see the Phase 3/4
 *    watchpoint noted in `pebble-adapter.ts`'s file header. Mangling the
 *    full Java keyword list here is cheap insurance; the Java runtime is the
 *    place that must actually verify Map-key vs. bean-getter resolution
 *    order once it exists.
 */

import type { LoopBindingPathSegment } from '@barefootjs/jsx'

/**
 * Escape a string for a Pebble single-quoted literal: backslash first (so it
 * doesn't double-escape the quote we add next), then the quote. Mirrors
 * `escapeJinjaSingleQuoted`/`escapeTwigSingleQuoted` — Pebble's own
 * single-quoted string literal escaping is a Phase 3/4 verification point
 * (the Java runtime doesn't exist yet to check against), but backslash +
 * quote is the universal-enough baseline every sibling DSL adapter uses.
 */
export function escapePebbleSingleQuoted(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

/**
 * Quote a map-literal KEY for Pebble. Always quotes — see the file header
 * for why a bareword key would silently become a variable lookup instead of
 * a string key.
 */
export function pebbleHashKey(name: string): string {
  return `'${escapePebbleSingleQuoted(name)}'`
}

/**
 * Pebble-reserved bare words: confirmed tag/expression keywords
 * (`if`/`elseif`/`else`/`endif`/`for`/`endfor`/`set`/`in`/`is`/`not`/`and`/
 * `or`/`true`/`false`/`null`/macro & block family) plus a conservative
 * margin of full Java keywords (the per-render context map is built and
 * consumed from Java source, and a context key shaped like a Java keyword
 * is a needless landmine for that code even though Pebble's own template
 * grammar wouldn't choke on it) — see the file header, point 2.
 */
const RESERVED_WORDS = new Set([
  // Pebble tag / expression-grammar keywords (confirmed via `{% if %}` /
  // `{% elseif %}` / `{% for %}` / `{% set %}` / `{% macro %}` / `{% block %}`
  // / `{% filter %}` / `{% import %}` / `{% include %}` / `{% extends %}`
  // tag docs, plus the standard `is`-test operator vocabulary).
  'if', 'else', 'elseif', 'endif', 'for', 'endfor', 'in', 'is', 'not', 'and',
  'or', 'true', 'false', 'null', 'none', 'set', 'endset', 'macro', 'endmacro', 'block',
  'endblock', 'extends', 'include', 'import', 'from', 'as', 'filter',
  'endfilter', 'autoescape', 'endautoescape', 'verbatim', 'endverbatim',
  'flush', 'cache', 'endcache', 'parallel', 'endparallel', 'empty',
  // Java reserved words (full keyword list) — see the file header, point 2.
  'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char',
  'class', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum',
  'extends', 'final', 'finally', 'float', 'for', 'goto', 'if', 'implements',
  'import', 'instanceof', 'int', 'interface', 'long', 'native', 'new',
  'package', 'private', 'protected', 'public', 'return', 'short', 'static',
  'strictfp', 'super', 'switch', 'synchronized', 'this', 'throw', 'throws',
  'transient', 'try', 'void', 'volatile', 'while', 'var', 'yield', 'record',
  'sealed', 'permits', 'true', 'false', 'null',
])

/**
 * Mangle a JS identifier (prop name, signal getter, loop param, …) into a
 * Pebble-safe variable name: reserved words get a trailing `_` suffix,
 * everything else passes through unchanged. Applied at every point the
 * adapter emits a bare Pebble variable reference or `{% set %}` target —
 * mirrors `jinjaIdent`/`twigIdent`'s role for their respective ports.
 */
export function pebbleIdent(name: string): string {
  return RESERVED_WORDS.has(name) ? `${name}_` : name
}

/**
 * Build a Pebble accessor expression from a `.map()` destructure binding's
 * structured {@link LoopBindingPathSegment} path (never string-parses the
 * JS accessor suffix — repo rule), walking `segments` off `base` (the
 * already-`pebbleIdent`-mangled loop variable, or a parent accessor for a
 * nested rest binding):
 *
 *   - `{ kind: 'index', index }` → `base[N]` — the per-item value the runtime
 *     hands this loop is a Java `List` for an array-shaped JS value, and
 *     Pebble's bracket subscript against a `List` is standard numeric-index
 *     access (unambiguous — no dot-chain float-literal mislex risk the way
 *     Twig's `.0.1` dot-chaining has, since bracket subscript never shares
 *     lexer grammar with a float literal).
 *   - `{ kind: 'field', key, isIdent: true }` → `base.key` — Pebble's
 *     documented Map-attribute support resolves a dot-accessed name against
 *     a `Map`'s keys (the runtime represents a JS object as a
 *     `Map<String, Object>`), confirmed as a commonly-relied-on Pebble
 *     feature. See the file header's Phase 3/4 watchpoint about a key
 *     shaped like a `java.lang.Object` bean-property name (`class`, `hash`,
 *     …) — `pebbleIdent` mangles the worst offenders, but the exact
 *     Map-key-vs-bean-getter resolution ORDER needs verifying once the Java
 *     runtime exists.
 *   - `{ kind: 'field', key, isIdent: false }` → `bf.get(base, '<key>')` — a
 *     non-identifier-shaped key (e.g. a `'data-priority'` sibling key) can't
 *     be a bare Pebble dot-accessor. Routed through the adapter's own
 *     `bf.get(receiver, key)` runtime helper instead of Pebble's bracket
 *     subscript or a built-in `attribute()`-style function, because neither
 *     is confirmed (unlike Twig, which has a documented `attribute()`
 *     builtin) — `bf.get` keeps this fully under the Java runtime's own
 *     control (Phase 3).
 */
export function pebbleAccessorFromSegments(
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
      acc = `bf.get(${acc}, '${escapePebbleSingleQuoted(seg.key)}')`
    }
  }
  return acc
}
