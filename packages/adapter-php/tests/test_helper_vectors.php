<?php

declare(strict_types=1);

/**
 * Golden helper-vector conformance, ported from
 * packages/adapter-perl/t/helper_vectors.t (see also the Python port's
 * test_helper_vectors.py).
 *
 * Runs packages/adapter-tests/vectors/vectors.json -- generated from
 * the JS reference implementations (spec/template-helpers.md) -- against
 * this package's BarefootJS runtime. One binding per canonical helper id in
 * the spec catalogue, bound to the exact code shape a compiled Twig
 * template would execute (a `bf.<method>(...)` call, or the native PHP
 * operator the adapter emits for add/sub/mul/div/neg).
 *
 * Per spec/template-helpers.md's "Adapter status model", this backend's
 * divergences from the JS-normative expect live in
 * `tests/vector-divergences.json` (package-local, next to this file) --
 * keyed by fn/note, mirroring the Perl/Python harnesses' divergence tables
 * (values differ where PHP's actual behaviour differs from Perl's/Python's,
 * all independently re-derived and verified against a live PHP 8.4
 * interpreter -- see the runtime source docstrings). This harness fails on
 * stale or dead declarations in that file; it's checked again, centrally,
 * by packages/adapter-tests/src/__tests__/divergences.test.ts.
 *
 * Unlike the Python/Perl/Ruby ports, a missing golden-vector corpus or a
 * missing vector-divergences.json is a LOUD failure here, not a silent
 * skip -- a silent skip after the corpus moved from
 * packages/adapter-tests/helper-vectors/ to packages/adapter-tests/vectors/
 * (#2084) let the suite quietly shrink from ~387 cases to 64 with zero
 * reported failures.
 */

require_once __DIR__ . '/_harness.php';
bf_require_runtime();
bf_reset();

use Barefoot\BarefootJS;
use Barefoot\Evaluator;

$VECTORS_PATH = __DIR__ . '/../../adapter-tests/vectors/vectors.json';
$DIVERGENCES_PATH = __DIR__ . '/vector-divergences.json';

if (!is_file($VECTORS_PATH)) {
    bf_test('golden vectors corpus is present', function () use ($VECTORS_PATH) {
        bf_assert(false, "vectors.json not found at {$VECTORS_PATH} -- regenerate it (cd packages/adapter-tests && bun run generate:helper-vectors) or check this path after a corpus move");
    });
    return bf_finish();
}

if (!is_file($DIVERGENCES_PATH)) {
    bf_test('vector-divergences.json is present', function () use ($DIVERGENCES_PATH) {
        bf_assert(false, "vector-divergences.json not found at {$DIVERGENCES_PATH} -- this backend's divergence declarations are required, see packages/adapter-tests/vectors/README.md");
    });
    return bf_finish();
}

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

// -----------------------------------------------------------------
// Predicate builders for the projection-form vector cases (spec: items +
// field [+ value]) -- rebuilds the predicate closure the adapter compiles.
// -----------------------------------------------------------------

function bfv_truthy_pred(BarefootJS $bf, string $field): callable
{
    return function ($item) use ($bf, $field) {
        if (!is_array($item) && !($item instanceof \stdClass)) {
            return false;
        }
        $v = $item instanceof \stdClass ? ($item->$field ?? null) : ($item[$field] ?? null);
        return $bf->truthy($v);
    };
}

function bfv_field_eq_pred(string $field, $value): callable
{
    return function ($item) use ($field, $value) {
        if (!is_array($item) && !($item instanceof \stdClass)) {
            return false;
        }
        $v = $item instanceof \stdClass ? ($item->$field ?? null) : ($item[$field] ?? null);
        return Evaluator::strictEq($v, $value);
    };
}

function bfv_bind_sort(BarefootJS $bf, $recv, ...$spec)
{
    $keys = [];
    while (count($spec) >= 4) {
        [$kind, $name, $compareType, $direction] = array_splice($spec, 0, 4);
        $keys[] = ['key_kind' => $kind, 'key' => $name, 'compare_type' => $compareType, 'direction' => $direction];
    }
    return $bf->sort($recv, ['keys' => $keys]);
}

function bfv_bind_reduce(BarefootJS $bf, $recv, $op, $keyKind, $key, $rtype, $init, $direction)
{
    $seed = $rtype === 'numeric' ? (float) $init : $init;
    return $bf->reduce($recv, [
        'op' => $op, 'key_kind' => $keyKind, 'key' => $key, 'type' => $rtype, 'init' => $seed, 'direction' => $direction,
    ]);
}

/**
 * Materializes the `{"$date": "<ISO>"}` native-date arg sentinel (#2288)
 * into a real DateTimeImmutable, so `date`'s native-receiver branch (not
 * just its ISO-string branch) is exercised. Recurses through arrays the
 * same shape the Perl port's normalize_arg walks, since a vector's `args`
 * may nest the sentinel inside a higher-order projection payload.
 */
