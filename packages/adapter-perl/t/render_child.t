use strict;
use warnings;
use utf8;
use experimental 'signatures';

use Test2::V0;

use lib 'lib';
use BarefootJS;

# A do-nothing backend: render_child only touches the backend to
# materialize a `children` prop, which these cases never pass — but
# `new` eagerly builds the default Mojo backend, which isn't a dependency
# of this dist's test environment.
{
    package StubBackend;
    sub new { bless {}, shift }
    sub materialize { $_[1] }
}
sub new_bf { BarefootJS->new(undef, { backend => StubBackend->new }) }

# render_child renderer-invocation contract (#1897):
#   - the INVOKING instance is passed as a second argument so nested
#     renders can chain scope/slot identity off the caller;
#   - signature-style renderers (`sub ($props) { ... }`) that enforce
#     1-arg arity keep working via the arity fallback.

subtest 'renderer receives the invoking instance' => sub {
    my $bf = new_bf();
    $bf->_scope_id('Root_test');

    my ($seen_props, $seen_caller);
    $bf->register_child_renderer('probe', sub {
        my ($props, $caller) = @_;
        ($seen_props, $seen_caller) = ($props, $caller);
        return 'ok';
    });

    is $bf->render_child('probe', value => 1), 'ok', 'renderer output returned';
    is $seen_props->{value}, 1, 'props forwarded';
    ref_is $seen_caller, $bf, 'second argument is the invoking instance';

    # A nested invocation from a different instance passes THAT instance.
    my $child = new_bf();
    $child->_scope_id('Root_test_s0');
    $child->_child_renderers($bf->_child_renderers);
    $child->render_child('probe');
    ref_is $seen_caller, $child, 'nested call passes the nested instance';
};

subtest 'signature-style 1-arg renderers keep working (arity fallback)' => sub {
    my $bf = new_bf();

    $bf->register_child_renderer('strict', sub ($props) {
        return "got:$props->{value}";
    });

    is $bf->render_child('strict', value => 42), 'got:42',
        'sub ($props) renderer is called with one argument';
};

subtest 'renderer exceptions other than arity are rethrown' => sub {
    my $bf = new_bf();
    $bf->register_child_renderer('boom', sub {
        die "renderer exploded\n";
    });
    like dies { $bf->render_child('boom') }, qr/renderer exploded/,
        'real renderer errors propagate (no silent 1-arg retry)';
};

done_testing;
