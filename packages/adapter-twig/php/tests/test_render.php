<?php

declare(strict_types=1);

/**
 * Real end-to-end Twig render, modeled on packages/adapter-xslate/t/render.t
 * and the Python port's test_render.py.
 *
 * Writes a `.twig` template equivalent to what the `@barefootjs/twig`
 * compile-time adapter emits, then renders it through the runtime +
 * TwigBackend. Exercises scope markers, hydration attrs, text slots via
 * HTML comment markers, autoescaping, `spread_attrs`, and (being the one
 * place a REAL TwigBackend is available) Twig-specific reserved-word
 * mangling end-to-end.
 *
 * Needs `twig/twig` installed (`composer install`); skips gracefully with a
 * notice (not a failure) when `vendor/autoload.php` is absent, per the
 * design doc.
 *
 * This is the only test file left in this package (the engine-agnostic
 * runtime's test suite moved to `packages/adapter-php/tests`, see #2100) --
 * it requires that package's `_harness.php` directly via a relative path
 * rather than keeping a local copy or a single-file `run.php` here, and
 * still runs standalone via `php test_render.php` (`bf_finish()` prints +
 * `exit()`s when `BF_RUNNER` is undefined, which it is here).
 */

require_once __DIR__ . '/../../../adapter-php/tests/_harness.php';
bf_require_runtime();
bf_reset();

$vendorAutoload = __DIR__ . '/../vendor/autoload.php';
if (!is_file($vendorAutoload)) {
    bf_skip_file('twig/twig not installed -- run `composer install --working-dir=' . dirname(__DIR__) . '` to enable this test');
    return bf_finish();
}
require_once $vendorAutoload;

use Barefoot\BarefootJS;
use Barefoot\TwigBackend;

$tmpDir = sys_get_temp_dir() . '/barefoot-twig-render-test-' . bin2hex(random_bytes(6));
mkdir($tmpDir, 0777, true);
register_shutdown_function(function () use ($tmpDir) {
    foreach (glob($tmpDir . '/*') ?: [] as $f) {
        @unlink($f);
    }
    @rmdir($tmpDir);
});

// Twig idiom note: helpers that return already-safe HTML syntax but are NOT
// wrapped by the backend's `mark_raw` (`scope_attr`, `hydration_attrs`,
// `text_start`, `text_end`, `comment`, `scope_comment`) need an explicit
// `| raw` filter at the call site -- the Twig-syntax equivalent of Kolon's
// `| mark_raw` pipe / Jinja's `| safe`. `spread_attrs` already returns a
// `Twig\Markup` value (via `backend.mark_raw`), so it needs no filter.
$widgetTemplate = '<div bf-s="{{ bf.scope_attr() }}" {{ bf.hydration_attrs() | raw }}>'
    . "count: {{ bf.text_start('s0') | raw }}{{ count }}{{ bf.text_end() | raw }} "
    . '<span {{ bf.spread_attrs(attrs) }}>{{ label }}</span>'
    . '</div>';

file_put_contents($tmpDir . '/widget.twig', $widgetTemplate);

$backend = new TwigBackend(['paths' => [$tmpDir]]);
$bf = new BarefootJS(null, ['backend' => $backend]);
$bf->_scope_id('Widget_test');

$vars = ['count' => 7, 'label' => '<x>', 'attrs' => ['id' => 'n', 'class' => 'c']];

bf_test('scope and hydration markers', function () use ($backend, $bf, $vars) {
    $out = $backend->render_named('widget', $bf, $vars);
    bf_assert(str_contains($out, 'bf-s="Widget_test" bf-r=""'), "got: {$out}");
});

bf_test('reactive text slot with comment markers', function () use ($backend, $bf, $vars) {
    $out = $backend->render_named('widget', $bf, $vars);
    bf_assert(str_contains($out, 'count: <!--bf:s0-->7<!--/-->'), "got: {$out}");
});

bf_test('plain interpolation is autoescaped', function () use ($backend, $bf, $vars) {
    $out = $backend->render_named('widget', $bf, $vars);
    bf_assert(str_contains($out, '&lt;x&gt;'), "got: {$out}");
});

bf_test('spread_attrs renders raw with sorted keys', function () use ($backend, $bf, $vars) {
    $out = $backend->render_named('widget', $bf, $vars);
    bf_assert(str_contains($out, '<span class="c" id="n">'), "got: {$out}");
});

// Fragment-rooted scope comment pair (#2289): `renderFragment`'s Twig
// output shape -- begin marker, children, end marker -- rendered through
// real Twig so the `| raw` filter chain is exercised, not just the
// underlying PHP methods (see the runtime-level pin in
// packages/adapter-php/tests/test_scope_comment.php).
file_put_contents($tmpDir . '/frag.twig', '{{ bf.scope_comment() | raw }}<span>A</span><span>{{ count }}</span>{{ bf.scope_comment_end() | raw }}');