function bfv_materialize(array $args): array
{
    return array_map(function ($a) {
        if (is_array($a) && array_keys($a) === ['$date']) {
            return new \DateTimeImmutable($a['$date']);
        }
        return is_array($a) ? bfv_materialize($a) : $a;
    }, $args);
}

/**
 * Dispatch one vector case's `fn` to the exact runtime call shape a
 * compiled template would emit. Throws for helper ids with no PHP binding
 * (fail loudly rather than silently skip) and lets underlying runtime
 * exceptions (e.g. DivisionByZeroError) propagate to the caller.
 */
function bfv_call(BarefootJS $bf, string $fn, array $args)
{
    switch ($fn) {
        case 'add': return $args[0] + $args[1];
        case 'sub': return $args[0] - $args[1];
        case 'mul': return $args[0] * $args[1];
        case 'div': return $args[0] / $args[1];
        case 'mod': return $bf->mod($args[0], $args[1]);
        case 'neg': return -$args[0];
        case 'string': return $bf->string($args[0]);
        case 'json': return $bf->json($args[0]);
        case 'number': return $bf->number($args[0]);
        case 'floor': return $bf->floor($args[0]);
        case 'ceil': return $bf->ceil($args[0]);
        case 'round': return $bf->round($args[0]);
        case 'min': return $bf->min($args[0], $args[1]);
        case 'max': return $bf->max($args[0], $args[1]);
        case 'abs': return $bf->abs($args[0]);
        case 'to_fixed': return $bf->to_fixed(...$args);
        case 'date': return $bf->date($args[0], $args[1]);
        case 'format_date': return $bf->format_date($args[0], $args[1], $args[2]);
        case 'lower': return $bf->lc($args[0]);
        case 'upper': return $bf->uc($args[0]);
        case 'trim': return $bf->trim($args[0]);
        case 'trim_start': return $bf->trim_start($args[0]);
        case 'trim_end': return $bf->trim_end($args[0]);
        case 'starts_with': return $bf->starts_with(...$args);
        case 'ends_with': return $bf->ends_with(...$args);
        case 'replace': return $bf->replace(...$args);
        case 'replace_all': return $bf->replace_all(...$args);
        case 'repeat': return $bf->repeat(...$args);
        case 'pad_start': return $bf->pad_start(...$args);
        case 'pad_end': return $bf->pad_end(...$args);
        case 'split': return $bf->split(...$args);
        case 'len': return $bf->length($args[0]);
        case 'at': return $bf->at(...$args);
        case 'includes': return $bf->includes(...$args);
        case 'index_of': return $bf->index_of(...$args);
        case 'last_index_of': return $bf->last_index_of(...$args);
        case 'concat': return $bf->concat($args[0], $args[1]);
        case 'slice': return $bf->slice($args[0], $args[1], $args[2] ?? null);
        case 'reverse': return $bf->reverse($args[0]);
        case 'flat': return $bf->flat(...$args);
        case 'flat_dynamic': return $bf->flat_dynamic(...$args);
        case 'join': return $bf->join(...$args);
        case 'arr': return $args; // variadic array-literal elements, in order
        case 'filter_truthy': return array_values(array_filter($args[0], fn ($x) => $bf->truthy($x)));
        case 'search_params_get': return BarefootJS::search_params($args[0])->get($args[1]);
        case 'query': return $bf->query(...$args);
        case 'every': return $bf->every($args[0], bfv_truthy_pred($bf, $args[1]));
        case 'some': return $bf->some($args[0], bfv_truthy_pred($bf, $args[1]));
        case 'filter': return $bf->filter($args[0], bfv_field_eq_pred($args[1], $args[2]));
        case 'find': return $bf->find($args[0], bfv_field_eq_pred($args[1], $args[2]));
        case 'find_index': return $bf->find_index($args[0], bfv_field_eq_pred($args[1], $args[2]));
        case 'find_last': return $bf->find_last($args[0], bfv_field_eq_pred($args[1], $args[2]));
        case 'find_last_index': return $bf->find_last_index($args[0], bfv_field_eq_pred($args[1], $args[2]));
        case 'sort': return bfv_bind_sort($bf, ...$args);
        case 'reduce': return bfv_bind_reduce($bf, ...$args);
        case 'flat_map': return $bf->flat_map(...$args);
        case 'flat_map_tuple': return $bf->flat_map_tuple(...$args);
        default:
            throw new \RuntimeException("no PHP binding for helper '{$fn}' -- add it to bfv_call()");
    }
}

