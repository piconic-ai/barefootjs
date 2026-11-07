<?php

declare(strict_types=1);

/**
 * JS `undefined` apart from `null` (spec/js-undefined-value.md, rollout step
 * U6): the `Barefoot\Undefined` singleton, the nil predicates, the producers
 * of `undefined` (a missing key, an out-of-range index, `at` / `find` misses,
 * `?.` over a nullish receiver, an omitted argument), the JSON walk, the seed
 * (decision 6) and the helpers that read the two nils apart. Mirrors
 * `packages/adapter-perl/t/undefined.t` and
 * `packages/adapter-erb/test/undefined_test.rb`.
 */

require_once __DIR__ . '/_harness.php';
bf_require_runtime();
bf_reset();

use Barefoot\BarefootJS;
use Barefoot\Evaluator;
use Barefoot\Json;
use Barefoot\Undefined;

$backend = new class {
    public function encode_json($data): string
    {
        return Json::canonicalEncode($data);
    }

    public function mark_raw($s)
    {
        return $s;
    }
};

$bf = new BarefootJS(null, ['backend' => $backend]);
$U = Undefined::value();

bf_test('one singleton, identified by its class', function () use ($bf, $U) {
    bf_assert(Undefined::value() === $U, 'value() returns the same instance');
    bf_assert($bf->undefined() === $U, 'bf.undefined() is the singleton');
    bf_assert(Undefined::isUndefined(clone $U), 'a copy still reads as undefined');
    bf_assert(Undefined::isUndefined(unserialize(serialize($U))), 'an unserialized copy still reads as undefined');
});

bf_test('the nil predicates tell the two nils apart', function () use ($bf, $U) {
    bf_assert_eq($bf->is_undefined($U), true);
    bf_assert_eq($bf->is_undefined(null), false);
    bf_assert_eq($bf->is_null(null), true);
    bf_assert_eq($bf->is_null($U), false);
    bf_assert_eq($bf->is_nullish($U), true);
    bf_assert_eq($bf->is_nullish(null), true);
    foreach ([0, 0.0, '', false, [], new \stdClass()] as $v) {
        bf_assert_eq($bf->is_nullish($v), false, 'a falsy value is not nullish');
    }
});

bf_test('PHP sees an object: truthy natively, falsy through the runtime', function () use ($bf, $U) {
    // The reason every emitted test goes through a helper.
    bf_assert((bool) $U === true, 'PHP truthiness reads an object as true');
    bf_assert(($U ?? 'fb') === $U, "PHP's ?? keeps it");
    bf_assert_eq($bf->truthy($U), false);
    bf_assert_eq(Evaluator::truthy($U), false);
    bf_assert_eq($bf->keep_truthy($U), []);
    bf_assert_eq($bf->keep_falsy($U), [$U]);
});

bf_test('keep_nonnil boxes everything but the two nils', function () use ($bf, $U) {
    bf_assert_eq($bf->keep_nonnil($U), []);
    bf_assert_eq($bf->keep_nonnil(null), []);
    bf_assert_eq($bf->keep_nonnil(0), [0]);
    bf_assert_eq($bf->keep_nonnil(''), ['']);
    bf_assert_eq($bf->keep_nonnil(false), [false]);
});

bf_test('it prints nothing in a display sink', function () use ($bf, $U) {
    bf_assert_eq((string) $U, '');
    bf_assert_eq($bf->string($U), '');
    bf_assert_eq($bf->string(['a', $U, null, 'b']), 'a,,,b');
    bf_assert(is_nan($bf->number($U)), 'the display number is NaN');
    bf_assert_eq($bf->display($U), $U);
});

bf_test('ToString / ToNumber read it as JS does', function () use ($bf, $U) {
    bf_assert_eq($bf->to_string($U), 'undefined');
    bf_assert_eq($bf->to_string(null), 'null');
    bf_assert_eq($bf->to_string([1, $U, null]), '1,,');
    bf_assert(is_nan($bf->to_number($U)), 'ToNumber(undefined) is NaN');
    bf_assert_eq($bf->to_number(null), 0.0);
});

bf_test('+ / - / * / relational over undefined and null', function () use ($bf, $U) {
    bf_assert(is_nan($bf->plus($U, 1)), 'undefined + 1 is NaN');
    bf_assert_eq($bf->plus($U, 'x'), 'undefinedx');
    bf_assert_eq($bf->plus(null, 1), 1.0);
    bf_assert(is_nan($bf->sub($U, 1)), 'undefined - 1 is NaN');
    bf_assert_eq($bf->sub(null, 1), -1.0);
    bf_assert_eq($bf->sub(5, 3), 2);
    bf_assert(is_nan($bf->mul($U, 2)), 'undefined * 2 is NaN');
    bf_assert_eq($bf->mul('3', 2), 6.0);
    bf_assert(is_nan($bf->div($U, 2)), 'undefined / 2 is NaN');
    bf_assert_eq($bf->div(null, 2), 0.0);
    bf_assert_eq($bf->le($U, 0), false);
    bf_assert_eq($bf->le(null, 0), true);
});

