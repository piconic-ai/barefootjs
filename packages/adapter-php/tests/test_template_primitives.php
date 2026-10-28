<?php

declare(strict_types=1);

/**
 * JS-compat helper coverage (#1189), ported from
 * packages/adapter-perl/t/template_primitives.t (see also the Python port's
 * test_template_primitives.py).
 *
 * Covers the array/string method surface NOT already exercised byte-for-byte
 * by the shared golden vectors (test_helper_vectors.php) -- receiver-type
 * dispatch edge cases, mutation isolation (a helper must return a NEW array,
 * never alias the caller's -- trivially true in PHP since arrays are
 * value types with copy-on-write, but asserted anyway for parity with the
 * Perl/Python ports, where it is NOT automatic), the structured `sort`
 * comparator dispatch, and the `bf.*_eval` JSON-string delegation seam.
 */

require_once __DIR__ . '/_harness.php';
bf_require_runtime();
bf_reset();

use Barefoot\BarefootJS;

$backend = new class {
    public function encode_json($data): string
    {
        return \Barefoot\Json::canonicalEncode($data);
    }

    public function mark_raw($s)
    {
        return $s;
    }

    public function materialize($value)
    {
        return is_callable($value) ? $value() : $value;
    }

    public function render_named(...$args)
    {
        return '';
    }
};

$bf = new BarefootJS(null, ['backend' => $backend]);

function bfp_is_nan($n): bool
{
    return is_float($n) && is_nan($n);
}

// -----------------------------------------------------------------
// json / string / number / floor / ceil / round
// -----------------------------------------------------------------

bf_test('mod', function () use ($bf) {
    // JS `%` takes the dividend's sign and keeps a fraction.
    bf_assert_eq($bf->mod(-7, 2), -1.0);
    bf_assert_eq($bf->mod(7, -2), 1.0);
    bf_assert_eq($bf->mod(-7.5, 2), -1.5);
    bf_assert_nan($bf->mod(7, 0));
    // A zero remainder of two ints with a non-negative dividend is the int 0.
    bf_assert_eq($bf->mod(4, 2), 0);
    bf_assert_eq($bf->mod(0, 2), 0);
    // A negative dividend keeps fmod's -0.0, int or float, which prints "0"
    // and signs a later quotient: JS `1 / (-4 % 2)` is -Infinity (#3698).
    foreach ([-4, -4.0] as $dividend) {
        $negZero = $bf->mod($dividend, 2);
        bf_assert(is_float($negZero) && fdiv(1, $negZero) === -INF, 'expected -0.0 for ' . bf_fmt($dividend) . ' % 2');
        bf_assert_eq($bf->string($negZero), '0');
        bf_assert($bf->eq($negZero, 0), 'expected -0.0 === 0');
    }
    // A nil operand reads as 0, as with `div` (#3474).
    bf_assert_eq($bf->mod(null, 2), 0.0);
    bf_assert_nan($bf->mod(2, null));
});

bf_test('index_key', function () use ($bf) {
    // Blade's `data_get` spells the float -0.0 as the key "-0" and misses;
    // JS reads the key -0 as "0" (#3698).
    bf_assert_eq($bf->index_key($bf->mod(-4, 2)), 0);
    bf_assert_eq($bf->index_key(0.0), 0);
    // Any other key is returned as is.
    bf_assert_eq($bf->index_key(1), 1);
    bf_assert_eq($bf->index_key(1.0), 1.0);
    bf_assert_eq($bf->index_key('a'), 'a');
    bf_assert_eq($bf->index_key(null), null);
});

