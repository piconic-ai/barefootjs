<?php

declare(strict_types=1);

/**
 * `render_child` renderer-invocation contract, ported from
 * packages/adapter-perl/t/render_child.t (see also the Python port's
 * test_render_child.py).
 *
 * Renderer contract (#1897): the renderer is invoked with `(props,
 * invoking_bf)` so nested renders can chain scope/slot identity off the
 * caller, not the registrant. Uses a StubBackend (no Twig dependency).
 */

require_once __DIR__ . '/_harness.php';
bf_require_runtime();
bf_reset();

use Barefoot\BarefootJS;

$stubBackend = new class {
    public function materialize($value)
    {
        return is_callable($value) ? $value() : $value;
    }
};

function bfrc_new_bf(): BarefootJS
{
    global $stubBackend;
    return new BarefootJS(null, ['backend' => $stubBackend]);
}

bf_test('renderer receives the invoking instance', function () {
    $bf = bfrc_new_bf();
    $bf->_scope_id('Root_test');

    $seen = [];
    $probe = function ($props, $caller) use (&$seen) {
        $seen['props'] = $props;
        $seen['caller'] = $caller;
        return 'ok';
    };
    $bf->register_child_renderer('probe', $probe);

    bf_assert_eq($bf->render_child('probe', 'value', 1), 'ok');
    bf_assert_eq($seen['props']['value'], 1);
    bf_assert($seen['caller'] === $bf, 'expected the caller to be the invoking bf');

    // A nested invocation from a different instance passes THAT instance.
    $child = bfrc_new_bf();
    $child->_scope_id('Root_test_s0');
    $child->_child_renderers($bf->_child_renderers());
    $child->render_child('probe');
    bf_assert($seen['caller'] === $child, 'expected the caller to be the nested child instance');
});

bf_test('renderer exceptions propagate', function () {
    $bf = bfrc_new_bf();
    $bf->register_child_renderer('boom', function ($props, $caller) {
        throw new \RuntimeException('renderer exploded');
    });

    try {
        $bf->render_child('boom');
        bf_assert(false, 'expected an exception to propagate');
    } catch (\RuntimeException $e) {
        bf_assert_eq($e->getMessage(), 'renderer exploded');
    }
});

bf_test('single-array form', function () {
    // Mirrors the Perl port's hashref form for callers that can't splat a
    // hash into positional/keyword args.
    $bf = bfrc_new_bf();
    $seen = [];
    $bf->register_child_renderer('probe', function ($props, $caller) use (&$seen) {
        $seen['props'] = $props;
        return 'ok';
    });
    $bf->render_child('probe', ['value' => 42]);
    bf_assert_eq($seen['props']['value'], 42);
});

bf_test('missing renderer raises', function () {
    $bf = bfrc_new_bf();
    try {
        $bf->render_child('missing');
        bf_assert(false, 'expected a RuntimeException');
    } catch (\RuntimeException $e) {
        bf_assert(str_contains($e->getMessage(), 'missing'), 'expected the message to name the missing renderer');
    }
});

bf_test('reserved-word prop is mangled', function () {
    // Twig's reserved-word set (naming.php's TWIG_RESERVED_WORDS, frozen per
    // the design doc) differs from Jinja/Python's -- `for` is reserved in
    // Twig (the `{% for %}` tag) but `class` is not, unlike Python's `class`
    // keyword. Use `for`, the Twig-specific reserved word, here.
    $bf = bfrc_new_bf();
    $seen = [];
    $bf->register_child_renderer('probe', function ($props, $caller) use (&$seen) {
        $seen['props'] = $props;
        return 'ok';
    });
    $bf->render_child('probe', ['for' => 'x', 'id' => 'y']);
    bf_assert_eq($seen['props']['for_'], 'x');
    bf_assert_eq($seen['props']['id'], 'y');
    bf_assert(!array_key_exists('for', $seen['props']), 'expected the raw "for" key to be gone after mangling');
});

return bf_finish();
