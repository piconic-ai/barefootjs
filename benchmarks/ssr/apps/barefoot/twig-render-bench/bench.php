<?php
/**
 * SSR render-gap investigation, item 4: does a compile-to-real-PHP-code
 * template engine (Twig, via twig/twig's PHP-class compiler) pay the same
 * per-request "walk an interpreted tree" tax hono/jsx and Go's
 * html/template do, or does it look more like solid's precompiled-chunk
 * approach? Standalone script, not part of the product.
 *
 * Loads the SAME fixed 1,000-row dataset (../../data.json) the other SSR
 * benches use, builds ONE Twig\Environment (bench_ssr.twig, sitting next
 * to this script, dumped from the real TwigAdapter's compile of
 * ../components/BenchSsr.tsx via packages/adapter-twig/dump-bench.ts) —
 * `$env->load()` compiles the template to a PHP class on first use and
 * Twig's Environment caches that compiled class in memory for the rest
 * of the process, mirroring a warm long-running PHP-FPM worker or the
 * disk-cached production setting Twig's own docs recommend (TwigBackend's
 * `cache => false` here only disables the PERSISTENT disk cache across
 * process restarts, not Twig's in-process compiled-class cache).
 *
 * `$bf->_props(['initialRows' => $rows])` is set explicitly before each
 * render so `bf-p` is emitted — the real Twig test-render.ts conformance
 * harness never calls `_props()` at all (grep confirms; `bf-p` is
 * apparently untested for this adapter), which would silently skip the
 * props-serialization cost this bench exists to measure. Setting it here
 * keeps the comparison apples-to-apples with the Hono and Go benches,
 * which both emit their real hydration-props payload.
 *
 * WARMUP+MEASURE loop, timed with `hrtime(true)` — the PHP analogue of
 * bench-ssr.ts's measureServerRender. Writes one JSON array of per-call
 * elapsed milliseconds to timings.json.
 */
require __DIR__ . '/../../../../../packages/adapter-twig/php/vendor/autoload.php';

$rows = json_decode(file_get_contents(__DIR__ . '/../../../data.json'), true);

$backend = new \Barefoot\TwigBackend(['paths' => [__DIR__]]);

function render(\Barefoot\TwigBackend $backend, array $rows): string
{
    $bf = new \Barefoot\BarefootJS(null, ['backend' => $backend]);
    $bf->_scope_id('BenchSsr_bench');
    $bf->_is_child(false);
    $bf->_props(['initialRows' => $rows]);
    $vars = ['initialRows' => $rows, 'selected' => 0];
    return $backend->render_named('bench_ssr', $bf, $vars);
}

$one = render($backend, $rows);
file_put_contents(__DIR__ . '/one.html', $one);
printf(
    "rows(<tr): %d, bytes: %d, has bf-p: %s\n",
    substr_count($one, '<tr'),
    strlen($one),
    strpos($one, 'bf-p') !== false ? 'true' : 'false',
);

const WARMUP = 50;
const MEASURE = 2000;

for ($i = 0; $i < WARMUP; $i++) {
    render($backend, $rows);
}

$iterations = [];
for ($i = 0; $i < MEASURE; $i++) {
    $t0 = hrtime(true);
    render($backend, $rows);
    $iterations[] = (hrtime(true) - $t0) / 1e6; // ms
}

file_put_contents(__DIR__ . '/timings.json', json_encode($iterations));
echo "wrote timings.json\n";