bf_test('div', function () use ($bf) {
    // JS `/` keeps the fraction; an exact quotient of two ints stays an int,
    // as with PHP's own `/`, so it still indexes a list.
    bf_assert_eq($bf->div(7, 2), 3.5);
    bf_assert_eq($bf->div(6, 2), 3);
    bf_assert_eq($bf->div('6', 4), 1.5);
    // A zero divisor gives an infinity signed by both operands, or NaN,
    // where PHP's `/` throws DivisionByZeroError (#3474).
    bf_assert_eq($bf->div(1, 0), INF);
    bf_assert_eq($bf->div(-1, 0), -INF);
    bf_assert_eq($bf->div(1, -0.0), -INF);
    bf_assert_eq($bf->div(1, $bf->mod(-4.0, 2)), -INF);
    bf_assert_eq($bf->div(1, $bf->mod(-4, 2)), -INF);
    bf_assert_nan($bf->div(0, 0));
    // A nil operand reads as 0, as with PHP's `/`: the adapters leave JS's
    // `null` operand to the engine.
    bf_assert_eq($bf->div(null, 2), 0.0);
    bf_assert_eq($bf->div(2, null), INF);
    bf_assert_nan($bf->div($bf->number(null), 2));
});

bf_test('json', function () use ($bf) {
    bf_assert_eq($bf->json(['a' => 1]), '{"a":1}');
    bf_assert_eq($bf->json([1, 2, 3]), '[1,2,3]');
    bf_assert_eq($bf->json('hi'), '"hi"');
    bf_assert_eq($bf->json(null), 'null');
    // JS writes -0 as 0, at any depth (#3698).
    bf_assert_eq($bf->json($bf->mod(-4, 2)), '0');
    bf_assert_eq($bf->json([$bf->mod(-4, 2), 1]), '[0,1]');
    bf_assert_eq($bf->json(['z' => -0.0, 'k' => [-0.0]]), '{"k":[0],"z":0}');
    $o = new \stdClass();
    $o->z = -0.0;
    bf_assert_eq($bf->json($o), '{"z":0}');
    bf_assert(fdiv(1, $o->z) === -INF, 'json must not change its argument');
    bf_assert_eq($bf->json([1.5, -2]), '[1.5,-2]');
});

bf_test('string', function () use ($bf) {
    bf_assert_eq($bf->string(42), '42');
    bf_assert_eq($bf->string('hi'), 'hi');
    bf_assert_eq($bf->string(null), '');
    bf_assert_eq($bf->string(true), 'true');
    bf_assert_eq($bf->string(false), 'false');
    bf_assert_eq($bf->string(1.0), '1');
});

bf_test('number', function () use ($bf) {
    bf_assert_eq($bf->number('3.14'), 3.14);
    bf_assert_eq($bf->number(42), 42.0);
    bf_assert(bfp_is_nan($bf->number('not a num')), 'expected NaN');
    bf_assert(bfp_is_nan($bf->number(null)), 'expected NaN');
});

bf_test('floor/ceil/round', function () use ($bf) {
    bf_assert_eq($bf->floor(3.7), 3.0);
    bf_assert_eq($bf->floor(-3.2), -4.0);
    bf_assert(bfp_is_nan($bf->floor('not')), 'expected NaN');

    bf_assert_eq($bf->ceil(3.1), 4.0);
    bf_assert_eq($bf->ceil(-3.7), -3.0);
    bf_assert(bfp_is_nan($bf->ceil('not')), 'expected NaN');

    bf_assert_eq($bf->round(3.5), 4.0);
    bf_assert_eq($bf->round(3.4), 3.0);
    // JS Math.round ties go toward +Infinity, not away from zero.
    bf_assert_eq($bf->round(-1.5), -1.0);
    bf_assert_eq($bf->round(-1.6), -2.0);
    bf_assert(bfp_is_nan($bf->round('not')), 'expected NaN');
});

// -----------------------------------------------------------------
// includes dispatch
// -----------------------------------------------------------------

bf_test('includes dispatch', function () use ($bf) {
    bf_assert_eq($bf->includes(['a', 'b', 'c'], 'b'), true);
    bf_assert_eq($bf->includes(['a', 'b', 'c'], 'z'), false);
    bf_assert_eq($bf->includes([1, 2, 3], 2), true);
    bf_assert_eq($bf->includes([], 'a'), false);
    bf_assert_eq($bf->includes([null, 'a'], null), true);
    bf_assert_eq($bf->includes(['a', 'b'], null), false);

    // SameValueZero never coerces across types.
    bf_assert_eq($bf->includes([2], '2'), false);
    bf_assert_eq($bf->includes([2], 2), true);
    bf_assert_eq($bf->includes(['2'], '2'), true);

    bf_assert_eq($bf->includes('hello world', 'world'), true);
    bf_assert_eq($bf->includes('hello world', 'earth'), false);
    bf_assert_eq($bf->includes('hello', ''), true);
    bf_assert_eq($bf->includes('', 'x'), false);
    bf_assert_eq($bf->includes(null, 'x'), false);

    bf_assert_eq($bf->includes(['a' => 1], 'a'), false);
});