/**
 * Per-backend status declarations (spec/template-helpers.md "Adapter status
 * model"), loaded from tests/vector-divergences.json (package-local, next
 * to this file). Divergence entry forms (JSON schema, see
 * packages/adapter-tests/vectors/README.md):
 *   {"expect": <value>}              assert the pinned value (exact --
 *                                    deliberately stricter than bfv_match's
 *                                    value-compat so an int-vs-float
 *                                    rounding accident can't hide behind the
 *                                    comparison)
 *   {"expect": {"$num": "NaN"}}      assert a real NaN result
 *   {"throws": true, "exception": <FQCN>}  assert the call throws that
 *                                    exception class (defaults to
 *                                    \Throwable if `exception` is absent)
 *
 * Every entry was independently re-derived against a live PHP 8.4
 * interpreter (see php -r probes referenced in the runtime source
 * docstrings), not copy-pasted from the Perl/Python tables -- several of
 * PHP's actual divergent VALUES differ from Perl's even though the REASON
 * is the same class of divergence (e.g. PHP's `sort` produces the same
 * ["B","a"] ordering Python does, not Perl's differently-cased fixture).
 */
$divergencesDoc = json_decode(file_get_contents($DIVERGENCES_PATH), true);
$DIVERGENCES = $divergencesDoc['divergences'] ?? [];
$UNSUPPORTED = $divergencesDoc['unsupported'] ?? [];

function bfv_match($got, $expect): bool
{
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
        return (bool) $got === $expect;
    }
    if (is_array($expect) && array_is_list($expect)) {
        if (!is_array($got) || !array_is_list($got) || count($got) !== count($expect)) {
            return false;
        }
        foreach ($expect as $i => $e) {
            if (!bfv_match($got[$i] ?? null, $e)) {
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
            if (!array_key_exists($k, $gotArr) || !bfv_match($gotArr[$k], $v)) {
                return false;
            }
        }
        return true;
    }
    if ($got === null || is_array($got) || $got instanceof \stdClass) {
        return false;
    }
    if ((is_int($expect) || is_float($expect))) {
        if (is_bool($got) || !(is_int($got) || is_float($got))) {
            return false;
        }
        if (is_int($got) && is_int($expect)) {
            return $got === $expect;
        }
        return (float) $got === (float) $expect;
    }
    return $got === $expect; // strings
}

$doc = json_decode(file_get_contents($VECTORS_PATH), true);
bf_assert(!empty($doc['cases']), 'vectors.json contains no cases');

$seenDeclarations = [];

foreach ($doc['cases'] as $case) {
    $fn = $case['fn'];
    $note = $case['note'];
    $args = bfv_materialize($case['args']);
    $expect = $case['expect'];
    $key = "{$fn}/{$note}";

    if (isset($UNSUPPORTED[$fn])) {
        bf_skip($key, "unsupported on this backend: {$UNSUPPORTED[$fn]}");
        continue;
    }

    $divergence = $DIVERGENCES[$key] ?? null;

    bf_test($key, function () use ($bf, $fn, $args, $expect, $key, $divergence, &$seenDeclarations) {
        if ($divergence !== null && !empty($divergence['throws'])) {
            $seenDeclarations[$key] = true;
            $exceptionClass = $divergence['exception'] ?? \Throwable::class;
            try {
                bfv_call($bf, $fn, $args);
                bf_assert(false, "expected {$exceptionClass} but no exception was thrown ({$divergence['reason']})");
            } catch (\Throwable $e) {
                bf_assert(
                    $e instanceof $exceptionClass,
                    "expected {$exceptionClass}, got " . get_class($e) . ": {$e->getMessage()}"
                );
            }
            return;
        }

        $got = bfv_call($bf, $fn, $args);

        if ($divergence !== null) {
            $seenDeclarations[$key] = true;
            bf_assert(!bfv_match($got, $expect), "stale divergence declaration for '{$key}' -- the backend now matches JS; remove it");
            $want = $divergence['expect'];
            if (is_array($want) && array_key_exists('$num', $want) && count($want) === 1) {
                bf_assert(bfv_match($got, $want), "{$key} (declared divergence: {$divergence['reason']}): got " . bf_fmt($got) . ', want ' . bf_fmt($want));
            } elseif ((is_int($want) || is_float($want)) && (is_int($got) || is_float($got))) {
                bf_assert((float) $got === (float) $want, "{$key} (declared divergence): expected " . bf_fmt($want) . ', got ' . bf_fmt($got));
            } else {
                bf_assert_eq($got, $want, "{$key} (declared divergence: {$divergence['reason']})");
            }
            return;
        }

        bf_assert(bfv_match($got, $expect), "{$key}: got " . bf_fmt($got) . ', want ' . bf_fmt($expect));
    });
}

$stale = array_diff(array_keys($DIVERGENCES), array_keys($seenDeclarations));
bf_test('no stale divergence declarations', function () use ($stale) {
    bf_assert($stale === [], 'divergence declarations match no vector case -- renamed note? ' . implode(', ', $stale));
});

return bf_finish();