bf_test('fragment scope: begin/end markers pair with the same scope id', function () use ($backend, $tmpDir) {
    $fragBf = new BarefootJS(null, ['backend' => $backend]);
    $fragBf->_scope_id('FragmentDemo_test');
    $out = $backend->render_named('frag', $fragBf, ['count' => 3]);
    bf_assert(str_starts_with($out, '<!--bf-scope:FragmentDemo_test-->'), "expected leading begin marker, got: {$out}");
    bf_assert(str_ends_with($out, '<!--bf-/scope:FragmentDemo_test-->'), "expected trailing end marker, got: {$out}");
});

bf_test('backend unit operations', function () use ($backend) {
    bf_assert_eq($backend->materialize('plain'), 'plain');
    bf_assert_eq($backend->materialize(fn () => 'lazy'), 'lazy');
    $encoded = $backend->encode_json(['b' => 2, 'a' => 1]);
    bf_assert_eq($encoded, '{"a":1,"b":2}'); // canonical (sorted) key order
});

bf_test('render_named mangles reserved-word props', function () use ($backend, $bf, $tmpDir) {
    file_put_contents($tmpDir . '/kw.twig', '{{ for_ }}-{{ if_ }}');
    $out = $backend->render_named('kw', $bf, ['for' => 'X', 'if' => 'Y']);
    bf_assert_eq($out, 'X-Y');
});

bf_test('render_child end-to-end (parent -> renderer -> render_named)', function () use ($backend, $bf, $tmpDir) {
    file_put_contents($tmpDir . '/parent.twig', "parent:{{ bf.render_child('child', 'for', 'c1', 'label', 'hi') }}");
    file_put_contents($tmpDir . '/child.twig', '[{{ for_ }}:{{ label }}]');

    $childRenderer = function ($props, $caller) use ($backend) {
        $childBf = new BarefootJS(null, ['backend' => $backend]);
        return $backend->render_named('child', $childBf, $props);
    };
    $bf->register_child_renderer('child', $childRenderer);
    $out = $backend->render_named('parent', $bf, []);
    bf_assert_eq($out, 'parent:[c1:hi]');
});

bf_test('render_child mangles reserved-word props via backend->ident (Twig-specific)', function () use ($backend, $bf) {
    // `BarefootJS::render_child` (packages/adapter-php) delegates key
    // mangling to the backend's `ident()` rather than hard-coding Twig's
    // reserved-word set. This probes that delegation directly (a renderer
    // that reads its raw `$props`, not routed back through
    // `render_named`'s OWN mangling pass) so the contract is verified in
    // isolation, not just as an accidental side effect of `render_named`
    // mangling everything a second time. Uses `for`, the Twig-specific
    // reserved word (naming.php's TWIG_RESERVED_WORDS, frozen per the
    // design doc) -- differs from Jinja/Python's set (`class` is Python-
    // reserved but not Twig-reserved, and vice versa for `for`).
    $seen = [];
    $bf->register_child_renderer('probe', function ($props, $caller) use (&$seen) {
        $seen['props'] = $props;
        return 'ok';
    });
    $bf->render_child('probe', 'for', 'x', 'id', 'y');
    bf_assert_eq($seen['props']['for_'], 'x');
    bf_assert_eq($seen['props']['id'], 'y');
    bf_assert(!array_key_exists('for', $seen['props']), 'expected the raw "for" key to be gone after mangling');
});

// Custom-escaper sanity check (design doc §2): plain `{{ }}` interpolation
// uses Twig's OWN default 'html' escaper (named entities), while the
// runtime's mark_raw-wrapped helpers (spread_attrs) use numeric entities.
// Both are exercised here on a `"` and a `'`.
bf_test('autoescape vs. spread_attrs escaping on quote characters', function () use ($tmpDir) {
    file_put_contents($tmpDir . '/quotes.twig', '{{ raw }} | <span {{ bf.spread_attrs(attrs) }}></span>');
    $backend2 = new TwigBackend(['paths' => [$tmpDir]]);
    $bf2 = new BarefootJS(null, ['backend' => $backend2]);
    $out = $backend2->render_named('quotes', $bf2, ['raw' => "he said \"hi\" & 'bye'", 'attrs' => ['title' => "quote\" and 'apos'"]]);
    // Twig's default autoescaper: &#34;/&#039; (or &quot;); the runtime's
    // own spread_attrs escaper: &#34;/&#39; (numeric, both sides).
    bf_assert(str_contains($out, '&amp;'), "expected an escaped '&' in: {$out}");
    bf_assert(str_contains($out, 'title="quote&#34; and &#39;apos&#39;"'), "expected numeric-entity escaping from spread_attrs in: {$out}");
});

return bf_finish();