// -----------------------------------------------------------------
// index_of / last_index_of / at
// -----------------------------------------------------------------

bf_test('index_of / last_index_of', function () use ($bf) {
    $arr = ['a', 'b', 'c', 'b', 'd'];
    bf_assert_eq($bf->index_of($arr, 'a'), 0);
    bf_assert_eq($bf->index_of($arr, 'b'), 1);
    bf_assert_eq($bf->index_of($arr, 'd'), 4);
    bf_assert_eq($bf->index_of($arr, 'z'), -1);
    bf_assert_eq($bf->index_of([], 'a'), -1);
    bf_assert_eq($bf->index_of(['a' => 1], 'a'), -1);

    bf_assert_eq($bf->last_index_of($arr, 'b'), 3);
    bf_assert_eq($bf->last_index_of($arr, 'a'), 0);
    bf_assert_eq($bf->last_index_of($arr, 'z'), -1);

    bf_assert_eq($bf->index_of([null, 'x', null], null), 0);
    bf_assert_eq($bf->last_index_of([null, 'x', null], null), 2);
});

bf_test('at', function () use ($bf) {
    $arr = ['a', 'b', 'c'];
    bf_assert_eq($bf->at($arr, 0), 'a');
    bf_assert_eq($bf->at($arr, 2), 'c');
    bf_assert_eq($bf->at($arr, -1), 'c');
    bf_assert_eq($bf->at($arr, -3), 'a');
    bf_assert_eq($bf->at($arr, 3), null);
    bf_assert_eq($bf->at($arr, -4), null);
    bf_assert_eq($bf->at([], 0), null);
    bf_assert_eq($bf->at(null, 0), null);
    bf_assert_eq($bf->at(['a' => 1], 0), null);
});

// String receivers (#3613) count UTF-16 code units, like JS: '本' is one
// unit, '😀' is two.
bf_test('string index methods count UTF-16 code units', function () use ($bf) {
    bf_assert_eq($bf->index_of('banana', 'an'), 1);
    bf_assert_eq($bf->index_of('日本語', '本'), 1);
    bf_assert_eq($bf->index_of('a😀b', 'b'), 3);
    bf_assert_eq($bf->index_of('abc', 'z'), -1);
    bf_assert_eq($bf->index_of('abc', ''), 0);
    bf_assert_eq($bf->index_of('ab', 'abc'), -1);
    bf_assert_eq($bf->index_of('', ''), 0);
    bf_assert_eq($bf->last_index_of('banana', 'an'), 3);
    bf_assert_eq($bf->last_index_of('a😀b😀', '😀'), 4);
    bf_assert_eq($bf->last_index_of('abc', ''), 3);
    bf_assert_eq($bf->last_index_of('aaa', 'aa'), 1);
    bf_assert_eq($bf->at('日本語', -1), '語');
    bf_assert_eq($bf->at('a😀b', -1), 'b');
    bf_assert_eq($bf->at('a😀b', 3), 'b');
    bf_assert_eq($bf->at('abc', 3), null);
    bf_assert_eq($bf->at('', 0), null);
    // Half of a surrogate pair: U+FFFD where JS keeps a lone surrogate
    // (pinned divergence, limitation `string-at-lone-surrogate`).
    bf_assert_eq($bf->at('a😀b', 1), "\u{FFFD}");
    bf_assert_eq($bf->starts_with('日本語', '本', 1), true);
    bf_assert_eq($bf->starts_with('a😀b', 'b', 3), true);
    bf_assert_eq($bf->starts_with('a😀b', 'b', 2), false);
    bf_assert_eq($bf->ends_with('日本語', '本', 2), true);
    bf_assert_eq($bf->ends_with('a😀b', '😀', 3), true);
    bf_assert_eq($bf->ends_with('a😀b', 'a', 2), false);
});

