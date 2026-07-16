<?php

declare(strict_types=1);

/**
 * `BarefootJS::scope_comment` / `scope_comment_end` (#2289): the end marker
 * bounds the fragment scope's sibling range on the wire, so client-side
 * queries from the scope don't leak onto later siblings owned by the
 * parent. This pins the paired-marker contract directly against
 * `BarefootJS.php`, independent of any engine adapter's template output --
 * mirrors `packages/adapter-perl/t/scope_comment.t`.
 */

require_once __DIR__ . '/_harness.php';
bf_require_runtime();
bf_reset();

use Barefoot\BarefootJS;

// A do-nothing backend: scope_comment only touches the backend to
// JSON-encode `_props` (and only when props are set); scope_comment_end
// never touches it at all.
$backend = new class {
    public function encode_json($data): string
    {
        return '{}';
    }
};

function new_bf($backend): BarefootJS
{
    return new BarefootJS(null, ['backend' => $backend]);
}

bf_test('begin/end markers share the same scope id', function () use ($backend) {
    $bf = new_bf($backend);
    $bf->_scope_id('Root_test');

    bf_assert_eq($bf->scope_comment(), '<!--bf-scope:Root_test-->');
    bf_assert_eq($bf->scope_comment_end(), '<!--bf-/scope:Root_test-->');
});

// The end marker is deliberately bare: no `|h=`/`|m=` host/mount segment
// and no props JSON -- the client only needs the scope id to find the
// matching end, and repeating those segments would just be dead weight.
bf_test('end marker omits host/mount and props segments the begin marker carries', function () use ($backend) {
    $bf = new_bf($backend);
    $bf->_scope_id('Child_abc123');
    $bf->_bf_parent('Root_test');
    $bf->_bf_mount('s0');
    $bf->_props(['label' => 'hi']);

    bf_assert(str_contains($bf->scope_comment(), '|h=Root_test|m=s0|'), 'begin marker carries host/mount');
    bf_assert(str_ends_with($bf->scope_comment(), '{}-->'), 'begin marker carries props JSON');
    bf_assert_eq($bf->scope_comment_end(), '<!--bf-/scope:Child_abc123-->');
});

bf_test('empty scope id still pairs (defensive default)', function () use ($backend) {
    $bf = new_bf($backend);

    bf_assert_eq($bf->scope_comment(), '<!--bf-scope:-->');
    bf_assert_eq($bf->scope_comment_end(), '<!--bf-/scope:-->');
});

return bf_finish();
