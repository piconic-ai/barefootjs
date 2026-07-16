use Test2::V0;

# Fragment-rooted scope comment pair (#2289): the Mojo adapter's
# `renderFragment` emits `<%== bf->scope_comment %>…<%== bf->scope_comment_end %>`
# around a fragment's children. The end marker bounds the scope's sibling
# range — without it, client-side queries from the fragment scope leak
# onto later siblings owned by the parent. Rendered through a real
# Mojolicious `.ep` template so the `<%== %>` raw-output filter chain is
# exercised, not just the underlying Perl subs (those are pinned directly
# in adapter-perl's t/scope_comment.t).

use FindBin qw($Bin);
use lib "$Bin/../lib", "$Bin/../../adapter-perl/lib";

use Mojo::File qw(tempdir);
use Mojolicious;

use BarefootJS;
use BarefootJS::Backend::Mojo;

my $dir = tempdir;
$dir->child('frag.html.ep')->spew(
    qq{<%== bf->scope_comment %><span>A</span><span><%= \$count %></span><%== bf->scope_comment_end %>\n}
);

my $app = Mojolicious->new;
push @{ $app->renderer->paths }, "$dir";
# `bf->…` in the .ep template resolves as the plugin's controller helper,
# not a bareword call on a lexical — register it for real rather than
# hand-stubbing `bf.instance` (manifest auto-init is irrelevant here).
$app->plugin('BarefootJS', { manifest_path => undef });
my $c = $app->build_controller;

my $bf = $c->bf;
$bf->_scope_id('FragmentDemo_test');
my $backend = BarefootJS::Backend::Mojo->new(c => $c);

my $html = $backend->render_named('frag', $bf, { count => 3 });

like $html, qr/^<!--bf-scope:FragmentDemo_test-->/, 'begin marker leads the fragment';
like $html, qr/<!--bf-\/scope:FragmentDemo_test-->/, 'end marker trails the fragment, same scope id';

done_testing;
