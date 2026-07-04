use Test2::V0;
use utf8;

# BarefootJS::SearchParams — Perl-specific concerns of the searchParams()
# environment-signal reader (router v0.5, #1922).
#
# The cross-language VALUE semantics of `get` (absent → null/undef, present →
# first value, repeated keys, present-but-empty, `+`/`%XX`/encoded-separator
# decoding, first-`=` split) are owned by the language-independent golden
# vectors — `search_params_get` in packages/adapter-tests/vectors,
# asserted here via t/helper_vectors.t and in the Go runtime's vectors_test.go,
# so Go/Perl/JS parity is mechanical. This file covers only what those value
# vectors can't: the lazy-load factory seam, lenient parsing (never dies), the
# `//` composition, and UTF-8 decoding.

use FindBin qw($Bin);
use lib "$Bin/../lib";

use BarefootJS;

# The lazy factory on the BarefootJS object is how every consumer (Mojo plugin,
# Xslate host, render harness) reaches the reader — no one `use`s the class
# directly. Assert it loads + builds a working reader.
subtest 'BarefootJS->search_params lazy factory' => sub {
    my $sp = BarefootJS->search_params('sort=price');
    is ref($sp), 'BarefootJS::SearchParams', 'factory returns a reader instance';
    is $sp->get('sort'), 'price', 'factory-built reader resolves the query';
    is ref(BarefootJS->search_params), 'BarefootJS::SearchParams', 'default empty query';
};

# The adapters lower `searchParams().get(k) ?? d` to Perl's defined-or
# (`$searchParams->get(k) // d`), which coalesces only undef — so an absent key
# falls back to the default while a present-but-empty value keeps ''. This is
# the Perl-specific divergence from the Go `or` lowering (which coalesces '').
subtest '// composition (the ?? lowering) coalesces only undef' => sub {
    my $absent = BarefootJS->search_params('other=x');
    is(($absent->get('sort') // 'none'), 'none', 'absent key → author default');

    my $empty = BarefootJS->search_params('sort=');
    is(($empty->get('sort') // 'none'), '', 'present-but-empty value is kept, NOT defaulted');
};

# Percent-encoded UTF-8 decodes to characters via the core `utf8::decode`
# builtin (no URI / URI::Escape dependency) — kept here rather than in the
# ASCII-only shared vectors to avoid cross-harness byte/char encoding skew.
subtest 'UTF-8 percent-decoding (core utf8::decode, no URI dep)' => sub {
    my $sp = BarefootJS->search_params('q=%E2%9C%93');
    is $sp->get('q'), "\x{2713}", 'percent-encoded UTF-8 → decoded character (✓)';
};

# Malformed input must degrade, never die (SSR survives junk query strings).
subtest 'lenient parsing never dies' => sub {
    ok lives { BarefootJS->search_params(undef) }, 'undef query';
    ok lives { BarefootJS->search_params('&&&')->get('x') }, 'only separators';
    ok lives { BarefootJS->search_params('=novalue')->get('x') }, 'empty key pair';
};

done_testing;