bf_test('=== is strict: null is only null, undefined only undefined', function () use ($bf, $U) {
    bf_assert_eq($bf->eq($U, $U), true);
    bf_assert_eq($bf->eq($U, null), false);
    bf_assert_eq($bf->eq(null, null), true);
    bf_assert_eq($bf->neq($U, null), true);
    bf_assert_eq($bf->eq($U, 0), false);
});

bf_test('a miss reads as undefined, a present null stays null', function () use ($bf, $U) {
    $row = json_decode('{"a":null,"b":1}');
    bf_assert_eq($bf->index($row, 'a'), null);
    bf_assert_eq($bf->index($row, 'missing'), $U);
    bf_assert_eq($bf->index(['x'], 3), $U);
    bf_assert_eq($bf->index(null, 'a'), $U);
    bf_assert_eq($bf->index($U, 'a'), $U);
    bf_assert_eq($bf->index('ab', 5), $U);
    bf_assert_eq($bf->length($row), $U);
});

bf_test('get_opt: undefined over a nullish receiver', function () use ($bf, $U) {
    bf_assert_eq($bf->get_opt(null, 'k'), $U);
    bf_assert_eq($bf->get_opt($U, 'k'), $U);
    bf_assert_eq($bf->get_opt(json_decode('{"k":null}'), 'k'), null);
    bf_assert_eq($bf->get_opt(json_decode('{"k":2}'), 'k'), 2);
});

bf_test('at / find / find_last misses are undefined', function () use ($bf, $U) {
    bf_assert_eq($bf->at([1, 2], 5), $U);
    bf_assert_eq($bf->at('ab', -3), $U);
    bf_assert_eq($bf->at([1, 2]), 1);
    bf_assert_eq($bf->find([1, 2], fn ($x) => $x > 5), $U);
    bf_assert_eq($bf->find_last([1, 2], fn ($x) => $x > 5), $U);
    bf_assert_eq($bf->find([null], fn ($x) => true), null);
});

bf_test('an omitted or undefined argument takes the default, null is coerced', function () use ($bf, $U) {
    bf_assert_eq($bf->slice([1, 2, 3], 1), [2, 3]);
    bf_assert_eq($bf->slice([1, 2, 3], 1, $U), [2, 3]);
    bf_assert_eq($bf->slice([1, 2, 3], 0, null), []);
    bf_assert_eq($bf->join(['a', 'b']), 'a,b');
    bf_assert_eq($bf->join(['a', 'b'], $U), 'a,b');
    bf_assert_eq($bf->join(['a', 'b'], null), 'anullb');
    bf_assert_eq($bf->pad_start('abc', 5, $U), '  abc');
    bf_assert_eq($bf->pad_start('abc', 5, null), 'nuabc');
    bf_assert_eq($bf->split('a,b', ',', $U), ['a', 'b']);
    bf_assert_eq($bf->split('a,b', ',', null), []);
    bf_assert_eq($bf->flat_dynamic([1, [2, [3]]], $U), [1, 2, [3]]);
    bf_assert_eq($bf->flat_dynamic([1, [2]], null), [1, [2]]);
});

bf_test('includes / index_of tell the nils apart', function () use ($bf, $U) {
    bf_assert_eq($bf->includes([$U], $U), true);
    bf_assert_eq($bf->includes([$U], null), false);
    bf_assert_eq($bf->index_of([null, $U], $U), 1);
    bf_assert_eq($bf->index_of([null, $U], null), 0);
    // A string needle is JS ToString'd.
    bf_assert_eq($bf->includes('aundefinedb', $U), true);
    bf_assert_eq($bf->includes('anullb', null), true);
});

bf_test('sort puts undefined last without calling the comparator', function () use ($bf, $U) {
    $sorted = $bf->sort([3, $U, 1, null, 2], ['keys' => [['key_kind' => 'self', 'compare_type' => 'numeric', 'direction' => 'asc']]]);
    bf_assert_eq($sorted, [null, 1, 2, 3, $U]);
    $cmp = json_encode(['kind' => 'binary', 'op' => '-', 'left' => ['kind' => 'identifier', 'name' => 'a'], 'right' => ['kind' => 'identifier', 'name' => 'b']]);
    bf_assert_eq($bf->sort_eval([3, $U, 1, null, 2], $cmp, 'a', 'b'), [null, 1, 2, 3, $U]);
});

