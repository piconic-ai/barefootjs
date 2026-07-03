use Test2::V0;

# JS-compat helper coverage (#1189). Mirrors the Go runtime test
# surface so cross-adapter regressions stay symmetric.

use FindBin qw($Bin);
use lib "$Bin/../lib";

use BarefootJS;

# Pure-Perl backend (core JSON::PP only) so this engine-agnostic test runs
# with zero Mojo present — `BarefootJS` itself is Mojo-free; only the optional
# BarefootJS::Backend::Mojo (shipped by @barefootjs/mojolicious) pulls in Mojo.
{
    package PureBackend;
    use JSON::PP ();
    my $J = JSON::PP->new->canonical->allow_nonref;
    sub new         { bless {}, shift }
    sub encode_json { $J->encode($_[1]) }
    sub mark_raw    { $_[1] }
    sub materialize { ref($_[1]) eq 'CODE' ? $_[1]->() : $_[1] }
    sub render_named { '' }
}

# The JS-compat helpers are pure functions of `$self` + args; only `json`
# reaches the backend (for JSON encoding). A bare hash blessed into the
# package with an injected pure backend is enough for these unit tests.
my $bf = bless { c => undef, config => {}, backend => PureBackend->new }, 'BarefootJS';

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
# `BarefootJS::Evaluator::_same_value_zero` (SameValueZero — no cross-type
# coercion, NaN matches NaN), matching the evaluator's serialized-callback
# `.includes` path so both positions agree; scalar falls back to
# `index(..., ...) != -1`. Anything else (HASH ref, code ref) returns
# false to match the JS semantic that `.includes` is only defined on
# Array / TypedArray / String.
subtest 'includes — array + string + non-array/string dispatch' => sub {
    # Array receiver: SameValueZero element search (handles defined/undef
    # parity, and no numeric/string coercion — see the cross-type cases
    # below).
    ok  $bf->includes(['a', 'b', 'c'], 'b'), 'array contains element → 1';
    ok !$bf->includes(['a', 'b', 'c'], 'z'), 'array does not contain → 0';
    ok  $bf->includes([1, 2, 3], 2),         'numeric element';
    ok !$bf->includes([], 'a'),              'empty array → 0';
    ok  $bf->includes([undef, 'a'], undef),  'undef element matches undef needle';
    ok !$bf->includes(['a', 'b'], undef),    'undef needle, no undef element → 0';

    # SameValueZero never coerces across types — pins the divergence from
    # the old stringy `eq` scan (where `[2].includes("2")` was true).
    ok !$bf->includes([2], '2'),   '[2].includes("2") → 0 (no numeric→string coercion)';
    ok  $bf->includes([2], 2),     '[2].includes(2) → 1';
    ok  $bf->includes(['2'], '2'), '["2"].includes("2") → 1 (string vs string still matches)';

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

# `Array.prototype.at(i)` — supports negative indices; out-of-bounds
# returns undef. Non-array receivers return undef. Mirrors the Go
# `bf_at` arithmetic so adapter output stays symmetric.
subtest 'at — array indexed access with negative-index support' => sub {
    my $arr = ['a', 'b', 'c'];

    is $bf->at($arr,  0),  'a',  'first element';
    is $bf->at($arr,  2),  'c',  'last element via positive index';
    is $bf->at($arr, -1),  'c',  'last element via -1';
    is $bf->at($arr, -3),  'a',  'first element via -3 (length - 3)';

    is $bf->at($arr,  3),  undef, 'out of bounds (positive) → undef';
    is $bf->at($arr, -4),  undef, 'out of bounds (negative) → undef';
    is $bf->at([],    0),  undef, 'empty array → undef';
    is $bf->at(undef, 0),  undef, 'undef receiver → undef';
    is $bf->at('not array', 0), undef, 'scalar receiver → undef';
    is $bf->at({a => 1},   0),  undef, 'hash ref receiver → undef';
};

# `Array.prototype.concat(other)` — merges two arrays in order
# into a new ARRAY ref (#1448 Tier A). Non-array operands collapse
# to empty (matches the Go `bf_concat` semantic); the result must
# compose with `.join(...)` etc., hence the ARRAY ref return type.
subtest 'concat — merges two arrays into a new array ref' => sub {
    is $bf->concat(['a','b'], ['c','d']),    ['a','b','c','d'],     'two non-empty arrays';
    is $bf->concat([],         ['a']),       ['a'],                 'empty + non-empty';
    is $bf->concat(['a'],      []),          ['a'],                 'non-empty + empty';
    is $bf->concat([],         []),          [],                    'empty + empty';

    is $bf->concat(undef,      ['a']),       ['a'],                 'undef left → treats as empty';
    is $bf->concat(['a'],      undef),       ['a'],                 'undef right → treats as empty';
    is $bf->concat('not an array', ['a']),   ['a'],                 'scalar left → treats as empty';
    is $bf->concat({a=>1},     ['a']),       ['a'],                 'hash ref left → treats as empty';

    # Mutation isolation: caller's source arrays must not be modified.
    my $left  = ['a', 'b'];
    my $right = ['c', 'd'];
    my $out   = $bf->concat($left, $right);
    push @$out, 'mutated';
    is $left,  ['a', 'b'], 'left source unchanged after mutating result';
    is $right, ['c', 'd'], 'right source unchanged after mutating result';
};

# `Array.prototype.slice(start, end?)` — carves out a sub-range
# into a new ARRAY ref (#1448 Tier A). Mirrors the Go `bf_slice`
# JS-compat semantics: negative-index normalisation, out-of-bounds
# clamping, `start >= end` returns empty, undef `end` means "to
# length". Non-array receivers return an empty ARRAY ref.
subtest 'slice — array sub-range with negative-index + clamping' => sub {
    my $arr = ['a', 'b', 'c', 'd', 'e'];

    # 2-arg form.
    is $bf->slice($arr, 1, 3),     ['b', 'c'],             'start+end carves middle';

    # 1-arg form (undef end = "to length").
    is $bf->slice($arr, 2, undef), ['c', 'd', 'e'],        'undef end → to length';
    is $bf->slice($arr, 0, undef), ['a', 'b', 'c', 'd', 'e'], 'start 0, undef end → full copy';

    # Negative-index normalisation.
    is $bf->slice($arr, -2, undef),['d', 'e'],             '-2 start → last two';
    is $bf->slice($arr,  0, -1),   ['a', 'b', 'c', 'd'],   '-1 end → drop last';
    is $bf->slice($arr, -3, -1),   ['c', 'd'],             'both negative';

    # Clamping (out of bounds + start >= end).
    is $bf->slice($arr, 100, undef), [],                   'start past end → empty';
    is $bf->slice($arr,   3,   1),   [],                   'start > end → empty';
    is $bf->slice($arr,   0,   0),   [],                   'start == end → empty';

    # Edge cases.
    is $bf->slice([],     0, undef), [],                   'empty array → empty';
    is $bf->slice(undef,  0, undef), [],                   'undef receiver → empty';
    is $bf->slice('scalar', 0, undef), [],                 'scalar receiver → empty';

    # Mutation isolation.
    my $src = ['a', 'b', 'c'];
    my $out = $bf->slice($src, 0, 2);
    push @$out, 'mutated';
    is $src, ['a', 'b', 'c'], 'source unchanged after mutating slice result';
};

# `Array.prototype.reverse()` / `Array.prototype.toReversed()` —
# both shapes share the lowering (#1448 Tier A). SSR templates
# render a snapshot, so JS's mutate-vs-new distinction has no
# template-level meaning. Always returns a new ARRAY ref.
subtest 'reverse — new array ref in reverse order' => sub {
    is $bf->reverse(['a', 'b', 'c']), ['c', 'b', 'a'], 'three elements';
    is $bf->reverse([1, 2, 3, 4]),    [4, 3, 2, 1],    'integers';
    is $bf->reverse([]),              [],              'empty array';
    is $bf->reverse(['only']),        ['only'],        'single element';

    # Mutation isolation: input must survive.
    my $src = ['a', 'b', 'c'];
    my $out = $bf->reverse($src);
    push @$out, 'mutated';
    is $src, ['a', 'b', 'c'], 'source unchanged after mutating reverse result';

    # Non-array receivers.
    is $bf->reverse(undef),         [], 'undef receiver → empty';
    is $bf->reverse('not an array'),[], 'scalar receiver → empty';
    is $bf->reverse({a => 1}),      [], 'hash ref receiver → empty';
};

# `String.prototype.trim()` — strip leading + trailing whitespace
# (#1448 Tier A). Padding both sides of the test input so a
# trim-front-only or trim-back-only regression fails here.
subtest 'trim — strip leading + trailing whitespace' => sub {
    is $bf->trim('   padded   '),      'padded',         'leading + trailing spaces';
    is $bf->trim("\t\nleading"),       'leading',        'leading tab + newline';
    is $bf->trim('trailing  '),        'trailing',       'trailing spaces only';
    is $bf->trim('no-pad'),            'no-pad',         'no whitespace passthrough';
    is $bf->trim('   '),               '',               'all whitespace → empty';
    is $bf->trim(''),                  '',               'empty input → empty';

    # Inner whitespace is preserved — only the boundaries are stripped.
    is $bf->trim('  hello  world  '),  'hello  world',   'inner spaces preserved';

    # Non-string receivers.
    is $bf->trim(undef),               '',               'undef receiver → empty';
    is $bf->trim({a => 1}),            '',               'hash ref receiver → empty';
    is $bf->trim(['arr']),             '',               'array ref receiver → empty';

    # Numeric coercion: JS would stringify `42.trim()` first.
    is $bf->trim(42),                  '42',             'numeric receiver stringifies';
};

# `String.prototype.split(sep)` — string → ARRAY ref (#1448 Tier B).
# Mirrors the Go `bf_split`: literal (quotemeta'd) separator, trailing
# empties preserved (the `-1` limit), empty-separator char split.
subtest 'split — string into array of substrings' => sub {
    is $bf->split('a,b,c', ','),   ['a', 'b', 'c'],   'comma separator';
    is $bf->split('a-b-c', '-'),   ['a', 'b', 'c'],   'dash separator';

    # Separator is matched literally, not as a regex — '.' and '|'
    # would otherwise match every position / alternate emptily.
    is $bf->split('a.b.c', '.'),   ['a', 'b', 'c'],   'dot is literal, not regex any-char';
    is $bf->split('a|b',   '|'),   ['a', 'b'],        'pipe is literal, not regex alternation';

    # Trailing empty fields survive (JS keeps them; Perl's bare split
    # drops them — the -1 limit is what preserves parity).
    is $bf->split('a,',    ','),   ['a', ''],         'trailing empty field preserved';
    is $bf->split('a,,b',  ','),   ['a', '', 'b'],    'inner empty field preserved';
    is $bf->split(',a',    ','),   ['', 'a'],         'leading empty field preserved';

    # Empty separator → individual characters.
    is $bf->split('abc',   ''),    ['a', 'b', 'c'],   'empty separator splits into chars';
    is $bf->split('',      ''),    [],                'empty string, empty separator → empty';

    # No match → single-element array (the whole string).
    is $bf->split('abc',   ','),   ['abc'],           'no separator match → whole string';

    # No separator at all → the whole string (JS `"x".split()`).
    is $bf->split('a,b,c'),        ['a,b,c'],         'no separator → whole string';

    # Optional limit caps the pieces (JS `split(sep, limit)`); 0 → empty,
    # negative / >= length → all (matches Go bf_split).
    is $bf->split('a,b,c,d', ',', 2), ['a', 'b'],     'limit caps pieces';
    is $bf->split('a,b',     ',', 0), [],             'limit 0 → empty';
    is $bf->split('a,b',     ',', 9), ['a', 'b'],     'limit >= length → all';
    is $bf->split('a,b',     ',', -1),['a', 'b'],     'negative limit → all';

    # Undef / non-string receivers render as the empty-string element.
    is $bf->split(undef,   ','),   [''],              'undef receiver renders single empty-string element';
    is $bf->split(42,      ','),   ['42'],            'numeric receiver stringifies';
};

# `String.prototype.startsWith` / `endsWith` — string → boolean (1/0)
# (#1448 Tier B). Literal substr-anchored comparison; mirrors Go's
# strings.HasPrefix / HasSuffix.
subtest 'starts_with / ends_with — boolean prefix/suffix tests' => sub {
    ok  $bf->starts_with('hello world', 'hello'),  'prefix matches';
    ok !$bf->starts_with('hello world', 'world'),  'prefix mismatch';
    ok  $bf->starts_with('anything', ''),          'empty prefix is always true';
    ok !$bf->starts_with('hi', 'longer-than-str'), 'prefix longer than string → false';

    ok  $bf->ends_with('hello world', 'world'),    'suffix matches';
    ok !$bf->ends_with('hello world', 'hello'),    'suffix mismatch';
    ok  $bf->ends_with('anything', ''),            'empty suffix is always true';
    ok !$bf->ends_with('hi', 'longer-than-str'),   'suffix longer than string → false';

    # Separator/search string is matched literally, not as a regex.
    ok  $bf->starts_with('a.b.c', 'a.'),           'dot in prefix is literal';
    ok  $bf->ends_with('a.b.c', '.c'),             'dot in suffix is literal';

    # Undef / non-string receivers coerce to empty string.
    ok !$bf->starts_with(undef, 'x'),              'undef receiver, non-empty prefix → false';
    ok  $bf->starts_with(undef, ''),               'undef receiver, empty prefix → true';
    is  $bf->starts_with('hello', 'he'), 1,        'returns 1, not just truthy';
    is  $bf->ends_with('hello', 'xx'),   0,        'returns 0, not just falsey';

    # Optional position / endPosition (JS `startsWith(p, pos)` /
    # `endsWith(s, endPos)`), with clamping to [0, length].
    ok  $bf->starts_with('abc', 'b', 1),           'starts_with at position';
    ok !$bf->starts_with('abc', 'a', 1),           'starts_with: wrong char at position → false';
    ok !$bf->starts_with('abc', 'a', 99),          'starts_with: position past end → false (clamped)';
    ok  $bf->starts_with('abc', 'a', -5),          'starts_with: negative position → from 0 (clamped)';
    ok  $bf->ends_with('abc', 'b', 2),             'ends_with at endPosition';
    ok !$bf->ends_with('abc', 'c', 2),             'ends_with: char beyond endPosition → false';
    ok  $bf->ends_with('abc', 'c', 99),            'ends_with: endPosition past end → true (clamped)';
    ok !$bf->ends_with('abc', 'a', -1),            'ends_with: negative endPosition → empty (clamped)';
};

# `String.prototype.replace(pattern, replacement)` — string-pattern
# form, first occurrence only (#1448 Tier B). Literal splice (no s///),
# so both pattern and replacement are literal — mirrors Go's
# strings.Replace with n=1.
subtest 'replace — first-occurrence string-pattern swap' => sub {
    is $bf->replace('hello world', 'o', '0'), 'hell0 world', 'first occurrence only';
    is $bf->replace('aaa', 'a', 'b'),          'baa',         'leftmost of repeats';
    is $bf->replace('abc', 'z', 'Z'),          'abc',         'no match → unchanged';
    is $bf->replace('abc', 'b', ''),           'ac',          'empty replacement deletes';
    is $bf->replace('abc', '', 'X'),           'Xabc',        'empty pattern inserts at front';

    # Pattern is literal, not a regex — '.' matches a literal dot only.
    is $bf->replace('a.b.c', '.', '-'),        'a-b.c',       'dot in pattern is literal';

    # Replacement is literal — no $1 / $& interpolation.
    is $bf->replace('ab', 'a', '$&'),          '$&b',         'replacement $& is literal';
    is $bf->replace('ab', 'a', '$1'),          '$1b',         'replacement $1 is literal';

    # Undef / non-string receivers coerce to empty string.
    is $bf->replace(undef, 'a', 'b'),          '',            'undef receiver → empty';
};

# `String.prototype.repeat(n)` — receiver concatenated n times
# (#1448 Tier B). Perl `x` operator; negative count clamps to "" (JS
# throws but SSR degrades), count truncated toward zero.
subtest 'repeat — string concatenated n times' => sub {
    is $bf->repeat('ab', 3),  'ababab', 'three times';
    is $bf->repeat('x',  1),  'x',      'once → unchanged';
    is $bf->repeat('ab', 0),  '',       'zero → empty';
    is $bf->repeat('ab', -2), '',       'negative → empty (JS throws; SSR degrades)';
    is $bf->repeat('ab', 2.9),'abab',   'fractional count truncates toward zero';
    is $bf->repeat('',   5),  '',       'empty receiver → empty';
    is $bf->repeat(undef, 3), '',       'undef receiver → empty';
};

# `String.prototype.padStart` / `padEnd` (#1448 Tier B) — pad to a
# target width with a repeat-and-truncate fill (default pad = space).
# Mirrors Go's rune-based `bf_pad_*`.
subtest 'pad_start / pad_end — pad to target width' => sub {
    is $bf->pad_start('42', 5, '0'), '00042', 'left-pad with 0';
    is $bf->pad_end('42', 5, '.'),   '42...', 'right-pad with .';

    # Default pad is a single space when omitted.
    is $bf->pad_start('42', 5),      '   42', 'default pad = space (start)';
    is $bf->pad_end('42', 5),        '42   ', 'default pad = space (end)';

    # Multi-char pad repeated then truncated to fill.
    is $bf->pad_start('x', 5, 'ab'), 'ababx', 'multi-char pad truncated (start)';
    is $bf->pad_end('x', 5, 'ab'),   'xabab', 'multi-char pad truncated (end)';

    # Already >= target, or empty pad → unchanged.
    is $bf->pad_start('hello', 3, '0'), 'hello', 'already >= target → unchanged';
    is $bf->pad_start('42', 5, ''),     '42',    'empty pad → unchanged';

    # Target truncates toward zero; undef receiver coerces to empty.
    is $bf->pad_start('7', 4.9, '0'),   '0007',  'fractional target truncates';
    is $bf->pad_start(undef, 3, '0'),   '000',   'undef receiver pads from empty';
};

# `Array.prototype.sort(cmp)` / `Array.prototype.toSorted(cmp)`
# lowering (#1448 Tier B). The opts hash-ref carries a `keys` list of
# the structured comparison keys the compiler extracted at parse time
# — adapter-side emit is a single call shape; the runtime walks the
# keys in priority order, branching on key_kind / compare_type /
# direction per key.
subtest 'sort — structured comparator dispatch' => sub {
    my $items = [
        { name => 'c', price => 30 },
        { name => 'a', price => 10 },
        { name => 'b', price => 20 },
    ];

    # Numeric field, ascending — the canonical struct-field case.
    is $bf->sort($items, { keys => [{ key_kind => 'field', key => 'price', compare_type => 'numeric', direction => 'asc' }] }),
        [ { name => 'a', price => 10 }, { name => 'b', price => 20 }, { name => 'c', price => 30 } ],
        'numeric field asc';

    # Numeric field, descending — reverse direction.
    is $bf->sort($items, { keys => [{ key_kind => 'field', key => 'price', compare_type => 'numeric', direction => 'desc' }] }),
        [ { name => 'c', price => 30 }, { name => 'b', price => 20 }, { name => 'a', price => 10 } ],
        'numeric field desc';

    # Primitive numeric — `(a, b) => a - b` shape (key_kind=self).
    is $bf->sort([3, 1, 2], { keys => [{ key_kind => 'self', compare_type => 'numeric', direction => 'asc' }] }),
        [1, 2, 3],
        'numeric self asc';

    # Primitive string — `(a, b) => a.localeCompare(b)`. The Perl
    # helper falls back to plain `cmp` (byte-ordering); within the
    # same case it matches lexicographic order.
    is $bf->sort(['charlie', 'alice', 'bob'], { keys => [{ key_kind => 'self', compare_type => 'string', direction => 'asc' }] }),
        ['alice', 'bob', 'charlie'],
        'string self asc';

    is $bf->sort(['charlie', 'alice', 'bob'], { keys => [{ key_kind => 'self', compare_type => 'string', direction => 'desc' }] }),
        ['charlie', 'bob', 'alice'],
        'string self desc';

    # Stable sort: equal keys preserve relative order. Perl `sort`
    # has been stable since 5.8; pinning the guarantee so a future
    # `use sort` pragma swap surfaces here.
    my $stable_input = [
        { name => 'first',  price => 10 },
        { name => 'second', price => 10 },
        { name => 'third',  price => 10 },
    ];
    is $bf->sort($stable_input, { keys => [{ key_kind => 'field', key => 'price', compare_type => 'numeric', direction => 'asc' }] }),
        $stable_input,
        'stable sort preserves equal-key order';

    # Mutation isolation: caller's source array must survive.
    my $src = [{ price => 3 }, { price => 1 }, { price => 2 }];
    my $out = $bf->sort($src, { keys => [{ key_kind => 'field', key => 'price', compare_type => 'numeric', direction => 'asc' }] });
    push @$out, { price => 99 };
    is $src, [{ price => 3 }, { price => 1 }, { price => 2 }],
        'source unchanged after mutating sort result';

    # Non-array receivers fall back to empty.
    is $bf->sort(undef, { keys => [{ key_kind => 'self', compare_type => 'numeric', direction => 'asc' }] }), [], 'undef receiver → []';
    is $bf->sort('not an array', { keys => [{ key_kind => 'self', compare_type => 'numeric', direction => 'asc' }] }), [], 'scalar receiver → []';
    is $bf->sort({a => 1}, { keys => [{ key_kind => 'self', compare_type => 'numeric', direction => 'asc' }] }), [], 'hash ref receiver → []';

    # Empty array short-circuits.
    is $bf->sort([], { keys => [{ key_kind => 'field', key => 'price', compare_type => 'numeric', direction => 'asc' }] }), [], 'empty array → []';
};

# Multi-key (`||`-chained) comparator: a tie on the primary key falls
# through to the next key. (#1448 Tier B follow-up.)
subtest 'sort — multi-key (||-chain) tie-breaks' => sub {
    # `(a,b) => a.p - b.p || a.name.localeCompare(b.name)`.
    my $items = [
        { p => 1, name => 'b' },
        { p => 1, name => 'a' },
        { p => 0, name => 'c' },
    ];
    is $bf->sort($items, { keys => [
            { key_kind => 'field', key => 'p',    compare_type => 'numeric', direction => 'asc' },
            { key_kind => 'field', key => 'name', compare_type => 'string',  direction => 'asc' },
        ] }),
        [ { p => 0, name => 'c' }, { p => 1, name => 'a' }, { p => 1, name => 'b' } ],
        'tie on primary key broken by secondary asc';

    # Descending secondary key: all primaries tie, so price desc orders.
    my $items2 = [
        { name => 'a', price => 10 },
        { name => 'a', price => 30 },
        { name => 'a', price => 20 },
    ];
    is $bf->sort($items2, { keys => [
            { key_kind => 'field', key => 'name',  compare_type => 'string',  direction => 'asc' },
            { key_kind => 'field', key => 'price', compare_type => 'numeric', direction => 'desc' },
        ] }),
        [ { name => 'a', price => 30 }, { name => 'a', price => 20 }, { name => 'a', price => 10 } ],
        'all primary tie → secondary price desc';
};

# `compare_type => 'auto'` (relational-ternary lowering): numeric when
# both keys look like numbers, else lexical. Mirrors Go's `bf_sort`.
subtest 'sort — auto compare (relational ternary)' => sub {
    is $bf->sort([3, 1, 2], { keys => [{ key_kind => 'self', compare_type => 'auto', direction => 'asc' }] }),
        [1, 2, 3],
        'auto numeric asc';

    is $bf->sort(['charlie', 'alice', 'bob'], { keys => [{ key_kind => 'self', compare_type => 'auto', direction => 'asc' }] }),
        ['alice', 'bob', 'charlie'],
        'auto non-numeric strings → lexical';

    # Numeric strings parse as numbers under auto (Go/Perl parity):
    # "10" sorts after "9", not lexically before it.
    is $bf->sort(['10', '9', '100'], { keys => [{ key_kind => 'self', compare_type => 'auto', direction => 'asc' }] }),
        ['9', '10', '100'],
        'auto numeric strings compare numerically';
};

done_testing;
