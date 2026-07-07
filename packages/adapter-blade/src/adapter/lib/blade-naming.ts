/**
 * Blade/PHP identifier, hash-key, and member/index-access conventions for
 * the Blade adapter.
 *
 * Ported from `packages/adapter-twig/src/adapter/lib/twig-naming.ts`
 * (`twigIdent`/`twigHashKey`/`twigLoopBindingAccessor`), adjusted for the
 * real syntax divergences between Twig and Blade that matter here:
 *
 * 1. **Every variable reference needs the `$` sigil.** Twig has no sigil —
 *    `twigIdent(name)` returned the bare (possibly mangled) name, used
 *    directly as both a read and a `{% set %}` assignment target. Blade
 *    compiles straight to raw PHP, where every variable — read OR write —
 *    is `$name`. `bladeIdent(name)` (this file) mirrors `twigIdent`'s
 *    mangling-only role (used for the PHP array KEY a prop is threaded
 *    through as, e.g. `naming.php`'s `blade_ident`); `bladeVar(name)` is the
 *    NEW wrapper that additionally prepends `$` — every place the Blade
 *    adapter emits a bare variable REFERENCE (identifier read, loop-binding
 *    `@php($x = ...)` target, hash-entry value, …) uses `bladeVar`, not
 *    `bladeIdent` alone.
 * 2. **Hash-literal keys are always quoted, but the literal itself is a PHP
 *    array, not a Twig hash.** `{'k': v}` → `['k' => v]` (mapping table) —
 *    `bladeHashKey` still always quotes (same bareword-key trap Twig/Jinja
 *    have), but every CALL SITE joins entries with `=>` and wraps them in
 *    `[...]`, never `{...}` / `: `.
 * 3. **Member/index access has no raw-PHP polymorphic equivalent.** Twig's
 *    `.`/`[]` transparently resolve an object property, an array key, OR a
 *    getter method on ANY of {stdClass, array, null} under
 *    `strict_variables: false`. Raw PHP has no single operator with that
 *    property — `$x->prop` fatals on a non-object, `$x['key']` warns on
 *    `null`/scalar, and dynamic keys need yet another form. This adapter
 *    uses Laravel's `data_get($target, $key)` (from `illuminate/support`,
 *    already a transitive dependency of `illuminate/view`) uniformly for
 *    BOTH member access (`a.b` → `data_get($a, 'b')`) and index access
 *    (`a[i]` → `data_get($a, $i)`) — verified empirically (see
 *    `bladeMemberAccess`'s docstring) to be null-safe over the same
 *    {stdClass, array, null} value shapes Twig's dot/bracket cover, with NO
 *    runtime helper added to `packages/adapter-php` (the `data_get`
 *    lowering point is entirely on the TS emit side).
 * 4. **Reserved-word set is COMPLETELY DIFFERENT, and for a different
 *    reason.** Twig keywords (`for`, `filter`, `if`, …) collide with Twig's
 *    OWN expression grammar — irrelevant here, since Blade variables are
 *    real PHP variables (`$for`, `$filter` are legal). What collides
 *    instead is anything the Blade/illuminate RENDER-TIME PHP SCOPE already
 *    binds to a different meaning, or a name PHP itself forbids — see
 *    `RESERVED_WORDS`'s docstring below and `php/src/naming.php`'s (this
 *    adapter's PHP-side twin, which MUST mirror this list exactly; each
 *    side carries a parity test against the other).
 */

import type { LoopBindingPathSegment } from '@barefootjs/jsx'

/**
 * Escape a string for a PHP/Blade single-quoted literal: backslash first (so
 * it doesn't double-escape the quote we add next), then the quote. PHP's
 * single-quoted string escaping rules are `\\` and `\'` ONLY (verified:
 * `php -r "echo 'a\\'b';"` → `a'b`) — byte-identical to Twig's own
 * single-quoted escaping, so this function's body is unchanged from
 * `escapeTwigSingleQuoted`.
 */