bf_test('json is JSON.stringify: member dropped, element null, top level undefined', function () use ($bf, $U) {
    bf_assert_eq($bf->json($U), $U);
    bf_assert_eq($bf->json(null), 'null');
    bf_assert_eq($bf->json(['a' => $U, 'b' => null]), '{"b":null}');
    bf_assert_eq($bf->json([$U, 1]), '[null,1]');
    bf_assert_eq($bf->json(json_decode('{"o":{"x":1}}')), '{"o":{"x":1}}');
    $o = new \stdClass();
    $o->a = $U;
    bf_assert_eq(Json::canonicalEncode(['o' => $o, 'l' => [$U]]), '{"l":[null],"o":{}}');
});

bf_test('a JS object stays an object whatever the drop leaves', function () use ($bf, $U) {
    // An associative PHP array is a JS object: dropping a member must not
    // turn what is left into a list.
    $value = [0 => 'kept', 'drop' => $U];
    bf_assert_eq($bf->json($value), '{"0":"kept"}');
    bf_assert_eq(Json::canonicalEncode($value), '{"0":"kept"}');
    bf_assert_eq(Json::canonicalEncode(['o' => [0 => 'a', 1 => 'b', 'x' => $U]]), '{"o":{"0":"a","1":"b"}}');
    bf_assert_eq(Json::canonicalEncode(['drop' => $U]), '{}');
    // A list stays a list.
    bf_assert_eq(Json::canonicalEncode(['a', $U]), '["a",null]');
    $bf->_scope_id('S_obj');
    $bf->_props([0 => 'kept', 'drop' => $U]);
    bf_assert_eq($bf->scope_comment(), '<!--bf-scope:S_obj|{"0":"kept"}-->');
});

bf_test('bf-p and the scope comment drop an undefined member', function () use ($bf, $U) {
    $bf->_scope_id('S_test');
    $bf->_props(['a' => $U, 'b' => null, 'c' => 'x']);
    bf_assert_eq($bf->props_attr(), " bf-p='{&#34;b&#34;:null,&#34;c&#34;:&#34;x&#34;}'");
    bf_assert_eq($bf->scope_comment(), '<!--bf-scope:S_test|{"b":null,"c":"x"}-->');
    bf_assert($bf->passed('a', false), "a present undefined prop is passed ('a' in props)");
});

bf_test('the evaluator: missing field, undefined identifier, ?? and omitted builtin argument', function () use ($U) {
    $mem = ['kind' => 'member', 'object' => ['kind' => 'identifier', 'name' => 'item'], 'property' => 'missing'];
    bf_assert_eq(Evaluator::evaluate($mem, ['item' => json_decode('{"id":1}')]), $U);
    bf_assert_eq(Evaluator::evaluate(['kind' => 'identifier', 'name' => 'undefined'], []), $U);
    bf_assert_eq(Evaluator::evaluate(['kind' => 'identifier', 'name' => 'undefined'], ['undefined' => 5]), 5);
    $coalesce = ['kind' => 'logical', 'op' => '??', 'left' => $mem, 'right' => ['kind' => 'literal', 'value' => 'fb']];
    bf_assert_eq(Evaluator::evaluate($coalesce, ['item' => json_decode('{}')]), 'fb');
    $string = ['kind' => 'call', 'callee' => ['kind' => 'identifier', 'name' => 'String'], 'args' => []];
    bf_assert_eq(Evaluator::evaluate($string, []), '');
    $number = ['kind' => 'call', 'callee' => ['kind' => 'identifier', 'name' => 'Number'], 'args' => [$mem]];
    bf_assert(is_nan(Evaluator::evaluate($number, ['item' => json_decode('{}')])), 'Number(item.missing) is NaN');
});

bf_test('spread_attrs and style drop both nils', function () use ($bf, $U) {
    bf_assert_eq($bf->spread_attrs(['a' => $U, 'b' => null, 'c' => 'x']), 'c="x"');
    bf_assert_eq($bf->spread_attrs(['style' => ['color' => $U, 'margin' => '0']]), 'style="margin:0"');
});

bf_test('iterable: a nullish loop source is empty', function () use ($bf, $U) {
    bf_assert_eq($bf->iterable($U), []);
    bf_assert_eq($bf->iterable(null), []);
    bf_assert_eq($bf->iterable([1]), [1]);
    $n = 0;
    foreach ($U as $_) {
        $n++;
    }
    bf_assert_eq($n, 0, 'foreach over the object itself reads nothing');
});

bf_test('use_context: no provider and no default is undefined', function () use ($bf, $U) {
    bf_assert_eq($bf->use_context('bf-u6-none'), $U);
    bf_assert_eq($bf->use_context('bf-u6-none', null), null);
    bf_assert_eq($bf->use_context('bf-u6-none', 'd'), 'd');
});

return bf_finish();
