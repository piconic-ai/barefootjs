<?php

declare(strict_types=1);

/**
 * Golden ParsedExpr-evaluator vectors, ported from
 * packages/adapter-perl/t/eval_vectors.t (see also the Python port's
 * test_eval_vectors.py).
 *
 * Runs packages/adapter-tests/vectors/eval-vectors.json -- generated
 * from the JS reference evaluator, shared with the Go/Perl/Python
 * evaluators -- against Evaluator::evaluate(). The evaluator is JS-faithful
 * by contract, so unlike the helper vectors there are NO PHP-side
 * divergences here: each case's real ParsedExpr tree, evaluated against its
 * environment, must reproduce the JS-computed expect exactly.
 *
 * A missing corpus file is a LOUD failure (see test_helper_vectors.php's
 * docstring for why) -- not a silent skip.
 */

require_once __DIR__ . '/_harness.php';
require_once __DIR__ . '/_vector_undefined.php';
bf_require_runtime();
bf_reset();

use Barefoot\Evaluator;

$VECTORS_PATH = __DIR__ . '/../../adapter-tests/vectors/eval-vectors.json';

if (!is_file($VECTORS_PATH)) {
    bf_test('golden eval-vectors corpus is present', function () use ($VECTORS_PATH) {
        bf_assert(false, "eval-vectors.json not found at {$VECTORS_PATH} -- regenerate it (cd packages/adapter-tests && bun run generate:eval-vectors) or check this path after a corpus move");
    });
    return bf_finish();
}

/**
 * Spec value-compat comparison -- non-finite sentinel hashes, booleans by
 * TYPE (a boolean-valued JS operator must return a real PHP bool, not a
 * truthy int), numbers numerically, arrays/objects recursively, strings by
 * equality.
 */
function bfe_match($got, $expect): bool
{
    if (bf_is_undef_sentinel($expect)) {
        return bf_is_runtime_undefined($got);
    }
    if ($expect === null) {
        return $got === null;
    }
    if (is_array($expect) && array_key_exists('$num', $expect) && count($expect) === 1) {
        $kind = $expect['$num'];
        if (is_bool($got) || !(is_int($got) || is_float($got))) {
            return false;
        }
        $g = (float) $got;
        if ($kind === 'NaN') {
            return is_nan($g);
        }
        return $g === ($kind === 'Infinity' ? INF : -INF);
    }
    if (is_bool($expect)) {
        return is_bool($got) && $got === $expect;
    }
    if (is_array($expect) && array_is_list($expect)) {
        if (!is_array($got) || !array_is_list($got) || count($got) !== count($expect)) {
            return false;
        }
        foreach ($expect as $i => $e) {
            if (!bfe_match($got[$i] ?? null, $e)) {
                return false;
            }
        }
        return true;
    }
    if (is_array($expect)) { // JSON object
        $gotArr = $got instanceof \stdClass ? get_object_vars($got) : (is_array($got) ? $got : null);
        if ($gotArr === null || count($gotArr) !== count($expect)) {
            return false;
        }
        foreach ($expect as $k => $v) {
            if (!array_key_exists($k, $gotArr) || !bfe_match($gotArr[$k], $v)) {
                return false;
            }
        }
        return true;
    }
    if ($got === null || is_array($got) || $got instanceof \stdClass) {
        return false;
    }
    // Numeric comparison only when BOTH are real numbers (not a
    // numeric-looking string) -- e.g. String(42) must return the string
    // "42", and evaluating it as the number 42 must NOT pass.
    $wantNum = is_int($expect) || is_float($expect);
    $gotNum = is_int($got) || is_float($got);
    if ($wantNum !== $gotNum) {
        return false;
    }
    if ($wantNum) {
        if (is_int($got) && is_int($expect)) {
            return $got === $expect;
        }
        return (float) $got === (float) $expect;
    }
    return $got === $expect;
}

$doc = json_decode(file_get_contents($VECTORS_PATH), true);
bf_assert(!empty($doc['cases']), 'eval-vectors.json contains no cases');

// The shrink-only expected-failure ledger of the undefined rollout
// (spec/js-undefined-value.md, section 6), keyed by note: an unlisted
// failure fails, and so do a listed case that now passes and a listed note
// that names no case.
$ledger = json_decode(file_get_contents(dirname($VECTORS_PATH) . '/eval-expected-failures.json'), true);
$expected = $ledger['runtimes']['php'];
$seen = [];

foreach ($doc['cases'] as $case) {
    $note = $case['note'];
    $expr = $case['expr'];
    $env = bf_undefined_to_arg($case['env'] ?? []);
    $expect = $case['expect'];
    $seen[$note] = true;

    try {
        $got = Evaluator::evaluate($expr, $env);
        $ok = bfe_match($got, $expect);
        $detail = 'got ' . bf_fmt($got) . ', want ' . bf_fmt($expect);
    } catch (\Throwable $e) {
        $ok = false;
        $detail = 'threw ' . get_class($e) . ': ' . $e->getMessage();
    }
    $listed = array_key_exists($note, $expected);
    bf_test($note, function () use ($ok, $listed, $note, $detail, $expected) {
        if ($ok && $listed) {
            bf_assert(false, "ledger entry '{$note}' now passes; remove it from the ledger (step {$expected[$note]['step']})");
        }
        bf_assert($ok || $listed, "UNEXPECTED-FAIL {$note}: {$detail}");
    });
}
foreach (array_keys($expected) as $note) {
    bf_test("ledger entry {$note} names a case", function () use ($seen, $note) {
        bf_assert(isset($seen[$note]), "ledger entry '{$note}' matches no eval case -- renamed note?");
    });
}

return bf_finish();
