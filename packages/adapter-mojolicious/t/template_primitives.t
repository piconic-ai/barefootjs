use Test2::V0;

# JS-compat helper coverage (#1189). Mirrors the Go runtime test
# surface so cross-adapter regressions stay symmetric.

use FindBin qw($Bin);
use lib "$Bin/../lib";

use BarefootJS;

# `BarefootJS->new` requires a controller for the helper plumbing,
# but the JS-compat helpers are pure functions of `$self` + args —
# they don't reach into the controller. A bare hash blessed into
# the package is enough for these unit tests.
my $bf = bless { c => undef, config => {} }, 'BarefootJS';

subtest 'json — mirrors JS JSON.stringify (with documented undef divergence)' => sub {
    is $bf->json({a => 1}),  '{"a":1}', 'hash';
    is $bf->json([1, 2, 3]), '[1,2,3]', 'array';
    is $bf->json('hi'),      '"hi"',    'string';
    # Documented divergence from JS: JS `JSON.stringify(undefined)`
    # returns the JS value `undefined` (not a string), while
    # `JSON.stringify(null)` returns "null". Perl has no
    # null/undefined distinction so both map to undef here, and
    # we render "null" for SSR ergonomics. See `BarefootJS::json`.
    is $bf->json(undef),     'null',    'undef → "null" (matches JS null; diverges from JS undefined)';
};

subtest 'string — JS String(v) mirror' => sub {
    is $bf->string(42),    '42', 'int';
    is $bf->string('hi'),  'hi', 'string passthrough';
    # Documented divergence from JS String(null) === "null".
    is $bf->string(undef), '',   'undef → "" (intentional divergence)';
};

# Real numeric NaN is the only float for which `$x != $x` holds.
# Tests check for it directly rather than string-comparing against
# "NaN", which stringifies platform-dependently.
sub is_nan { my $n = shift; return $n != $n }

subtest 'number — JS Number(v) mirror; NaN on parse failure' => sub {
    is $bf->number('3.14'), 3.14, 'numeric string';
    is $bf->number(42),     42,   'integer passthrough';
    ok is_nan($bf->number('not a num')), 'non-numeric → NaN';
    ok is_nan($bf->number(undef)),       'undef → NaN';
};

subtest 'floor / ceil / round — Math.* mirrors; propagate NaN' => sub {
    is $bf->floor(3.7),    3, '3.7 → 3';
    is $bf->floor(-3.2),  -4, '-3.2 → -4';
    ok is_nan($bf->floor('not')), 'floor: NaN propagates';

    is $bf->ceil(3.1),     4, '3.1 → 4';
    is $bf->ceil(-3.7),   -3, '-3.7 → -3';
    ok is_nan($bf->ceil('not')), 'ceil: NaN propagates';

    is $bf->round(3.5),    4, '3.5 → 4';
    is $bf->round(3.4),    3, '3.4 → 3';
    # JS `Math.round` ties go toward +Infinity, NOT away from zero —
    # so -1.5 rounds to -1 (not -2). Pin both halves of the negative
    # tie-break so a future POSIX::floor swap doesn't silently
    # regress the JS-compat contract.
    is $bf->round(-1.5),  -1, '-1.5 → -1 (JS half-toward-+Inf, not half-away-from-zero)';
    is $bf->round(-1.6),  -2, '-1.6 → -2';
    ok is_nan($bf->round('not')), 'round: NaN propagates';
};

done_testing;
