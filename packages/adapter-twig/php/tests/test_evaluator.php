<?php

declare(strict_types=1);

/**
 * Hand-built ParsedExpr evaluator demonstrations, ported from
 * packages/adapter-perl/t/evaluator.t (see also the Python port's
 * test_evaluator.py).
 *
 * Mirrors the Go/Perl/Python evaluator test demonstrations so all backends
 * prove the SAME restriction-lifting on the SAME shapes (a
 * reducer/comparator/predicate body the fixed bf.reduce/bf.sort/bf.filter
 * catalogues can't express, but the evaluator handles as just another pure
 * expression). Nodes are hand-built as plain PHP associative arrays (the
 * Evaluator tolerates this shape as well as a decoded stdClass -- see
 * Evaluator.php's docstring).
 */

require_once __DIR__ . '/_harness.php';
bf_require_runtime();
bf_reset();

use Barefoot\Evaluator;

function bft_id(string $name): array
{
    return ['kind' => 'identifier', 'name' => $name];
}

function bft_mem(array $obj, string $prop): array
{
    return ['kind' => 'member', 'object' => $obj, 'property' => $prop, 'computed' => false];
}

function bft_bin(string $op, array $left, array $right): array
{
    return ['kind' => 'binary', 'op' => $op, 'left' => $left, 'right' => $right];
}

function bft_str($value): array
{
    return ['kind' => 'literal', 'value' => $value, 'literalType' => 'string'];
}

function bft_num($value): array
{
    return ['kind' => 'literal', 'value' => $value, 'literalType' => 'number'];
}

function bft_call_math(string $fn, array $arg): array
{
    return ['kind' => 'call', 'callee' => bft_mem(bft_id('Math'), $fn), 'args' => [$arg]];
}

function bft_includes(array $obj, array $needle): array
{
    return ['kind' => 'array-method', 'method' => 'includes', 'object' => $obj, 'args' => [$needle]];
}

bf_test('fold: arbitrary reducer body (acc + item.price * item.qty)', function () {
    $body = bft_bin('+', bft_id('acc'), bft_bin('*', bft_mem(bft_id('item'), 'price'), bft_mem(bft_id('item'), 'qty')));
    $items = [['price' => 5, 'qty' => 3], ['price' => 2, 'qty' => 4]];
    bf_assert_eq(Evaluator::fold($items, $body, 'acc', 'item', 0, 'left'), 23.0);
});

bf_test('fold: direction is observable for string concat', function () {
    $body = bft_bin('+', bft_id('acc'), bft_id('item'));
    $items = ['a', 'b', 'c'];
    bf_assert_eq(Evaluator::fold($items, $body, 'acc', 'item', '', 'left'), 'abc');
    bf_assert_eq(Evaluator::fold($items, $body, 'acc', 'item', '', 'right'), 'cba');
});

bf_test('sort_by: arbitrary comparator (abs of field difference)', function () {
    $cmp = bft_bin('-', bft_call_math('abs', bft_mem(bft_id('a'), 'v')), bft_call_math('abs', bft_mem(bft_id('b'), 'v')));
    $items = [['v' => -5], ['v' => 3], ['v' => -1]];
    $sorted = Evaluator::sortBy($items, $cmp, 'a', 'b');
    bf_assert_eq(array_map(fn ($x) => $x['v'], $sorted), [-1, 3, -5]);
});

bf_test('sort_by: descending via reversed comparator', function () {
    $cmp = bft_bin('-', bft_mem(bft_id('b'), 'x'), bft_mem(bft_id('a'), 'x'));
    $items = [['x' => 10], ['x' => 30], ['x' => 20]];
    $sorted = Evaluator::sortBy($items, $cmp, 'a', 'b');
    bf_assert_eq(array_map(fn ($x) => $x['x'], $sorted), [30, 20, 10]);
});

bf_test('non-finite division and JS stringification', function () {
    $div = fn ($a, $b) => Evaluator::evaluate(bft_bin('/', bft_id('a'), bft_id('b')), ['a' => $a, 'b' => $b]);
    bf_assert_eq($div(1, 0), INF);
    bf_assert_eq($div(-1, 0), -INF);
    $nan = $div(0, 0);
    bf_assert(is_float($nan) && is_nan($nan), 'expected NaN for 0/0');

    // _to_string is private; exercise the same paths via `String()` builtin call.
    $toString = fn ($v) => Evaluator::evaluate(['kind' => 'call', 'callee' => bft_id('String'), 'args' => [bft_num($v)]], []);
    bf_assert_eq($toString(INF), 'Infinity');
    bf_assert_eq($toString(-INF), '-Infinity');
    bf_assert_eq($toString(INF - INF), 'NaN');
});

