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

/** Pebble 4.1.2 unescapes quotes but preserves doubled backslashes. */
export function pebbleStringLiteral(value: string): string {
  const parts = value.split('\\').map(part => `'${part.replaceAll("'", "\\'")}'`)
  if (parts.length === 1) return parts[0]
  return `(${parts.join(" ~ bf.at('\\\\', 0) ~ ")})`
}

/**
 * Quote a map-literal KEY for Pebble. Always quotes — see the file header
 * for why a bareword key would silently become a variable lookup instead of
 * a string key.
 */
export function pebbleHashKey(name: string): string {
  return pebbleStringLiteral(name)
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
  // The engine binds its own `loop` inside `{% for %}`, so a JS `loop` takes
  // the compiler-internal `__bf_loop` (#3404). Unlike a `_` suffix it cannot
  // collide with a real `loop_`, and mangling it again leaves it unchanged.
  if (name === 'loop') return '__bf_loop'
  return RESERVED_WORDS.has(name) ? `${name}_` : name
}

/**
 * Build a Pebble accessor expression from a `.map()` destructure binding's
 * structured {@link LoopBindingPathSegment} path (never string-parses the
 * JS accessor suffix — repo rule), walking `segments` off `base` (the
 * already-`pebbleIdent`-mangled loop variable, or a parent accessor for a
 * nested rest binding).
 *
 * Every step — an `index` or a `field`, identifier-safe or not — reads
 * through the runtime's `bf.get(base, key)` (#3848 U7): JS reads a missing
 * field or an out-of-range index as `undefined`, Pebble's dot / bracket
 * subscript (`Map.get` / `List.get`) as `null` (JS `null`). `bf.get` is the
 * one single-level own-key read over the SSR item shapes this walk touches
 * (a `Map<String, Object>` object or a `List` array), the same JS
 * ToPropertyKey read the callback evaluator makes.
 */
export function pebbleAccessorFromSegments(
  base: string,
  segments: readonly LoopBindingPathSegment[],
): string {
  let acc = base
  for (const seg of segments) {
    acc = `bf.get(${acc}, ${seg.kind === 'index' ? seg.index : pebbleStringLiteral(seg.key)})`
  }
  return acc
}