// ToIntegerOrInfinity for the string index paths (#3613): NaN is 0,
// ±Infinity is out of range (a bare (int) cast would make it 0),
// fractions truncate toward zero.
bf_test('string index methods read non-finite positions as ToIntegerOrInfinity', function () use ($bf) {
    bf_assert_eq($bf->at('abc', NAN), 'a');
    bf_assert_eq($bf->at('abc', INF), null);
    bf_assert_eq($bf->at('abc', -INF), null);
    bf_assert_eq($bf->at('abc', 1.9), 'b');
    bf_assert_eq($bf->at('abc', -1.5), 'c');
    bf_assert_eq($bf->starts_with('abc', 'a', NAN), true);
    bf_assert_eq($bf->starts_with('abc', '', INF), true);
    bf_assert_eq($bf->ends_with('abc', 'c', NAN), false);
    bf_assert_eq($bf->ends_with('abc', 'c', INF), true);
});

// -----------------------------------------------------------------
// concat / slice / reverse mutation isolation
// -----------------------------------------------------------------

bf_test('concat mutation isolation', function () use ($bf) {
    bf_assert_eq($bf->concat(['a', 'b'], ['c', 'd']), ['a', 'b', 'c', 'd']);
    bf_assert_eq($bf->concat(null, ['a']), ['a']);
    bf_assert_eq($bf->concat(['a'], null), ['a']);

    $left = ['a', 'b'];
    $right = ['c', 'd'];
    $out = $bf->concat($left, $right);
    $out[] = 'mutated';
    bf_assert_eq($left, ['a', 'b']);
    bf_assert_eq($right, ['c', 'd']);
});

bf_test('slice mutation isolation and clamping', function () use ($bf) {
    $arr = ['a', 'b', 'c', 'd', 'e'];
    bf_assert_eq($bf->slice($arr, 1, 3), ['b', 'c']);
    bf_assert_eq($bf->slice($arr, 2, null), ['c', 'd', 'e']);
    bf_assert_eq($bf->slice($arr, -2, null), ['d', 'e']);
    bf_assert_eq($bf->slice($arr, 0, -1), ['a', 'b', 'c', 'd']);
    bf_assert_eq($bf->slice($arr, 100, null), []);
    bf_assert_eq($bf->slice($arr, 3, 1), []);
    bf_assert_eq($bf->slice(null, 0, null), []);

    $src = ['a', 'b', 'c'];
    $out = $bf->slice($src, 0, 2);
    $out[] = 'mutated';
    bf_assert_eq($src, ['a', 'b', 'c']);
});

bf_test('slice string receiver', function () use ($bf) {
    // The `string-slice` divergence (#2182): a string receiver used to
    // fall through the array-only branch and return an empty array
    // instead of a substring.
    $word = 'barefootjs';
    bf_assert_eq($bf->slice($word, 0, 4), 'bare');
    bf_assert_eq($bf->slice($word, -4, null), 'otjs');
    bf_assert_eq($bf->slice($word, 4, null), 'footjs');
    bf_assert_eq($bf->slice($word, 5, 2), '');
    // Multi-byte: index by character, not byte.
    bf_assert_eq($bf->slice('héllo', 0, 2), 'hé');
});

bf_test('reverse mutation isolation', function () use ($bf) {
    bf_assert_eq($bf->reverse(['a', 'b', 'c']), ['c', 'b', 'a']);
    bf_assert_eq($bf->reverse([]), []);

    $src = ['a', 'b', 'c'];
    $out = $bf->reverse($src);
    $out[] = 'mutated';
    bf_assert_eq($src, ['a', 'b', 'c']);
    bf_assert_eq($bf->reverse(null), []);
});

// -----------------------------------------------------------------
// trim / split / starts_with / ends_with / replace / repeat / pad
// -----------------------------------------------------------------

bf_test('trim', function () use ($bf) {
    bf_assert_eq($bf->trim('   padded   '), 'padded');
    bf_assert_eq($bf->trim(''), '');
    bf_assert_eq($bf->trim(null), '');
    bf_assert_eq($bf->trim(['a' => 1]), '');
    bf_assert_eq($bf->trim(42), '42');
});