bf_test('captured free vars via base_env', function () {
    $body = bft_bin('+', bft_id('acc'), bft_bin('*', bft_id('item'), bft_id('factor')));
    $total = Evaluator::fold([1, 2, 3], $body, 'acc', 'item', 0, 'left', ['factor' => 10]);
    bf_assert_eq($total, 60.0);

    $cmp = bft_bin(
        '-',
        bft_call_math('abs', bft_bin('-', bft_id('a'), bft_id('pivot'))),
        bft_call_math('abs', bft_bin('-', bft_id('b'), bft_id('pivot')))
    );
    $sorted = Evaluator::sortBy([1, 8, 4], $cmp, 'a', 'b', ['pivot' => 5]);
    bf_assert_eq($sorted, [4, 8, 1]);
});

bf_test('boolean-valued ops return real booleans', function () {
    $lt = Evaluator::evaluate(bft_bin('<', bft_id('a'), bft_id('b')), ['a' => 1, 'b' => 2]);
    bf_assert(is_bool($lt), 'expected a real bool from <');
    bf_assert_eq($lt, true);

    $cat = Evaluator::evaluate(bft_bin('+', bft_str('x'), bft_bin('<', bft_id('a'), bft_id('b'))), ['a' => 1, 'b' => 2]);
    bf_assert_eq($cat, 'xtrue');

    $eq = Evaluator::evaluate(bft_bin('===', bft_id('a'), bft_id('b')), ['a' => 1, 'b' => 1]);
    bf_assert(is_bool($eq), 'expected a real bool from ===');
    bf_assert_eq($eq, true);

    $not = Evaluator::evaluate(['kind' => 'unary', 'op' => '!', 'argument' => bft_str('')], []);
    bf_assert_eq($not, true);

    $b = Evaluator::evaluate(['kind' => 'call', 'callee' => bft_id('Boolean'), 'args' => [bft_str('')]], []);
    bf_assert(is_bool($b), 'expected a real bool from Boolean()');
    bf_assert_eq($b, false);

    // `.length` is a string/array property only; a numeric scalar has none.
    $length = Evaluator::evaluate(bft_mem(bft_id('n'), 'length'), ['n' => 123]);
    bf_assert_eq($length, null);
});

bf_test('array-method .includes dispatches by receiver type', function () {
    $hit = Evaluator::evaluate(bft_includes(bft_id('tags'), bft_str('go')), ['tags' => ['perl', 'go']]);
    bf_assert(is_bool($hit) && $hit === true, 'expected true for a matching tag');

    $miss = Evaluator::evaluate(bft_includes(bft_id('tags'), bft_str('rust')), ['tags' => ['perl', 'go']]);
    bf_assert(is_bool($miss) && $miss === false, 'expected false for a missing tag');

    // SameValueZero, not loose equality: numeric 2 matches numeric needle 2,
    // but the string needle "2" (a different JS type) does not.
    $numHit = Evaluator::evaluate(bft_includes(bft_id('nums'), bft_num(2)), ['nums' => [1, 2, 3]]);
    bf_assert_eq($numHit, true);
    $numVsString = Evaluator::evaluate(bft_includes(bft_id('nums'), bft_str('2')), ['nums' => [1, 2, 3]]);
    bf_assert_eq($numVsString, false);

    $sub = Evaluator::evaluate(bft_includes(bft_id('name'), bft_str('ar')), ['name' => 'bare']);
    bf_assert_eq($sub, true);

    // A non-array, non-string receiver (number, null, object) is not a JS
    // `.includes` target; the evaluator degrades to false rather than raising.
    $scalarRecv = Evaluator::evaluate(bft_includes(bft_id('n'), bft_num(1)), ['n' => 42]);
    bf_assert_eq($scalarRecv, false);
});

bf_test('strictEq: int/float unify numerically', function () {
    bf_assert_eq(Evaluator::strictEq(1, 1.0), true);
    bf_assert_eq(Evaluator::strictEq(1, 2), false);
    bf_assert_eq(Evaluator::strictEq('1', 1), false, 'no string<->number coercion');
    bf_assert_eq(Evaluator::strictEq(null, null), true);
    bf_assert_eq(Evaluator::strictEq(null, false), false);
    bf_assert_eq(Evaluator::strictEq(NAN, NAN), false, 'NaN !== NaN');
});

bf_test('sameValueZero: NaN matches NaN, otherwise same as strictEq', function () {
    bf_assert_eq(Evaluator::sameValueZero(NAN, NAN), true);
    bf_assert_eq(Evaluator::sameValueZero(1, 1.0), true);
    bf_assert_eq(Evaluator::sameValueZero('2', 2), false);
});

bf_test('formatNumber: shortest round-trip, JS integral spelling', function () {
    bf_assert_eq(Evaluator::formatNumber(1.0), '1');
    bf_assert_eq(Evaluator::formatNumber(0.1), '0.1');
    bf_assert_eq(Evaluator::formatNumber(0.30000000000000004), '0.30000000000000004');
    bf_assert_eq(Evaluator::formatNumber(0.0), '0');
    bf_assert_eq(Evaluator::formatNumber(-0.0), '0');
});

return bf_finish();
