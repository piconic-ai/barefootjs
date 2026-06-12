use strict;
use warnings;
use utf8;

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

# render_child renderer-invocation contract (#1897): the renderer is
# invoked with ($props_hashref, $invoking_bf) so nested renders can chain
# scope/slot identity off the caller. Renderers unpack @_ rather than
# enforcing arity with a one-arg subroutine signature (see
# register_child_renderer's doc).

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

subtest 'renderer exceptions propagate' => sub {
    my $bf = new_bf();
    $bf->register_child_renderer('boom', sub {
        die "renderer exploded\n";
    });
    like dies { $bf->render_child('boom') }, qr/renderer exploded/,
        'renderer errors propagate to the caller';
};

done_testing;