// `trim_start` / `trim_end` -- the one-sided siblings of `trim` above
// (#2183 follow-up). Padding BOTH sides of the flagship input so a
// swapped side (or a routed-through-both-sides regression) fails visibly.
bf_test('trim_start / trim_end', function () use ($bf) {
    bf_assert_eq($bf->trim_start('   padded   '), 'padded   ');
    bf_assert_eq($bf->trim_end('   padded   '), '   padded');

    bf_assert_eq($bf->trim_start("\t\nleading"), 'leading');
    bf_assert_eq($bf->trim_end('trailing  '), 'trailing');

    bf_assert_eq($bf->trim_start('no-pad'), 'no-pad');
    bf_assert_eq($bf->trim_end('no-pad'), 'no-pad');

    bf_assert_eq($bf->trim_start('   '), '');
    bf_assert_eq($bf->trim_end('   '), '');

    bf_assert_eq($bf->trim_start(''), '');
    bf_assert_eq($bf->trim_end(''), '');

    bf_assert_eq($bf->trim_start(null), '');
    bf_assert_eq($bf->trim_end(null), '');
    bf_assert_eq($bf->trim_start(['a' => 1]), '');
    bf_assert_eq($bf->trim_end(['a' => 1]), '');
    bf_assert_eq($bf->trim_start(42), '42');
    bf_assert_eq($bf->trim_end(42), '42');
});

bf_test('split', function () use ($bf) {
    bf_assert_eq($bf->split('a,b,c', ','), ['a', 'b', 'c']);
    bf_assert_eq($bf->split('a.b.c', '.'), ['a', 'b', 'c']);
    bf_assert_eq($bf->split('a,', ','), ['a', '']);
    bf_assert_eq($bf->split(',a', ','), ['', 'a']);
    bf_assert_eq($bf->split('abc', ''), ['a', 'b', 'c']);
    bf_assert_eq($bf->split('', ''), []);
    bf_assert_eq($bf->split('abc', ','), ['abc']);
    bf_assert_eq($bf->split('a,b,c'), ['a,b,c']);
    bf_assert_eq($bf->split('a,b,c,d', ',', 2), ['a', 'b']);
    bf_assert_eq($bf->split('a,b', ',', 0), []);
    bf_assert_eq($bf->split(null, ','), ['']);
    bf_assert_eq($bf->split(42, ','), ['42']);
});

bf_test('starts_with / ends_with positions', function () use ($bf) {
    bf_assert_eq($bf->starts_with('hello world', 'hello'), true);
    bf_assert_eq($bf->starts_with('anything', ''), true);
    bf_assert_eq($bf->ends_with('hello world', 'world'), true);
    bf_assert_eq($bf->starts_with('abc', 'b', 1), true);
    bf_assert_eq($bf->starts_with('abc', 'a', 99), false);
    bf_assert_eq($bf->starts_with('abc', 'a', -5), true);
    bf_assert_eq($bf->ends_with('abc', 'b', 2), true);
    bf_assert_eq($bf->ends_with('abc', 'c', 99), true);
    bf_assert_eq($bf->ends_with('abc', 'a', -1), false);
});

bf_test('replace', function () use ($bf) {
    bf_assert_eq($bf->replace('hello world', 'o', '0'), 'hell0 world');
    bf_assert_eq($bf->replace('abc', '', 'X'), 'Xabc');
    bf_assert_eq($bf->replace('ab', 'a', '$&'), '$&b');
});

bf_test('repeat', function () use ($bf) {
    bf_assert_eq($bf->repeat('ab', 3), 'ababab');
    bf_assert_eq($bf->repeat('ab', 0), '');
    bf_assert_eq($bf->repeat('ab', -2), '');
    bf_assert_eq($bf->repeat('ab', 2.9), 'abab');
});

bf_test('pad_start / pad_end', function () use ($bf) {
    bf_assert_eq($bf->pad_start('42', 5, '0'), '00042');
    bf_assert_eq($bf->pad_end('42', 5, '.'), '42...');
    bf_assert_eq($bf->pad_start('42', 5), '   42');
    bf_assert_eq($bf->pad_start('x', 5, 'ab'), 'ababx');
    bf_assert_eq($bf->pad_start('hello', 3, '0'), 'hello');
    bf_assert_eq($bf->pad_start('42', 5, ''), '42');
    bf_assert_eq($bf->pad_start('7', 4.9, '0'), '0007');
});

