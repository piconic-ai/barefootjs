<?php

declare(strict_types=1);

namespace Barefoot;

/**
 * Reserved-word mangling for Blade template variable names -- SIBLING of
 * `packages/adapter-twig/php/src/naming.php` (`twig_ident`/`TWIG_RESERVED_WORDS`)
 * but with a COMPLETELY DIFFERENT reserved-word set, because the underlying
 * mechanism is different: Twig resolves a bare `name` through its own
 * expression-language variable lookup, so Twig KEYWORDS (`for`, `filter`,
 * `if`, `in`, ...) collide with template syntax and must be mangled. Blade
 * compiles a template straight to a plain PHP file and binds template
 * variables as REAL PHP variables via `extract()` (illuminate/view's
 * `PhpEngine`/`CompilerEngine`) -- so Twig's keyword list is IRRELEVANT here
 * (`$for`, `$filter`, `$if` are all perfectly legal PHP variable names).
 *
 * What DOES collide for Blade is anything the render-time PHP SCOPE already
 * binds to a name other than the incoming prop, or any name PHP itself
 * forbids as a variable:
 *
 *   - `bf`     -- the runtime binding this adapter's every `bf.method(...)`
 *                 call compiles to `$bf->method(...)`; a prop named `bf`
 *                 would silently overwrite the runtime handle.
 *   - `this`   -- PHP does not allow assigning to `$this` at all outside an
 *                 object context (`Cannot re-assign $this` fatal error).
 *   - `__env`  -- illuminate/view's `Factory` binds `$__env` in every
 *                 compiled view's scope (used by `@section`/`@yield`/etc).
 *   - `__data` -- `PhpEngine::evaluatePath()` / `Illuminate\View\View` use
 *                 `$__data` as the internal name for the variable bag before
 *                 `extract()`; a same-named prop would collide with the
 *                 extraction mechanism itself.
 *   - `__path` -- same layer, `PhpEngine::evaluatePath()` binds `$__path` to
 *                 the compiled-template file path being included.
 *   - `app`    -- Blade/illuminate conventionally expose the container as
 *                 `$app` in many integrations' base view scope; kept reserved
 *                 defensively even though this adapter's standalone
 *                 `Factory` (no framework container) does not bind it itself.
 *   - `loop`   -- Blade's `@foreach` directive injects a `$loop` variable
 *                 (iteration metadata) into the loop body scope; this
 *                 adapter does not itself rely on Blade's `$loop`, but a
 *                 same-named prop landing in an ancestor scope could still
 *                 be shadowed by a NESTED `@foreach`'s own `$loop` -- reserved
 *                 to avoid ANY ambiguity.
 *
 * `blade_ident(name)` is the single mangling point: every props dict handed
 * to a Blade template as top-level variables (`BladeBackend::render_named`,
 * `BarefootJS::render_child`'s prop passing) is mangled through this
 * function first, so a prop with one of the names above doesn't collide with
 * the Blade/illuminate render-time scope. The mangling MUST match, byte for
 * byte, `packages/adapter-blade/src/adapter/lib/blade-naming.ts`'s
 * `BLADE_RESERVED_WORDS` list and `bladeIdent()` -- the TS side additionally
 * runs a parity test against this file's list.
 *
 * This file is registered as a composer "files" autoload entry (loaded
 * unconditionally on every request via a plain `require`, not
 * `require_once`) AND is `require_once`'d directly by
 * `php/tests/_harness.php::bf_require_runtime()` for the Blade-independent
 * test files. `define()`/`function_exists()` guards (rather than a bare
 * top-level `const`/`function`, which cannot appear inside a conditional in
 * PHP) make loading this file twice -- regardless of which mechanism gets
 * there first -- a safe no-op instead of a "Cannot redeclare" fatal error.
 */

if (!defined(__NAMESPACE__ . '\\BLADE_RESERVED_WORDS')) {
    /** @var list<string> BLADE_RESERVED_WORDS */
    define(__NAMESPACE__ . '\\BLADE_RESERVED_WORDS', [
        'bf', 'this', '__env', '__data', '__path', 'app', 'loop',
    ]);
}

if (!function_exists(__NAMESPACE__ . '\\blade_ident')) {
    /**
     * Mangle a JS identifier (prop name, signal getter, loop param, ...)
     * into a Blade-safe (i.e. render-time-PHP-scope-safe) variable name:
     * reserved words get a trailing `_` suffix, everything else passes
     * through unchanged.
     */
    function blade_ident(string $name): string
    {
        return in_array($name, BLADE_RESERVED_WORDS, true) ? $name . '_' : $name;
    }
}
