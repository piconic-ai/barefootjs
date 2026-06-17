use Test2::V0;

# BarefootJS::SearchParams — SSR reader behind the reactive searchParams()
# environment signal (router v0.5, #1922). Mirrors the Go runtime's
# bf.SearchParams test surface so cross-adapter regressions stay symmetric.

use FindBin qw($Bin);
use lib "$Bin/../lib";

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
    is BarefootJS::SearchParams->new('?sort')->get('sort'), '', 'bare key → ""';
};

subtest 'application/x-www-form-urlencoded decoding' => sub {
    is render('q=a%20b', 'q'), 'a b', 'percent-encoded space';
    is render('q=a+b', 'q'),   'a b', 'plus → space';
    is render('na%6de=x', 'name'), 'x', 'percent-encoded key';
};

subtest 'lenient parsing never dies' => sub {
    ok lives { BarefootJS::SearchParams->new(undef) }, 'undef query';
    ok lives { BarefootJS::SearchParams->new('&&&') }, 'only separators';
    is render('a=1;b=2', 'b'), '2', 'semicolon pair separator';
    is render('=novalue', 'sort'), 'none', 'empty key pair ignored for other keys';
};

done_testing;
