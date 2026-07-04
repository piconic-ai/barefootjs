<?php

declare(strict_types=1);

namespace Barefoot;

/**
 * Reserved-word mangling for Twig template variable names -- port of
 * packages/adapter-jinja/python/barefootjs/runtime.py's `jinja_ident` /
 * `RESERVED_WORDS`, itself the Python analogue of the TS emitter's
 * `packages/adapter-jinja/src/adapter/lib/jinja-naming.ts`.
 *
 * The Twig reserved-word set is FROZEN by the adapter design doc (section 3,
 * policy 5) and mirrored EXACTLY here and in
 * `packages/adapter-twig/src/lib/twig-naming.ts` -- the two lists MUST be
 * kept in lock-step (each side carries this docstring cross-pointer; the TS
 * side additionally runs a parity test against this file's list).
 *
 * `twig_ident(name)` is the single mangling point: every props dict handed
 * to a Twig template as top-level variables (`TwigBackend::render_named`,
 * `BarefootJS::render_child`'s prop passing) is mangled through this
 * function first, so a prop literally named e.g. `for` or `filter` doesn't
 * collide with Twig syntax.
 *
 * This file is registered as a composer "files" autoload entry (loaded
 * unconditionally on every request via a plain `require`, not
 * `require_once`) AND is `require_once`'d directly by
 * `php/tests/_harness.php::bf_require_runtime()` for the Twig-independent
 * test files. `define()`/`function_exists()` guards (rather than a bare
 * top-level `const`/`function`, which cannot appear inside a conditional in
 * PHP) make loading this file twice -- regardless of which mechanism gets
 * there first -- a safe no-op instead of a "Cannot redeclare" fatal error.
 */

if (!defined(__NAMESPACE__ . '\\TWIG_RESERVED_WORDS')) {
    /** @var list<string> TWIG_RESERVED_WORDS */
    define(__NAMESPACE__ . '\\TWIG_RESERVED_WORDS', [
        'and', 'or', 'not', 'in', 'is', 'matches', 'starts', 'ends', 'if', 'else', 'elseif',
        'for', 'set', 'true', 'false', 'null', 'none', 'with', 'block', 'macro', 'import',
        'from', 'as', 'extends', 'include', 'embed', 'use', 'filter', 'do', 'then', 'endif',
        'endfor', 'endset', 'defined', 'same', 'divisible', 'constant', 'even', 'odd', 'iterable',
    ]);
}

if (!function_exists(__NAMESPACE__ . '\\twig_ident')) {
    /**
     * Mangle a JS identifier (prop name, signal getter, loop param, ...)
     * into a Twig-safe variable name: reserved words get a trailing `_`
     * suffix, everything else passes through unchanged.
     */
    function twig_ident(string $name): string
    {
        return in_array($name, TWIG_RESERVED_WORDS, true) ? $name . '_' : $name;
    }
}
