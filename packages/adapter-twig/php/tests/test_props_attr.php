<?php

declare(strict_types=1);

/**
 * `BarefootJS::props_attr` -- the `bf-p` hydration-payload attribute.
 *
 * The encoded JSON is embedded in a SINGLE-quoted attribute, so it must be
 * attribute-escaped: a raw `'` inside a string value (e.g. a blog paragraph)
 * terminates the attribute early and the client hydrates from truncated JSON
 * (empty island text; found via the shared blog-ssr e2e). Same fix across
 * the Perl, Python, Ruby, Rust, and PHP runtimes (#2086) -- keep the five
 * tests in sync.
 */

require_once __DIR__ . '/_harness.php';
bf_require_runtime();
bf_reset();

use Barefoot\BarefootJS;
use Barefoot\TwigBackend;

$backend = new class {
    public function encode_json($value): string
    {
        return TwigBackend::defaultJsonEncoder($value);
    }
};

function bfp_with($props): BarefootJS
{
    global $backend;
    $bf = new BarefootJS(null, ['backend' => $backend]);
    if ($props !== null) {
        $bf->_props($props);
    }
    return $bf;
}

bf_test('empty props emit nothing', function () {
    bf_assert_eq(bfp_with(null)->props_attr(), '');
    bf_assert_eq(bfp_with([])->props_attr(), '');
});

bf_test('json is attribute-escaped', function () {
    $attr = bfp_with(['note' => "it's <b> & co"])->props_attr();
    bf_assert_eq($attr, " bf-p='{&#34;note&#34;:&#34;it&#39;s &lt;b&gt; &amp; co&#34;}'");
});

bf_test('attribute round-trips through entity decoding', function () {
    $attr = bfp_with(['note' => "it's <b> & co"])->props_attr();
    if (!preg_match("/bf-p='([^']*)'/", $attr, $m)) {
        throw new RuntimeException('bf-p attribute not found in: ' . $attr);
    }
    $decoded = str_replace(
        ['&#34;', '&#39;', '&lt;', '&gt;', '&amp;'],
        ['"', "'", '<', '>', '&'],
        $m[1]
    );
    bf_assert_eq(json_decode($decoded, true), ['note' => "it's <b> & co"]);
});

return bf_finish();
