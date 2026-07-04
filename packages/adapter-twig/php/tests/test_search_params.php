<?php

declare(strict_types=1);

/**
 * `BarefootJS::SearchParams` -- PHP-specific concerns, ported from
 * packages/adapter-perl/t/search_params.t (see also the Python port's
 * test_search_params.py).
 *
 * The cross-language VALUE semantics of `get` are owned by the
 * language-independent golden vectors (`search_params_get` in
 * test_helper_vectors.php), so Go/Perl/Python/PHP parity there is
 * mechanical. This file covers only what those value vectors can't: the
 * lazy factory seam, lenient parsing (never raises), and UTF-8 decoding.
 */

require_once __DIR__ . '/_harness.php';
bf_require_runtime();
bf_reset();

use Barefoot\BarefootJS;
use Barefoot\SearchParams;

bf_test('lazy factory', function () {
    $sp = BarefootJS::search_params('sort=price');
    bf_assert($sp instanceof SearchParams, 'expected a SearchParams instance');
    bf_assert_eq($sp->get('sort'), 'price');
    bf_assert(BarefootJS::search_params() instanceof SearchParams, 'expected a SearchParams instance for the default query');
});

bf_test('null-ish composition coalesces only an absent key', function () {
    // The adapter lowers `searchParams().get(k) ?? d` to Twig's native `??`,
    // which coalesces only `null` (not a bare `or`, which would also
    // default a present-but-empty value) -- so an absent key falls back to
    // the author's default while a present-but-empty value keeps ''.
    $absent = BarefootJS::search_params('other=x');
    $got = $absent->get('sort');
    bf_assert_eq($got ?? 'none', 'none');

    $empty = BarefootJS::search_params('sort=');
    $got = $empty->get('sort');
    bf_assert_eq($got ?? 'none', '');
});

bf_test('UTF-8 percent-decoding', function () {
    $sp = BarefootJS::search_params('q=%E2%9C%93');
    bf_assert_eq($sp->get('q'), "\xE2\x9C\x93"); // U+2713 CHECK MARK
});

bf_test('lenient parsing never raises', function () {
    BarefootJS::search_params(''); // should not raise
    bf_assert_eq(BarefootJS::search_params('&&&')->get('x'), null);
    bf_assert_eq(BarefootJS::search_params('=novalue')->get('x'), null);
});

return bf_finish();