export function escapeBladeSingleQuoted(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

/**
 * Quote an array-literal KEY for Blade/PHP. Always quotes — a bareword key
 * in a PHP array literal (`[key => value]`) is a syntax error, not a
 * variable lookup (unlike Twig's hash literal, where an unquoted key reads
 * as a variable reference) — but this adapter quotes unconditionally anyway
 * for one uniform rule across every adapter in the family (mirrors
 * `twigHashKey`/`jinjaHashKey`).
 */
export function bladeHashKey(name: string): string {
  return `'${escapeBladeSingleQuoted(name)}'`
}

/**
 * Blade-reserved bare words: names that collide with the Blade/illuminate
 * RENDER-TIME PHP SCOPE (not Blade template syntax — see the file header,
 * divergence 4). Frozen by the adapter design doc; mirrored EXACTLY by
 * `php/src/naming.php`'s `BLADE_RESERVED_WORDS` (parity test on both sides):
 *
 *   - `bf`     — the runtime binding every `$bf->method(...)` call resolves
 *                against; a same-named prop would silently overwrite it.
 *   - `this`   — PHP forbids assigning to `$this` outside object context.
 *   - `__env`  — illuminate/view's `Factory` binds `$__env` in every
 *                compiled view's scope.
 *   - `__data` — `PhpEngine`/`View`'s internal name for the variable bag
 *                before `extract()`.
 *   - `__path` — `PhpEngine::evaluatePath()`'s compiled-file-path variable.
 *   - `app`    — conventionally the container in many Blade/illuminate
 *                integrations' base view scope (defensive; this adapter's
 *                own standalone `Factory` does not bind it).
 *   - `loop`   — Blade's `@foreach` directive injects `$loop` (iteration
 *                metadata) into the loop body scope.
 */
const RESERVED_WORDS = new Set(['bf', 'this', '__env', '__data', '__path', 'app', 'loop'])

/**
 * Mangle a JS identifier (prop name, signal getter, loop param, …) into a
 * Blade-safe NAME: reserved words get a trailing `_` suffix, everything else
 * passes through unchanged. This is the BARE (no `$`) form — used for a PHP
 * array KEY a prop is threaded through as (`naming.php`'s `blade_ident`,
 * `BladeBackend::render_named`'s per-prop mangling). Every place the adapter
 * emits an actual Blade VARIABLE REFERENCE uses `bladeVar` (below), which
 * wraps this with the `$` sigil Twig's `twigIdent` never needed.
 */
export function bladeIdent(name: string): string {
  return RESERVED_WORDS.has(name) ? `${name}_` : name
}

/**
 * Mangle a JS identifier into a Blade VARIABLE REFERENCE (`$name` or
 * `$name_` when reserved) — the sigil-bearing counterpart of `bladeIdent`,
 * used at every point the adapter emits a bare variable read OR a
 * `@php($NAME = ...)` assignment target (mirrors every `twigIdent(...)`
 * call site in the Twig port, since Twig had no sigil to add).
 */
export function bladeVar(name: string): string {
  return `$${bladeIdent(name)}`
}

/**
 * Member access lowering: `a.b` → `data_get($a, 'b')`. Uniform, null-safe
 * over `stdClass` (JSON-decoded objects), PHP assoc arrays (runtime helper
 * outputs), and `null` — verified empirically:
 *
 *   php -r 'require "vendor/autoload.php";
 *     $o = json_decode("{\"a\":{\"b\":1}}");
 *     var_dump(data_get($o, "a.b"));        // int(1)
 *     var_dump(data_get($o, "missing.x"));  // NULL (no warning)
 *     var_dump(data_get(null, "a.b"));      // NULL (no warning)'
 *
 * `data_get` treats a key with no `.` as ONE top-level segment (not a
 * multi-hop path), so a literal property name that itself happens to
 * contain a `.` character would be misread as a nested path — accepted as a
 * known, narrow limitation (JS field/prop names essentially never contain a
 * literal dot; no adapter-conformance fixture does).
 */
export function bladeMemberAccess(objectExpr: string, property: string): string {
  return `data_get(${objectExpr}, '${escapeBladeSingleQuoted(property)}')`
}

/**
 * Index access lowering: `a[i]` → `data_get($a, $i)`. `data_get` accepts a
 * non-string (int, or a PHP expression evaluating to int/string) segment
 * directly — verified empirically: `data_get(['a','b','c'], $i)` with
 * `$i = 1` → `'b'`. Same null-safety as `bladeMemberAccess`.
 */
export function bladeIndexAccess(objectExpr: string, indexExpr: string): string {
  return `data_get(${objectExpr}, ${indexExpr})`
}

/**
 * Build a Blade/PHP accessor expression that walks a `.map()` destructure
 * binding's structured `segments` path (#2087 Phase A, `LoopBindingPathSegment`)
 * off `base` — the per-iteration loop var (`$__bf_item`) for a fixed binding
 * or a top-level rest binding, or an already-built PARENT accessor for a
 * nested rest binding (`segments` there is the prefix up to, not including,
 * the rest token).
 *
 * UNLIKE `twigLoopBindingAccessor` (which branches on bracket-subscript vs.
 * dot-access vs. the `attribute()` builtin depending on whether a `field`
 * segment's key is identifier-safe), every segment here — `index` OR `field`,
 * ident-safe or not — routes through the SAME uniform `data_get` accessor
 * (see the file header, divergence 3): there is no raw-PHP polymorphic
 * operator to special-case around in the first place, so there is nothing to
 * branch on. This is strictly SIMPLER than the Twig port.
 */
export function bladeLoopBindingAccessor(
  base: string,
  segments: readonly LoopBindingPathSegment[],
): string {
  let acc = base
  for (const seg of segments) {
    acc = seg.kind === 'index'
      ? `data_get(${acc}, ${seg.index})`
      : bladeMemberAccess(acc, seg.key)
  }
  return acc
}
