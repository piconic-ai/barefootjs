<?php

declare(strict_types=1);

/**
 * JS primitive-operation vector conformance (spec/js-primitive-semantics.md,
 * "Conformance"), shared by both PHP adapters (Twig, Blade).
 *
 * Runs every packages/adapter-tests/vectors/primitives/<op>.json case against
 * the BarefootJS helper a compiled template calls for that operation. The
 * step-0 expected-failure ledger
 * (packages/adapter-tests/vectors/primitives-expected-failures.json) lists
 * the cases that fail on PHP today, each naming the rollout step that
 * removes it. It may only shrink: an unlisted failure fails, and so does a
 * listed case that now passes. A missing corpus is a loud failure, as in
 * test_eval_vectors.php.
 */

require_once __DIR__ . '/_harness.php';
bf_require_runtime();
bf_reset();

use Barefoot\BarefootJS;

$VECTORS_DIR = __DIR__ . '/../../adapter-tests/vectors';
$FILES = glob($VECTORS_DIR . '/primitives/*.json') ?: [];
sort($FILES);

if ($FILES === []) {
    bf_test('primitives/ corpus is present', function () use ($VECTORS_DIR) {
        bf_assert(false, "no primitives/*.json under {$VECTORS_DIR} -- regenerate it (cd packages/adapter-tests && bun run generate:primitive-vectors)");
    });
    return bf_finish();
}

$bf = new BarefootJS(null, []);

// One binding per op, to the helper compiled templates call (PHP spells
// `get` `index` and `strict_eq` `eq`). An op with no binding fails.
//
// TODO(#3824 step 0b/1): also bind each op to the native PHP operator and run
// only the cases whose `domain` the PHP adapters' shared NativeSafeTable
// claims (spec/js-primitive-semantics.md, "Conformance" item 3). That needs
// the table step 0b adds.
$BINDINGS = [
    'truthy' => fn ($v) => $bf->truthy($v),
    'to_number' => fn ($v) => $bf->to_number($v),
    'to_string' => fn ($v) => $bf->to_string($v),
    'get' => fn ($r, $k) => $bf->index($r, $k),
    'strict_eq' => fn ($a, $b) => $bf->eq($a, $b),
    'lt' => fn ($a, $b) => $bf->lt($a, $b),
    'le' => fn ($a, $b) => $bf->le($a, $b),
    'gt' => fn ($a, $b) => $bf->gt($a, $b),
    'ge' => fn ($a, $b) => $bf->ge($a, $b),
    'plus' => fn ($a, $b) => $bf->plus($a, $b),
    'neg' => fn ($v) => $bf->neg($v),
];

/** Materialize the `{"$num": ...}` sentinel, `-0` included. Values are
 * decoded with objects as stdClass, the evaluator's value convention, so
 * `{}` and `[]` stay distinct. */
function bfp_decode($v)
{
    if (is_array($v)) {
        return array_map('bfp_decode', $v);
    }
    if ($v instanceof \stdClass) {
        $vars = get_object_vars($v);
        if (count($vars) === 1 && array_key_exists('$num', $vars)) {
            return ['NaN' => NAN, 'Infinity' => INF, '-Infinity' => -INF, '-0' => -0.0][$vars['$num']];
        }
        $out = new \stdClass();
        foreach ($vars as $k => $x) {
            $out->{$k} = bfp_decode($x);
        }
        return $out;
    }
    return $v;
}

/** The primitives contract: types are strict (a bool for a boolean, an int
 * or float for a number, a string for a string), numbers compare as doubles
 * and a zero compares by sign. */
function bfp_match($got, $expect): bool
{
    if ($expect === null || is_bool($expect) || is_string($expect)) {
        return $got === $expect;
    }
    if (is_int($expect) || is_float($expect)) {
        if (!is_int($got) && !is_float($got)) {
            return false;
        }
        $g = (float) $got;
        $e = (float) $expect;
        if (is_nan($e)) {
            return is_nan($g);
        }
        if ($e === 0.0 && $g === 0.0) {
            return (fdiv(1.0, $g) < 0) === (fdiv(1.0, $e) < 0);
        }
        return $g === $e;
    }
    if (is_array($expect)) {
        if (!is_array($got) || count($got) !== count($expect)) {
            return false;
        }
        foreach ($expect as $i => $e) {
            if (!array_key_exists($i, $got) || !bfp_match($got[$i], $e)) {
                return false;
            }
        }
        return true;
    }
    $gotVars = $got instanceof \stdClass ? get_object_vars($got) : null;
    $wantVars = get_object_vars($expect);
    if ($gotVars === null || count($gotVars) !== count($wantVars)) {
        return false;
    }
    foreach ($wantVars as $k => $v) {
        if (!array_key_exists($k, $gotVars) || !bfp_match($gotVars[$k], $v)) {
            return false;
        }
    }
    return true;
}

function bfp_run(array $bindings, \stdClass $case): array
{
    $bind = $bindings[$case->fn] ?? null;
    if ($bind === null) {
        return [false, "no PHP binding for '{$case->fn}' -- add it to \$BINDINGS"];
    }
    try {
        $got = $bind(...array_map('bfp_decode', $case->args));
    } catch (\Throwable $e) {
        return [false, 'threw ' . get_class($e) . ': ' . $e->getMessage()];
    }
    $expect = bfp_decode($case->expect);
    return bfp_match($got, $expect) ? [true, ''] : [false, 'got ' . bf_fmt($got) . ', want ' . bf_fmt($expect)];
}

$ledger = json_decode(file_get_contents($VECTORS_DIR . '/primitives-expected-failures.json'), true);
$expected = $ledger['runtimes']['php'];
$seen = [];
$total = 0;
$passed = 0;

foreach ($FILES as $path) {
    foreach (json_decode(file_get_contents($path), false)->cases as $case) {
        $key = "{$case->fn}/{$case->note}";
        $seen[$key] = true;
        $total++;
        [$ok, $detail] = bfp_run($BINDINGS, $case);
        if ($ok) {
            $passed++;
        }
        $listed = array_key_exists($key, $expected);
        bf_test($key, function () use ($ok, $listed, $key, $detail, $expected) {
            bf_assert(!($ok && $listed), "ledger entry '{$key}' now passes; remove it from the ledger (step {$expected[$key]['step']})");
            bf_assert($ok || $listed, "UNEXPECTED-FAIL {$key}: {$detail}");
        });
    }
}
foreach (array_keys($expected) as $key) {
    bf_test("ledger entry {$key} names a case", function () use ($seen, $key) {
        bf_assert(isset($seen[$key]), "ledger entry '{$key}' matches no primitives case -- renamed note?");
    });
}
echo "# primitives: {$total} cases, {$passed} pass, " . count($expected) . " in the expected-failure ledger\n";

return bf_finish();
