use Test2::V0;
use utf8;

# BarefootJS::SearchParams — SSR reader behind the reactive searchParams()
# environment signal (router v0.5, #1922). Mirrors the Go runtime's
# bf.SearchParams test surface so cross-adapter regressions stay symmetric.
#
# This is the adapter-independent contract for the hand-rolled query parser:
# the runtime stays core-Perl-only (no URI / URI::Escape dependency), so this
# suite is the safety net that keeps the parsing honest across edge cases.

use FindBin qw($Bin);
use lib "$Bin/../lib";

use BarefootJS;
use BarefootJS::SearchParams;

# The compiled template renders `($searchParams->get($k) // 'none')`, so the
# behaviour that matters is what `get` returns and how Perl's `//` (which the
# adapters lower `??` to) treats it. `render` reproduces that exact shape.
sub render {
    my ($query, $key) = @_;
    my $sp = BarefootJS::SearchParams->new($query);
    return $sp->get($key) // 'none';
}

subtest 'absent key → undef → author default (the conformance default)' => sub {
    my $sp = BarefootJS::SearchParams->new('');
    is $sp->get('sort'), undef, 'empty query: absent key returns undef';
    is render('', 'sort'), 'none', 'empty query renders the `// default`';
    is render('?other=x', 'sort'), 'none', 'unrelated key: absent → default';
};

subtest 'present key → first value' => sub {
    is render('?sort=price', 'sort'), 'price', 'leading ? tolerated';
    is render('sort=price', 'sort'),  'price', 'no leading ?';
    is render('sort=price&page=2', 'sort'), 'price', 'first of many pairs';
    is render('page=2&sort=price', 'sort'), 'price', 'pair order independent';

    # Repeated keys: get returns the FIRST, like URLSearchParams.get.
    is render('sort=a&sort=b', 'sort'), 'a', 'repeated key → first value';
};

subtest 'present-but-empty value keeps "" (matches JS ?? / Perl //)' => sub {
    # This is the key divergence from the Go adapter: Perl's `//` coalesces
    # only undef, so a present-but-empty value survives — exactly like JS
    # `'' ?? 'none'` === '' (?? only coalesces null/undefined).
    my $sp = BarefootJS::SearchParams->new('?sort=');
    is $sp->get('sort'), '', 'present-but-empty value returns "" (not undef)';
    is render('?sort=', 'sort'), '', 'empty value does NOT fall back to default';

    # `?sort` with no `=` is also present-with-empty-value, per URLSearchParams.
    # (Bind first — `is Class->new(...)` trips Perl's indirect-object parse.)
    my $bare = BarefootJS::SearchParams->new('?sort');
    is $bare->get('sort'), '', 'bare key → ""';
};

subtest 'application/x-www-form-urlencoded decoding' => sub {
    is render('q=a%20b', 'q'), 'a b', 'percent-encoded space';
    is render('q=a+b', 'q'),   'a b', 'plus → space';
    is render('na%6de=x', 'name'), 'x', 'percent-encoded key';

    # Encoded separators in a VALUE must survive: the pair split is on the raw
    # `&` / `;` / `=`, decoding happens afterward, so `%26` / `%3D` are data.
    is render('q=a%26b', 'q'), 'a&b', 'encoded & in value is data, not a separator';
    is render('q=a%3Db', 'q'), 'a=b', 'encoded = in value is data';

    # A literal (unencoded) second `=` is part of the value (split limit 2),
    # matching URLSearchParams.
    is render('token=a=b=c', 'token'), 'a=b=c', 'unencoded = past the first is value data';

    # Percent-encoded UTF-8 decodes to characters (utf8::decode), not raw bytes
    # — `%E2%9C%93` is U+2713 CHECK MARK.
    is render('q=%E2%9C%93', 'q'), "\x{2713}", 'percent-encoded UTF-8 → decoded character';
};

subtest 'lenient parsing never dies' => sub {
    ok lives { BarefootJS::SearchParams->new(undef) }, 'undef query';
    ok lives { BarefootJS::SearchParams->new('&&&') }, 'only separators';
    is render('a=1;b=2', 'b'), '2', 'semicolon pair separator';
    is render('=novalue', 'sort'), 'none', 'empty key pair ignored for other keys';
};

# The lazy-loading factory on the BarefootJS object is how every consumer
# (Mojo plugin, Xslate host, render harness) reaches this class — assert it
# loads + builds a working reader without anyone `use`-ing SearchParams.
subtest 'BarefootJS->search_params lazy factory' => sub {
    my $sp = BarefootJS->search_params('sort=price');
    is ref($sp), 'BarefootJS::SearchParams', 'factory returns a reader instance';
    is $sp->get('sort'), 'price', 'factory-built reader resolves the query';
    is $sp->get('missing'), undef, 'factory-built reader: absent key → undef';
    is ref(BarefootJS->search_params), 'BarefootJS::SearchParams', 'default empty query';
};

done_testing;
