<?php

declare(strict_types=1);

/**
 * `BarefootJS::omit` -- object-rest destructure residual (#2087 Phase B).
 *
 * Backs the Twig adapter's `.map(({ id, title, ...rest }) => ...)` lowering
 * (`twig-adapter.ts`'s `renderLoop`): each loop iteration binds `rest` to
 * `bf.omit(item, [excludeKeys])`, a TRUE residual hash (every key of the
 * item except the ones the pattern destructured explicitly), not an alias
 * of the whole item. Every template-adapter runtime ships the same helper
 * under the same contract (#2087 Phase B: Go `bf_omit`, shared Perl
 * `BarefootJS::omit`, Python/Rust `bf.omit`) -- except ERB, which uses
 * Ruby's native `Hash#except`. Only the JS/CSR side has no `omit`: it
 * materializes the residual with a real destructure IIFE instead.
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

bf_test('basic shapes', function () use ($bf) {
    bf_assert_eq($bf->omit(null, ['id']), []);
    bf_assert_eq($bf->omit('not a bag', ['id']), []);
    bf_assert_eq($bf->omit([], ['id']), []);
    bf_assert_eq($bf->omit(['id' => 'a', 'flag' => 'x'], []), ['id' => 'a', 'flag' => 'x']);
});

bf_test('excludes the destructured sibling keys, keeps the rest', function () use ($bf) {
    $item = ['id' => 't1', 'title' => 'one', 'data-priority' => 'high', 'tag' => 'urgent'];
    bf_assert_eq($bf->omit($item, ['id', 'title']), ['data-priority' => 'high', 'tag' => 'urgent']);
});

bf_test('accepts a stdClass bag (JSON-decoded loop item shape)', function () use ($bf) {
    $item = json_decode('{"id": "t1", "title": "one", "flag": "a"}');
    bf_assert_eq($bf->omit($item, ['id', 'title']), ['flag' => 'a']);
});

bf_test('excluding every key yields an empty residual', function () use ($bf) {
    bf_assert_eq($bf->omit(['id' => 'a'], ['id']), []);
});

bf_test('an exclude key absent from the bag is a no-op', function () use ($bf) {
    bf_assert_eq($bf->omit(['id' => 'a'], ['nope']), ['id' => 'a']);
});

return bf_finish();
