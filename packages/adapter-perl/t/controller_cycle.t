use strict;
use warnings;

# Per-request reference-cycle regression test.
#
# The Mojolicious plugin stashes the bf instance under
# `$c->stash->{'bf.instance'}`, so any strong bf -> controller back-reference
# (held by the bf instance, its backend, or a child-renderer closure) closes a
# cycle that Perl's refcount GC cannot reclaim — leaking one controller + bf +
# closures per request. BarefootJS / BarefootJS::Backend::Mojo therefore hold
# the controller weakly, and `register_components_from_manifest` reaches the
# controller through the weak `$parent` rather than capturing it strongly.
#
# This test reproduces the plugin's wiring with a pure-Perl controller +
# backend (no Mojolicious dependency, so it runs anywhere) and asserts the
# whole graph is freed once the request-scope lexicals drop.

use Test2::V0;
use Scalar::Util qw(weaken);

use FindBin qw($Bin);
use lib "$Bin/../lib";

use BarefootJS;

# Controller stand-in that owns a stash, like a Mojolicious controller.
{
    package FakeController;
    sub new   { bless { stash => {} }, shift }
    sub stash { $_[0]{stash} }
}

# Pure-Perl backend mirroring the fixed BarefootJS::Backend::Mojo: it holds the
# controller weakly so it never contributes a strong edge to the cycle.
{
    package WeakBackend;
    use Scalar::Util qw(weaken);
    sub new {
        my ($class, %args) = @_;
        my $self = bless {%args}, $class;
        weaken($self->{c}) if $self->{c};
        return $self;
    }
    sub c           { $_[0]{c} }
    sub encode_json { '{}' }
    sub mark_raw    { $_[1] }
    sub materialize { $_[1] }
    sub render_named { '' }
}

my ($probe_bf, $probe_c);
{
    my $c  = FakeController->new;
    my $bf = BarefootJS->new($c, { backend => WeakBackend->new(c => $c) });

    # Mimic Mojolicious::Plugin::BarefootJS: the `bf` helper stashes the
    # instance on the controller (the edge that closes the cycle).
    $c->stash->{'bf.instance'} = $bf;
    $bf->_scope_id('root');

    # The manifest path registers child-renderer closures onto $bf. These must
    # not capture the controller strongly.
    $bf->register_components_from_manifest({
        'ui/button/index' => {
            markedTemplate => 'templates/ui/button/index.html.ep',
            ssrDefaults    => {},
        },
    });

    weaken($probe_bf = $bf);
    weaken($probe_c  = $c);
}    # request-scope lexicals ($c, $bf) drop here

is $probe_bf, undef,
    'parent bf is reclaimed at request end (no controller reference cycle)';
is $probe_c, undef,
    'controller is reclaimed at request end (no controller reference cycle)';

done_testing;
