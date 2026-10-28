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

# `passed` answers from the keys the caller handed over, so a key passed as
# undef counts and an omitted one does not; a root reads `_props`, and with
# no record at all the template's own fallback decides.
subtest 'passed reads the caller keys' => sub {
    my $bf = new_bf();
    my @seen;
    $bf->register_child_renderer('leaf', sub { '' });
    $bf->register_child_renderer('probe', sub {
        my (undef, $caller) = @_;
        my $child = new_bf();
        push @seen, $child->passed('label', 0), $child->passed('tone', 1);
        $caller->render_child('leaf', { tone => 'x' });
        push @seen, $child->passed('label', 0);
        return '';
    });
    $bf->render_child('probe', { label => undef });
    is \@seen, [1, 0, 1], 'the innermost call, restored after a nested render';
    is $bf->passed('label', 0), 0, 'the record is gone once the render returns';

    my $root = new_bf();
    is $root->passed('label', 1), 1, 'no record: the fallback decides';
    is $root->passed('label', 0), 0;
    $root->_props({ label => undef });
    is $root->passed('label', 0), 1, 'a root reads its _props';
    is $root->passed('tone', 1), 0;
};

done_testing;
