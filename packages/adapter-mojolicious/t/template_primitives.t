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

# `Array.prototype.includes(x)` + `String.prototype.includes(sub)` lower
# to the same `$bf->includes($recv, $elem)` shape — see #1448 Tier A.
# The Perl helper dispatches on `ref()`: ARRAY ref scans elements with
# `eq`; scalar falls back to `index(..., ...) != -1`. Anything else
# (HASH ref, code ref) returns false to match the JS semantic that
# `.includes` is only defined on Array / TypedArray / String.
subtest 'includes — array + string + non-array/string dispatch' => sub {
    # Array receiver: element-wise `eq` (handles defined/undef parity).
    ok  $bf->includes(['a', 'b', 'c'], 'b'), 'array contains element → 1';
    ok !$bf->includes(['a', 'b', 'c'], 'z'), 'array does not contain → 0';
    ok  $bf->includes([1, 2, 3], 2),         'numeric element';
    ok !$bf->includes([], 'a'),              'empty array → 0';
    ok  $bf->includes([undef, 'a'], undef),  'undef element matches undef needle';
    ok !$bf->includes(['a', 'b'], undef),    'undef needle, no undef element → 0';

    # String receiver: substring search.
    ok  $bf->includes('hello world', 'world'), 'substring present → 1';
    ok !$bf->includes('hello world', 'earth'), 'substring absent → 0';
    ok  $bf->includes('hello', ''),            'empty needle → 1 (JS-compat)';
    ok !$bf->includes('', 'x'),                'empty receiver, non-empty needle → 0';
    ok !$bf->includes(undef, 'x'),             'undef receiver → 0';

    # Anything else (HASH ref, code ref) → 0; pin so a future
    # refactor doesn't accidentally match HASH keys.
    ok !$bf->includes({a => 1}, 'a'),    'hash ref → 0 (.includes undefined on Object)';
    ok !$bf->includes(sub {}, 'x'),      'code ref → 0';
};

# `Array.prototype.indexOf(x)` / `Array.prototype.lastIndexOf(x)`
# value-equality search (#1448 Tier A). Non-array receivers return -1.
# Duplicated-value coverage is the disambiguator between indexOf
# (forward) and lastIndexOf (backward); pinning a non-final last-match
# position makes a misdirected walk impossible to hide.
subtest 'index_of / last_index_of — array value-equality search' => sub {
    my $arr = ['a', 'b', 'c', 'b', 'd'];

    is $bf->index_of($arr, 'a'),          0,  'first element';
    is $bf->index_of($arr, 'b'),          1,  'duplicated value: first match';
    is $bf->index_of($arr, 'd'),          4,  'last element';
    is $bf->index_of($arr, 'z'),         -1,  'absent → -1';
    is $bf->index_of([], 'a'),           -1,  'empty array → -1';
    is $bf->index_of('not an array', 'a'), -1, 'non-array → -1';

    is $bf->last_index_of($arr, 'b'),     3,  'duplicated value: LAST match (non-final position)';
    is $bf->last_index_of($arr, 'a'),     0,  'unique value still found';
    is $bf->last_index_of($arr, 'z'),    -1,  'absent → -1';
    is $bf->last_index_of([], 'a'),      -1,  'empty array → -1';

    # undef parity matches the `includes` helper above.
    is $bf->index_of([undef, 'x', undef], undef), 0, 'undef matches undef (forward)';
    is $bf->last_index_of([undef, 'x', undef], undef), 2, 'undef matches undef (backward)';
};

done_testing;
