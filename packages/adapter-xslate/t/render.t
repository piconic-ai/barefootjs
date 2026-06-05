use Test2::V0;
use utf8;
use File::Temp qw(tempdir);
use File::Spec;

use BarefootJS;
use BarefootJS::Backend::Xslate;

# Write a Kolon template equivalent to what the @barefootjs/xslate compile-time
# adapter emits, then render it through the runtime + this backend.
my $dir = tempdir(CLEANUP => 1);
open my $fh, '>:encoding(UTF-8)', File::Spec->catfile($dir, 'widget.tx') or die $!;
print $fh <<'TX';
<div bf-s="<: $bf.scope_attr() :>" <: $bf.hydration_attrs() | mark_raw :>>count: <: $bf.text_start("s0") | mark_raw :><: $count :><: $bf.text_end() | mark_raw :> <span <: $bf.spread_attrs($attrs) :>><: $label :></span></div>
TX
close $fh;

my $backend = BarefootJS::Backend::Xslate->new(path => [$dir]);
my $bf = BarefootJS->new(undef, { backend => $backend });
$bf->_scope_id('Widget_test');

my $out = $backend->render_named('widget', $bf, {
    count => 7,
    label => '<x>',
    attrs => { id => 'n', class => 'c' },
});

like $out, qr/bf-s="Widget_test" bf-r=""/, 'scope + hydration markers (raw)';
like $out, qr{count: <!--bf:s0-->7<!--/-->}, 'reactive text slot with comment markers';
like $out, qr/&lt;x&gt;/, 'plain interpolation is auto-escaped';
like $out, qr/<span class="c" id="n">/, 'spread_attrs renders raw with sorted keys';

# Backend unit operations.
is $backend->materialize('plain'), 'plain', 'materialize: scalar passthrough';
is $backend->materialize(sub { 'lazy' }), 'lazy', 'materialize: resolves CODE ref';
like $backend->encode_json({ b => 2, a => 1 }), qr/^\{"a":1,"b":2\}$/,
    'encode_json: canonical key order';

done_testing;
