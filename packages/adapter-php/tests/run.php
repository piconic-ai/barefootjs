<?php

declare(strict_types=1);

/**
 * Zero-dependency test runner for the engine-agnostic BarefootJS PHP
 * runtime -- NO PHPUnit. Requires each `test_*.php` file (every one is also
 * independently runnable via `php test_foo.php`), aggregates each file's
 * tiny TAP-ish summary, prints a final report, and exits 1 on any failure.
 *
 * Usage: `php tests/run.php` from the package root, or
 * `php packages/adapter-php/tests/run.php` from the repo root.
 *
 * `test_render.php` (a real, live Twig render) is NOT in this list -- it's
 * engine-specific and lives (and runs standalone) in
 * `packages/adapter-twig/php/tests/test_render.php`.
 */

define('BF_RUNNER', true);

require_once __DIR__ . '/_harness.php';
bf_require_runtime();

$testFiles = [
    'test_helper_vectors.php',
    'test_eval_vectors.php',
    'test_evaluator.php',
    'test_template_primitives.php',
    'test_query.php',
    'test_search_params.php',
    'test_spread_attrs.php',
    'test_omit.php',
    'test_props_attr.php',
    'test_render_child.php',
    'test_scope_comment.php',
];

$results = [];
$totalPass = 0;
$totalFail = 0;

foreach ($testFiles as $file) {
    $path = __DIR__ . '/' . $file;
    echo "\n== {$file} ==\n";
    if (!is_file($path)) {
        fwrite(STDERR, "missing test file: {$file}\n");
        $results[] = [$file, ['pass' => 0, 'fail' => 1, 'skipped' => false]];
        $totalFail++;
        continue;
    }
    bf_reset();
    $result = require $path;
    if (!is_array($result)) {
        // A test file that didn't `return bf_finish()` (shouldn't happen,
        // but don't let a silent misconfiguration hide as a pass).
        $result = ['pass' => 0, 'fail' => 1, 'skipped' => false];
        fwrite(STDERR, "{$file} did not return a summary array\n");
    }
    $results[] = [$file, $result];
    $totalPass += $result['pass'];
    $totalFail += $result['fail'];
}

echo "\n== Summary ==\n";
foreach ($results as [$file, $result]) {
    $flag = !empty($result['skipped']) ? ' (skipped)' : '';
    $skipCount = $result['skip_count'] ?? 0;
    $skipSuffix = $skipCount > 0 ? " skip={$skipCount}" : '';
    printf("%-32s pass=%-4d fail=%-4d%s%s\n", $file, $result['pass'], $result['fail'], $skipSuffix, $flag);
}
printf("TOTAL: pass=%d fail=%d\n", $totalPass, $totalFail);

exit($totalFail > 0 ? 1 : 0);
