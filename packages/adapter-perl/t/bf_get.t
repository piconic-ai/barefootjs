use Test2::V0;

# bf->get — runtime-polymorphic dynamic-key element access (#2491):
# `arr[index]` / `hash[key]` lowered from `emitIndexAccessPerl`
# (adapter-mojolicious/src/adapter/expr/operand.ts). Regression for the
# fatal "Not an ARRAY reference" a dynamic-key row access (`tone[k]`)
# used to raise when the compile-time string/array guess picked the
# array-deref branch against a hash-shaped row. `get` dispatches on the
# receiver's runtime `ref` instead of guessing.

use FindBin qw($Bin);
use lib "$Bin/../lib";

use BarefootJS;
use BarefootJS::Evaluator ();

# Minimal pure-Perl backend: `get` is a pure function of $self + args, no
# backend calls reached.
{
    package PureBackend;
    sub new      { bless {}, shift }
    sub mark_raw { $_[1] }
}

my $bf = bless { c => undef, config => {}, backend => PureBackend->new }, 'BarefootJS';

subtest 'hash receiver — string key' => sub {
    my $row = { id => 1, a => 'row1-a', b => 'row1-b' };
    is $bf->get($row, 'a'),  'row1-a', 'string key resolves';
    is $bf->get($row, 'id'), 1,        'string key resolves (numeric value)';
    is $bf->get($row, 'missing'), undef, 'missing key -> undef';
};

subtest 'array receiver — numeric index' => sub {
    my $arr = ['row0', 'row1', 'row2'];
    is $bf->get($arr, 1),   'row1', 'integer index resolves';
    is $bf->get($arr, '2'), 'row2', 'numeric-string index resolves';
    is $bf->get($arr, 5),   undef,  'out-of-range index -> undef';
    is $bf->get($arr, -1),  undef,  'negative index -> undef (JS semantics, not Perl wraparound)';
};

subtest 'edge cases' => sub {
    is $bf->get(undef, 'a'),        undef, 'nil collection -> undef';
    is $bf->get({ a => 1 }, undef), undef, 'nil key -> undef';
    is $bf->get('not a ref', 'a'),  undef, 'scalar receiver -> undef';
    my $arr = ['x'];
    is $bf->get($arr, 'not-numeric'), undef, 'non-numeric key against array -> undef';
};

# A string receiver reads one UTF-16 code unit whether or not the scalar
# carries Perl's UTF8 flag: unflagged UTF-8 bytes are decoded first, so they
# are not indexed byte by byte. One half of a surrogate pair reads U+FFFD.
# Both entry points share `_read_index`: the template helper `get` and a
# callback's `obj[key]` in the evaluator.
subtest 'string receiver — flagged and unflagged UTF-8' => sub {
    my $callback = sub {
        my ($s, $i) = @_;
        BarefootJS::Evaluator::evaluate(
            { kind => 'index-access', object => { kind => 'identifier', name => 's' },
              index => { kind => 'literal', value => $i, literalType => 'number' } },
            { s => $s },
        );
    };
    my $unit = sub { my ($r) = @_; defined $r ? sprintf('U+%04X', ord $r) : 'undef' };
    my %cases = (
        'BMP character'            => ["\xc3\xa9x", ['U+00E9', 'U+0078', 'undef']],
        'astral character + ASCII' => ["\xf0\x9f\x98\x80x", ['U+FFFD', 'U+FFFD', 'U+0078', 'undef']],
    );
    for my $name (sort keys %cases) {
        my ($bytes, $want) = @{ $cases{$name} };
        my $chars = $bytes;
        utf8::decode($chars);
        ok !utf8::is_utf8($bytes), "$name: sanity, the byte string is unflagged";
        ok utf8::is_utf8($chars),  "$name: sanity, the decoded string is flagged";
        for my $s ([bytes => $bytes], [chars => $chars]) {
            my ($repr, $str) = @$s;
            is [map { $unit->($bf->get($str, $_)) } 0 .. $#$want], $want, "$name ($repr): get";
            is [map { $unit->($callback->($str, $_)) } 0 .. $#$want], $want, "$name ($repr): callback";
        }
    }
};

done_testing;
