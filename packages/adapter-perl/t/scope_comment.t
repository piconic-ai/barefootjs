use strict;
use warnings;
use utf8;

use Test2::V0;

use lib 'lib';
use BarefootJS;

# scope_comment / scope_comment_end (#2289): the end marker bounds the
# fragment scope's sibling range on the wire, so client-side queries from
# the scope don't leak onto later siblings owned by the parent. This pins
# the paired-marker contract directly against BarefootJS.pm, independent
# of any adapter's template output.

# A do-nothing backend: scope_comment only touches the backend to
# JSON-encode `_props` (and only when props are set); scope_comment_end
# never touches it at all.
{
    package StubBackend;
    sub new         { bless {}, shift }
    sub encode_json { '{}' }
}
sub new_bf { BarefootJS->new(undef, { backend => StubBackend->new }) }

subtest 'begin/end markers share the same scope id' => sub {
    my $bf = new_bf();
    $bf->_scope_id('Root_test');

    is $bf->scope_comment,     '<!--bf-scope:Root_test-->',  'begin marker carries the scope id';
    is $bf->scope_comment_end, '<!--bf-/scope:Root_test-->', 'end marker carries the SAME scope id';
};

# The end marker is deliberately bare: no `|h=`/`|m=` host/mount segment
# and no props JSON — the client only needs the scope id to find the
# matching end, and repeating those segments would just be dead weight.
subtest 'end marker omits host/mount and props segments the begin marker carries' => sub {
    my $bf = new_bf();
    $bf->_scope_id('Child_abc123');
    $bf->_bf_parent('Root_test');
    $bf->_bf_mount('s0');
    $bf->_props({ label => 'hi' });

    like $bf->scope_comment, qr/\|h=Root_test\|m=s0\|/, 'begin marker carries host/mount';
    like $bf->scope_comment, qr/\Q{}\E-->\z/, 'begin marker carries props JSON';
    is $bf->scope_comment_end, '<!--bf-/scope:Child_abc123-->',
        'end marker is bare — just the scope id';
};

subtest 'empty scope id still pairs (defensive default)' => sub {
    my $bf = new_bf();

    is $bf->scope_comment,     '<!--bf-scope:-->',  'begin marker with no scope id set';
    is $bf->scope_comment_end, '<!--bf-/scope:-->', 'end marker matches with no scope id set';
};

done_testing;