// -----------------------------------------------------------------
// Structured sort() comparator dispatch
// -----------------------------------------------------------------

bf_test('sort: structured comparator dispatch', function () use ($bf) {
    $items = [
        ['name' => 'c', 'price' => 30],
        ['name' => 'a', 'price' => 10],
        ['name' => 'b', 'price' => 20],
    ];
    bf_assert_eq(
        $bf->sort($items, ['keys' => [['key_kind' => 'field', 'key' => 'price', 'compare_type' => 'numeric', 'direction' => 'asc']]]),
        [['name' => 'a', 'price' => 10], ['name' => 'b', 'price' => 20], ['name' => 'c', 'price' => 30]]
    );
    bf_assert_eq(
        $bf->sort($items, ['keys' => [['key_kind' => 'field', 'key' => 'price', 'compare_type' => 'numeric', 'direction' => 'desc']]]),
        [['name' => 'c', 'price' => 30], ['name' => 'b', 'price' => 20], ['name' => 'a', 'price' => 10]]
    );
    bf_assert_eq(
        $bf->sort([3, 1, 2], ['keys' => [['key_kind' => 'self', 'compare_type' => 'numeric', 'direction' => 'asc']]]),
        [1, 2, 3]
    );

    // Mutation isolation.
    $src = [['price' => 3], ['price' => 1], ['price' => 2]];
    $out = $bf->sort($src, ['keys' => [['key_kind' => 'field', 'key' => 'price', 'compare_type' => 'numeric', 'direction' => 'asc']]]);
    $out[] = ['price' => 99];
    bf_assert_eq($src, [['price' => 3], ['price' => 1], ['price' => 2]]);

    bf_assert_eq($bf->sort(null, ['keys' => [['key_kind' => 'self', 'compare_type' => 'numeric', 'direction' => 'asc']]]), []);
    bf_assert_eq($bf->sort([], ['keys' => [['key_kind' => 'field', 'key' => 'price']]]), []);
});

bf_test('sort: multi-key tie-break', function () use ($bf) {
    $items = [['p' => 1, 'name' => 'b'], ['p' => 1, 'name' => 'a'], ['p' => 0, 'name' => 'c']];
    bf_assert_eq(
        $bf->sort($items, ['keys' => [
            ['key_kind' => 'field', 'key' => 'p', 'compare_type' => 'numeric', 'direction' => 'asc'],
            ['key_kind' => 'field', 'key' => 'name', 'compare_type' => 'string', 'direction' => 'asc'],
        ]]),
        [['p' => 0, 'name' => 'c'], ['p' => 1, 'name' => 'a'], ['p' => 1, 'name' => 'b']]
    );
});

bf_test('sort: auto compare', function () use ($bf) {
    bf_assert_eq(
        $bf->sort([3, 1, 2], ['keys' => [['key_kind' => 'self', 'compare_type' => 'auto', 'direction' => 'asc']]]),
        [1, 2, 3]
    );
    bf_assert_eq(
        $bf->sort(['charlie', 'alice', 'bob'], ['keys' => [['key_kind' => 'self', 'compare_type' => 'auto', 'direction' => 'asc']]]),
        ['alice', 'bob', 'charlie']
    );
});

// -----------------------------------------------------------------
// EvalDelegation: `bf.*_eval` JSON-string seam wiring (not just the
// underlying Evaluator functions, tested directly in test_evaluator.php /
// test_eval_vectors.php).
// -----------------------------------------------------------------

bf_test('sort_eval delegates through the JSON seam', function () use ($bf) {
    $cmp = [
        'kind' => 'binary', 'op' => '-',
        'left' => ['kind' => 'member', 'object' => ['kind' => 'identifier', 'name' => 'a'], 'property' => 'v'],
        'right' => ['kind' => 'member', 'object' => ['kind' => 'identifier', 'name' => 'b'], 'property' => 'v'],
    ];
    $out = $bf->sort_eval([['v' => 3], ['v' => 1], ['v' => 2]], json_encode($cmp), 'a', 'b');
    bf_assert_eq(array_map(fn ($x) => $x['v'], $out), [1, 2, 3]);
});

