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

done_testing;
