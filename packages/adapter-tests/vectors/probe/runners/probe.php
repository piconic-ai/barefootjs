<?php
declare(strict_types=1);
// Probe runner (PHP evaluator). Reads $PROBE_VECTORS. See ../README.md.
require_once __DIR__ . '/../../../../adapter-php/src/Evaluator.php';
use Barefoot\Evaluator;

function bfe_match($got, $expect): bool {
    if ($expect === null) return $got === null;
    if (is_array($expect) && array_key_exists('$num', $expect) && count($expect) === 1) {
        $kind = $expect['$num'];
        if (is_bool($got) || !(is_int($got) || is_float($got))) return false;
        $g = (float) $got;
        if ($kind === 'NaN') return is_nan($g);
        return $g === ($kind === 'Infinity' ? INF : -INF);
    }
    if (is_bool($expect)) return is_bool($got) && $got === $expect;
    if (is_array($expect) && array_is_list($expect)) {
        if (!is_array($got) || !array_is_list($got) || count($got) !== count($expect)) return false;
        foreach ($expect as $i => $e) if (!bfe_match($got[$i] ?? null, $e)) return false;
        return true;
    }
    if (is_array($expect)) {
        $gotArr = $got instanceof \stdClass ? get_object_vars($got) : (is_array($got) ? $got : null);
        if ($gotArr === null || count($gotArr) !== count($expect)) return false;
        foreach ($expect as $k => $v) if (!array_key_exists($k, $gotArr) || !bfe_match($gotArr[$k], $v)) return false;
        return true;
    }
    if ($got === null || is_array($got) || $got instanceof \stdClass) return false;
    $wantNum = is_int($expect) || is_float($expect);
    $gotNum = is_int($got) || is_float($got);
    if ($wantNum !== $gotNum) return false;
    if ($wantNum) return (float) $got === (float) $expect;
    return $got === $expect;
}
function fmt($v): string {
    if (is_float($v) && (is_nan($v) || is_infinite($v))) return (string) $v;
    $j = json_encode($v);
    return $j === false ? var_export($v, true) : $j;
}

$doc = json_decode(file_get_contents(getenv('PROBE_VECTORS')), true);
$n = 0;
foreach ($doc['cases'] as $c) {
    $n++;
    try {
        $got = Evaluator::evaluate($c['expr'], $c['env'] ?? []);
    } catch (\Throwable $e) {
        echo "ERROR\t{$c['category']}\t{$c['note']}\t" . get_class($e) . ": " . $e->getMessage() . "\n";
        continue;
    }
    if (!bfe_match($got, $c['expect'])) {
        $kind = !empty($c['known']) ? 'KNOWN' : 'NEW';
        echo "{$kind}\t{$c['category']}\t{$c['note']}\t" . fmt($got) . "\t" . fmt($c['expect']) . "\n";
    }
}
echo "RAN\t{$n}\n";
