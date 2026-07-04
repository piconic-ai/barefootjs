<?php

declare(strict_types=1);

/**
 * Tiny zero-dependency TAP-ish assertion harness shared by every
 * php/tests/test_*.php file (NOT one of the design doc's 9 test files
 * itself -- a private support module, mirroring how the Perl port's t/*.t
 * files share Test::More and the Python port's test_*.py files share
 * unittest.TestCase; this package intentionally carries no PHPUnit
 * dependency, so this file is the minimal stand-in).
 *
 * Each test file:
 *   1. `require_once`s this file (guarded so it's a no-op on a second load).
 *   2. calls `bf_reset()` to start with a clean per-file counter.
 *   3. calls `bf_test($name, fn)` once per case.
 *   4. ends with `bf_finish()`, which either `return`s a
 *      `['pass' => n, 'fail' => n]` summary (when `run.php` is driving,
 *      signalled by the `BF_RUNNER` constant) or prints a summary and
 *      `exit()`s with the right code (when the file is run standalone via
 *      `php test_foo.php`).
 */

$GLOBALS['__bf_pass'] = 0;
$GLOBALS['__bf_fail'] = 0;
$GLOBALS['__bf_failures'] = [];
$GLOBALS['__bf_skipped'] = false;
$GLOBALS['__bf_skip_count'] = 0;

function bf_reset(): void
{
    $GLOBALS['__bf_pass'] = 0;
    $GLOBALS['__bf_fail'] = 0;
    $GLOBALS['__bf_failures'] = [];
    $GLOBALS['__bf_skipped'] = false;
    $GLOBALS['__bf_skip_count'] = 0;
}

function bf_test(string $name, callable $fn): void
{
    try {
        $fn();
        $GLOBALS['__bf_pass']++;
        echo "ok - {$name}\n";
    } catch (\Throwable $e) {
        $GLOBALS['__bf_fail']++;
        $GLOBALS['__bf_failures'][] = "{$name}: {$e->getMessage()}";
        echo "not ok - {$name}: {$e->getMessage()}\n";
    }
}

/**
 * Record one case as VISIBLY skipped (TAP "# SKIP" directive), as opposed
 * to `bf_test()`'s pass/fail -- used for a per-backend `unsupported`
 * declaration (spec/template-helpers.md "Adapter status model"), so a
 * helper with no binding on this backend shows up in the run's output
 * instead of silently vanishing from the case count.
 */
function bf_skip(string $name, string $reason): void
{
    $GLOBALS['__bf_skip_count']++;
    echo "ok - {$name} # SKIP {$reason}\n";
}

function bf_assert(bool $cond, string $message = 'assertion failed'): void
{
    if (!$cond) {
        throw new \RuntimeException($message);
    }
}

function bf_fmt($v): string
{
    if ($v === null) {
        return 'null';
    }
    if (is_bool($v)) {
        return $v ? 'true' : 'false';
    }
    if (is_float($v) && is_nan($v)) {
        return 'NaN';
    }
    if (is_scalar($v)) {
        return var_export($v, true);
    }
    if ($v instanceof \stdClass) {
        return 'object:' . json_encode($v);
    }
    return json_encode($v);
}

function bf_assert_eq($actual, $expected, string $message = ''): void
{
    $ok = $actual === $expected;
    if (!$ok && is_float($actual) && is_float($expected) && is_nan($actual) && is_nan($expected)) {
        $ok = true;
    }
    if (!$ok) {
        $prefix = $message !== '' ? "{$message}: " : '';
        throw new \RuntimeException($prefix . 'expected ' . bf_fmt($expected) . ', got ' . bf_fmt($actual));
    }
}

function bf_assert_nan($actual, string $message = 'expected NaN'): void
{
    bf_assert(is_float($actual) && is_nan($actual), $message . ' (got ' . bf_fmt($actual) . ')');
}

/** Mark the whole file as skipped (e.g. a golden-vectors fixture or vendor/
 * dependency isn't available). Distinct from a failing test. */
function bf_skip_file(string $reason): void
{
    echo "skip - {$reason}\n";
    $GLOBALS['__bf_skipped'] = true;
}

function bf_finish(): array
{
    $pass = $GLOBALS['__bf_pass'];
    $fail = $GLOBALS['__bf_fail'];
    $skipped = $GLOBALS['__bf_skipped'];
    $skipCount = $GLOBALS['__bf_skip_count'];
    if ($fail > 0) {
        fwrite(STDERR, "\nFailures:\n");
        foreach ($GLOBALS['__bf_failures'] as $f) {
            fwrite(STDERR, "  - {$f}\n");
        }
    }
    $result = ['pass' => $pass, 'fail' => $fail, 'skipped' => $skipped, 'skip_count' => $skipCount];
    if (defined('BF_RUNNER')) {
        return $result;
    }
    printf(
        "%s: pass=%d fail=%d%s%s\n",
        basename($_SERVER['SCRIPT_NAME'] ?? 'test'),
        $pass,
        $fail,
        $skipCount > 0 ? " skip={$skipCount}" : '',
        $skipped ? ' (skipped)' : ''
    );
    exit($fail > 0 ? 1 : 0);
}

/** Require the runtime source files directly (no composer autoload needed
 * for the pure-PHP, Twig-independent surface). Idempotent.
 *
 * `TwigBackend.php` is included too: it only ever references
 * `Twig\Environment`/`FilesystemLoader`/`Markup` as TYPE HINTS and inside
 * method bodies, never at file-parse time, so simply loading the class
 * declaration (to reach its Twig-independent static helpers --
 * `defaultJsonEncoder()` -- used by the pure-logic vector tests below) does
 * not require `twig/twig` to be installed. Actually *instantiating*
 * `TwigBackend` (which happens only in `test_render.php`) does require it,
 * and that file guards on `vendor/autoload.php` first. */
function bf_require_runtime(): void
{
    if (class_exists(\Barefoot\BarefootJS::class)) {
        return;
    }
    require_once __DIR__ . '/../src/naming.php';
    require_once __DIR__ . '/../src/Evaluator.php';
    require_once __DIR__ . '/../src/SearchParams.php';
    require_once __DIR__ . '/../src/BarefootJS.php';
    require_once __DIR__ . '/../src/TwigBackend.php';
}