bf_test('reduce_eval delegates through the JSON seam', function () use ($bf) {
    $body = [
        'kind' => 'binary', 'op' => '+',
        'left' => ['kind' => 'identifier', 'name' => 'acc'],
        'right' => ['kind' => 'identifier', 'name' => 'item'],
    ];
    $out = $bf->reduce_eval([1, 2, 3], json_encode($body), 'acc', 'item', 0);
    bf_assert_eq($out, 6.0);
});

bf_test('filter_eval / every_eval / some_eval / find_eval / find_index_eval delegate through the JSON seam', function () use ($bf) {
    $pred = [
        'kind' => 'binary', 'op' => '>=',
        'left' => ['kind' => 'member', 'object' => ['kind' => 'identifier', 'name' => 'u'], 'property' => 'age'],
        'right' => ['kind' => 'literal', 'value' => 18],
    ];
    $predJson = json_encode($pred);
    $rows = [['age' => 15], ['age' => 30], ['age' => 18]];
    bf_assert_eq(array_map(fn ($r) => $r['age'], $bf->filter_eval($rows, $predJson, 'u')), [30, 18]);
    bf_assert_eq($bf->every_eval($rows, $predJson, 'u'), false);
    bf_assert_eq($bf->some_eval($rows, $predJson, 'u'), true);
    bf_assert_eq($bf->find_eval($rows, $predJson, 'u')['age'], 30);
    bf_assert_eq($bf->find_index_eval($rows, $predJson, 'u', false), 2);
});

bf_test('flat_map_eval / map_eval delegate through the JSON seam', function () use ($bf) {
    $field = ['kind' => 'member', 'object' => ['kind' => 'identifier', 'name' => 'i'], 'property' => 'tags'];
    $rows = [['tags' => ['a', 'b']], ['tags' => ['c']]];
    bf_assert_eq($bf->flat_map_eval($rows, json_encode($field), 'i'), ['a', 'b', 'c']);

    $nameField = ['kind' => 'member', 'object' => ['kind' => 'identifier', 'name' => 'u'], 'property' => 'name'];
    $users = [['name' => 'Ada'], ['name' => 'Grace']];
    bf_assert_eq($bf->map_eval($users, json_encode($nameField), 'u'), ['Ada', 'Grace']);
});

// bf->is_element -- the framework "is this a renderable element (not
// plain text)?" predicate `Slot`'s `asChild` pattern uses (#2266, #3012).
// Ported from the shared Perl runtime's `is_element`
// (packages/adapter-perl/lib/BarefootJS.pm), which the Mojolicious /
// Xslate adapters' own `isValidElement` primitives already call. Shared
// by both the Twig and Blade adapters (this runtime backs both).
bf_test('is_element', function () use ($bf) {
    bf_assert_eq($bf->is_element(['tag' => 'div', 'props' => []]), true);
    // Case-insensitive key match, mirroring the Perl/Go/Ruby/Python/Rust ports.
    bf_assert_eq($bf->is_element(['Tag' => 'div', 'Props' => []]), true);
    // A `stdClass` object (the live representation for a
    // `json_decode()`-sourced value) is an equally valid element shape.
    $obj = new stdClass();
    $obj->tag = 'div';
    $obj->props = [];
    bf_assert_eq($bf->is_element($obj), true);
    bf_assert_eq($bf->is_element(['tag' => 'div']), false);
    bf_assert_eq($bf->is_element(['props' => []]), false);
    // A passed-through JSX child is pre-rendered markup (a plain string)
    // on this SSR model -- a non-empty string must NOT read as an
    // element, or `Slot`'s `asChild` guard would wrongly take the
    // element-merge branch.
    bf_assert_eq($bf->is_element('<span>hello</span>'), false);
    bf_assert_eq($bf->is_element(null), false);
    bf_assert_eq($bf->is_element([1, 2, 3]), false);
});

return bf_finish();
