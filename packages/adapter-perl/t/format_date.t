use strict;
use warnings;
use Test::More;
use FindBin;

use lib "$FindBin::Bin/../lib";
use BarefootJS;

# `format_date` tz error contract (#2344). Canonical IANA zone names resolve
# through tzdata (DateTime::TimeZone); an unresolvable $tz DIES — the
# loud-not-silent replacement for the pre-#2344 normalize-to-UTC total
# function. The resolvable grid is pinned by the golden vectors
# (helper_vectors.t); this file pins the error side, which is outside the
# vector domain (spec/template-helpers.md JS-throws rule).

my $bf   = bless { c => undef, config => {} }, 'BarefootJS';
my $recv = '2024-01-01T23:00:00.000Z';

# DateTime::TimeZone accepts a superset of the canonical IDs (bare offset
# strings like '+9:00'/'+25:00') — the JS reference throws there, so that
# region is unspecified by the spec and deliberately not asserted here.
for my $tz ('garbage', 'Asia/Tokyoo', 'asia/tokyo', 'Local', 'local', 'floating', '') {
    my $ok = eval { $bf->format_date($recv, 'YYYY-MM-DD', $tz); 1 };
    ok(!$ok, qq{tz "$tz" dies});
    like($@, qr/unresolvable timeZone/, qq{tz "$tz" dies with the contract message});
}

# The receiver contract precedes tz validation: an undef/unparseable
# receiver renders '' without inspecting tz, on every backend.
is($bf->format_date(undef, 'YYYY-MM-DD', 'garbage'), '', 'undef receiver renders "" before tz validation');
is($bf->format_date('not a date', 'YYYY-MM-DD', 'garbage'), '', 'unparseable receiver renders "" before tz validation');

# Named-zone happy path (redundant with the golden vectors, but keeps this
# file self-sufficient outside the monorepo checkout).
is($bf->format_date($recv, 'YYYY-MM-DD', 'Asia/Tokyo'), '2024-01-02', 'canonical IANA zone resolves');

done_testing;
