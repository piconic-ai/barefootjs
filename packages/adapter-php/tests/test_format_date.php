<?php

declare(strict_types=1);

/**
 * `BarefootJS::format_date` tz error contract (#2344).
 *
 * Canonical IANA zone names resolve through PHP's timezone database; an
 * unresolvable `$tz` THROWS InvalidArgumentException — the loud-not-silent
 * replacement for the pre-#2344 normalize-to-UTC total function. The
 * resolvable grid is pinned by the golden vectors
 * (test_helper_vectors.php); this file pins the error side, which is
 * outside the vector domain (spec/template-helpers.md JS-throws rule).
 * PHP's tz layer accepts a superset of the canonical IDs (case-folded
 * spellings like 'asia/tokyo', bare offset strings like '+9:00') — the JS
 * reference throws there, so that region is unspecified by the spec and
 * deliberately not asserted here.
 */

require_once __DIR__ . '/_harness.php';
bf_require_runtime();
bf_reset();

use Barefoot\BarefootJS;

$bf = new BarefootJS(null, ['backend' => new class {
    public function mark_raw($s)
    {
        return $s;
    }
}]);

const BF_FD_RECV = '2024-01-01T23:00:00.000Z';

bf_test('unresolvable timeZone values throw', function () use ($bf) {
    foreach (['garbage', 'Asia/Tokyoo', 'Local', ''] as $tz) {
        try {
            $bf->format_date(BF_FD_RECV, 'YYYY-MM-DD', $tz);
            bf_assert_eq("no exception for $tz", 'InvalidArgumentException');
        } catch (\InvalidArgumentException $e) {
            bf_assert_eq(true, true);
        }
    }
});

bf_test('receiver contract precedes tz validation', function () use ($bf) {
    // nil / unparseable receivers render '' without inspecting tz.
    bf_assert_eq($bf->format_date(null, 'YYYY-MM-DD', 'garbage'), '');
    bf_assert_eq($bf->format_date('not a date', 'YYYY-MM-DD', 'garbage'), '');
});

bf_test('named zone happy path', function () use ($bf) {
    // Redundant with the golden vectors, but keeps this file
    // self-sufficient outside the monorepo checkout.
    bf_assert_eq($bf->format_date(BF_FD_RECV, 'YYYY-MM-DD', 'Asia/Tokyo'), '2024-01-02');
});

return bf_finish();
