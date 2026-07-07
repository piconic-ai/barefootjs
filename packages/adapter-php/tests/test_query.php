<?php

declare(strict_types=1);

/**
 * `BarefootJS::query` -- ported from packages/adapter-perl/t/query.t (see
 * also the Python port's test_query.py).
 *
 * The full CROSS-BACKEND behaviour (control flow + form-encoding parity
 * with the browser's URLSearchParams) is defined ONCE in the shared golden
 * helper vectors and run by test_helper_vectors.php. This file keeps a few
 * representative cases for always-on coverage plus the PHP-runtime-SPECIFIC
 * defensive behaviour the golden vectors can't express: a `null` value
 * (JSON has no `undefined`; this runtime coerces `null` to '' and omits the
 * empty pair, mirroring the Perl/Python ports' documented `undef`/`None`
 * handling).
 */

require_once __DIR__ . '/_harness.php';
bf_require_runtime();
bf_reset();

use Barefoot\BarefootJS;

$bf = new BarefootJS(null, ['backend' => null]);

bf_test('order preserved; repeated key overwrites at first position', function () use ($bf) {
    bf_assert_eq(
        $bf->query('/blog', true, 'sort', 'title', true, 'tag', 'go', true, 'sort', 'date'),
        '/blog?sort=date&tag=go'
    );
});

bf_test('form encoding: tilde, star, space', function () use ($bf) {
    bf_assert_eq($bf->query('/s', true, 't', 'a~b *c'), '/s?t=a%7Eb+*c');
});

bf_test('array value appends one pair per non-empty member', function () use ($bf) {
    bf_assert_eq($bf->query('/list', true, 'tag', ['a', '', 'b']), '/list?tag=a&tag=b');
});

bf_test('null value coerces to empty and is omitted', function () use ($bf) {
    bf_assert_eq($bf->query('/list', true, 'tag', null), '/list');
    bf_assert_eq($bf->query('/list', true, 'tag', null, true, 'keep', 'me'), '/list?keep=me');
});

return bf_finish();
