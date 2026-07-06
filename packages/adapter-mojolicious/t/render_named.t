use Test2::V0;

# BarefootJS::Backend::Mojo::render_named error propagation (#2132).
#
# `$c->render_to_string` returns undef — it does NOT die — when the named
# template can't be rendered (missing template file). The calling template's
# `<%==` emitted that as an empty string, silently dropping the whole child
# subtree from the page. render_named must fail loudly instead, and a die
# mid-child-render must leave the request's active bf instance restored.

use FindBin qw($Bin);
use lib "$Bin/../lib";

use Mojo::File qw(tempdir);
use Mojolicious;

use BarefootJS;
use BarefootJS::Backend::Mojo;

my $dir = tempdir;
$dir->child('boom.html.ep')->spew(qq{% die "kaboom";\n});
$dir->child('ok.html.ep')->spew(qq{fine\n});

my $app = Mojolicious->new;
push @{ $app->renderer->paths }, "$dir";
my $c = $app->build_controller;

my $root_bf  = BarefootJS->new($c, {});
my $child_bf = BarefootJS->new($c, {});
$c->stash->{'bf.instance'} = $root_bf;
my $backend = BarefootJS::Backend::Mojo->new(c => $c);

subtest 'a resolvable template renders' => sub {
    my $html = $backend->render_named('ok', $child_bf, {});
    like $html, qr/fine/, 'named template output returned';
    ref_is $c->stash->{'bf.instance'}, $root_bf,
        'active instance restored after the nested render';
};

subtest 'a missing template dies instead of rendering empty' => sub {
    like dies { $backend->render_named('no/such/template', $child_bf, {}) },
        qr/rendered no output/,
        'undef from render_to_string surfaces as an exception';
    ref_is $c->stash->{'bf.instance'}, $root_bf,
        'active instance restored after the failed render';
};

subtest 'a template exception propagates and restores the active instance' => sub {
    like dies { $backend->render_named('boom', $child_bf, {}) },
        qr/kaboom/, 'template die reaches the caller';
    ref_is $c->stash->{'bf.instance'}, $root_bf,
        'active instance restored even when the nested render dies';
};

done_testing;
