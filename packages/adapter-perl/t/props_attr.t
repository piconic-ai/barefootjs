use Test2::V0;

# props_attr — the `bf-p` hydration-payload attribute. The encoded JSON is
# embedded in a SINGLE-quoted attribute, so it must be attribute-escaped: a
# raw `'` inside a string value (e.g. a blog paragraph) terminates the
# attribute early and the client hydrates from truncated JSON (empty island
# text; found via the shared blog-ssr e2e). Same fix across the Perl,
# Python, Ruby, and Rust runtimes — keep the four tests in sync.

use FindBin qw($Bin);
use lib "$Bin/../lib";

use BarefootJS;
use JSON::PP ();

{
    package PropsAttrStubBackend;
    sub new         { bless {}, shift }
    sub encode_json { JSON::PP->new->canonical->encode($_[1]) }
}

sub bf_with ($props) {
    my $bf = BarefootJS->new(undef, { backend => PropsAttrStubBackend->new });
    $bf->_props($props) if $props;
    return $bf;
}

is bf_with(undef)->props_attr, '', 'no props emits nothing';
is bf_with({})->props_attr,    '', 'empty props emits nothing';

my $attr = bf_with({ note => q{it's <b> & co} })->props_attr;
is $attr, q{ bf-p='{&#34;note&#34;:&#34;it&#39;s &lt;b&gt; &amp; co&#34;}'},
    'JSON is attribute-escaped';

my ($value) = $attr =~ /bf-p='([^']*)'/;
my %ent = ('&#34;' => '"', '&#39;' => "'", '&lt;' => '<', '&gt;' => '>', '&amp;' => '&');
(my $decoded = $value) =~ s/(&#34;|&#39;|&lt;|&gt;|&amp;)/$ent{$1}/g;
is JSON::PP->new->decode($decoded), { note => q{it's <b> & co} },
    'attribute round-trips through entity decoding';

done_testing;
