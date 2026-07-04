<?php

declare(strict_types=1);

/**
 * Real end-to-end Twig render, modeled on packages/adapter-xslate/t/render.t
 * and the Python port's test_render.py.
 *
 * Writes a `.twig` template equivalent to what the `@barefootjs/twig`
 * compile-time adapter emits, then renders it through the runtime +
 * TwigBackend. Exercises scope markers, hydration attrs, text slots via
 * HTML comment markers, autoescaping, and `spread_attrs`.
 *
 * Needs `twig/twig` installed (`composer install`); skips gracefully with a
 * notice (not a failure) when `vendor/autoload.php` is absent, per the
 * design doc.
 */

require_once __DIR__ . '/_harness.php';
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
