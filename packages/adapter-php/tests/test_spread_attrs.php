<?php

declare(strict_types=1);

/**
 * `BarefootJS::spread_attrs` -- ported from
 * packages/adapter-perl/t/spread_attrs.t (see also the Python port's
 * test_spread_attrs.py).
 *
 * JSX intrinsic-element spread runtime helper (#1407 follow-up). Mirrors
 * the JS `spreadAttrs` runtime and the Go/Perl/Python adapters' equivalents
 * so SSR output stays byte-equal across every adapter -- cross-adapter
 * parity regressions surface here first.
 */

require_once __DIR__ . '/_harness.php';
bf_require_runtime();
bf_reset();

use Barefoot\BarefootJS;

$backend = new class {
    public function mark_raw($s)
    {
        return $s;
    }
};

function bfs_run($bag): string
{
    global $backend;
    $bf = new BarefootJS(null, ['backend' => $backend]);
    return (string) $bf->spread_attrs($bag);
}

bf_test('basic shapes', function () {
    bf_assert_eq(bfs_run(null), '');
    bf_assert_eq(bfs_run([]), '');
    bf_assert_eq(bfs_run('not a hash'), '');
    bf_assert_eq(bfs_run(['id' => 'a']), 'id="a"');
});

bf_test('alphabetic key order', function () {
    bf_assert_eq(bfs_run(['id' => 'a', 'class' => 'on']), 'class="on" id="a"');
});

bf_test('key remapping', function () {
    bf_assert_eq(bfs_run(['className' => 'foo']), 'class="foo"');
    bf_assert_eq(bfs_run(['htmlFor' => 'x']), 'for="x"');
    bf_assert_eq(bfs_run(['dataPriority' => 'high']), 'data-priority="high"');
    // SVG XML attrs are case-sensitive -- preserve verbatim.
    bf_assert_eq(bfs_run(['viewBox' => '0 0 10 10']), 'viewBox="0 0 10 10"');
    bf_assert_eq(bfs_run(['clipPathUnits' => 'userSpaceOnUse']), 'clipPathUnits="userSpaceOnUse"');
    // JS-reference parity (#1411): a leading uppercase letter emits a leading dash.
    bf_assert_eq(bfs_run(['XData' => 'x']), '-x-data="x"');
});

bf_test('event handlers -- JS predicate parity', function () {
    bf_assert_eq(bfs_run(['onClick' => 'fn', 'id' => 'a']), 'id="a"');
    bf_assert_eq(bfs_run(['on_custom' => 'fn', 'id' => 'a']), 'id="a"');
    bf_assert_eq(bfs_run(['on0' => 'fn', 'id' => 'a']), 'id="a"');
    bf_assert_eq(bfs_run(['oncology' => 'x']), 'oncology="x"');
});

bf_test('children skipped, ref passed through', function () {
    bf_assert_eq(bfs_run(['children' => 'x', 'id' => 'a']), 'id="a"');
    // JS `spreadAttrs` does NOT filter `ref` (`applyRestAttrs` does -- a
    // separate divergence).
    bf_assert_eq(bfs_run(['ref' => 'x', 'id' => 'a']), 'id="a" ref="x"');
});

bf_test('boolean values', function () {
    // Contract: callers MUST pass a real PHP bool for boolean attributes --
    // no sentinel object is needed (PHP has a real boolean type).
    bf_assert_eq(bfs_run(['hidden' => true, 'id' => 'a']), 'hidden id="a"');
    bf_assert_eq(bfs_run(['hidden' => false, 'id' => 'a']), 'id="a"');
    // Plain numeric 0 renders as a value (matches `tabindex="0"`).
    bf_assert_eq(bfs_run(['tabindex' => 0]), 'tabindex="0"');
});

bf_test('nullish skip', function () {
    bf_assert_eq(bfs_run(['a' => null, 'b' => 'x']), 'b="x"');
});

bf_test('HTML escape', function () {
    bf_assert_eq(bfs_run(['title' => '<b>"x"</b>']), 'title="&lt;b&gt;&#34;x&#34;&lt;/b&gt;"');
    bf_assert_eq(bfs_run(['alt' => 'tom & jerry']), 'alt="tom &amp; jerry"');
});

bf_test('style object lowering', function () {
    bf_assert_eq(
        bfs_run(['style' => ['backgroundColor' => 'red', 'color' => 'white']]),
        'style="background-color:red;color:white"'
    );
    bf_assert_eq(bfs_run(['style' => 'color:red']), 'style="color:red"');
});

return bf_finish();
