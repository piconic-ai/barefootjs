use strict;
use warnings;
use utf8;
use Test2::V0;

# JS `undefined` on the Perl runtime (spec/js-undefined-value.md, rollout step
# U5): `$BarefootJS::UNDEF` apart from Perl's `undef`, which is JS `null`.
# Mirrors the Python (`test_undefined.py`), Rust (`tests/undefined.rs`) and
# Ruby (`test/undefined_test.rb`) suites.

use FindBin qw($Bin);
use lib "$Bin/../lib";

use BarefootJS;
use BarefootJS::Evaluator ();

{
    package PureBackend;
    use JSON::PP ();
    my $J = JSON::PP->new->canonical->allow_nonref;
    sub new          { bless {}, shift }
    sub encode_json  { $J->encode($_[1]) }
    sub mark_raw     { $_[1] }
    sub materialize  { ref($_[1]) eq 'CODE' ? $_[1]->() : $_[1] }
    sub render_named { '' }
}

my $bf = bless { c => undef, config => {}, backend => PureBackend->new }, 'BarefootJS';
my $U  = $BarefootJS::UNDEF;
my $is_u    = sub { BarefootJS::Undefined::is_undefined($_[0]) };
my $is_null = sub { BarefootJS::Undefined::is_null($_[0]) };
my $nan     = sub { my $n = shift; defined $n && !ref $n && $n != $n };

subtest 'one singleton' => sub {
    ok $is_u->($U), 'UNDEF is undefined';
    ok $is_u->($bf->undefined), 'bf->undefined is UNDEF';
    ok $is_u->(BarefootJS::Undefined->new), 'the constructor returns the singleton';
    is ref($U), 'BarefootJS::Undefined', 'its class is its identity';
};

subtest 'predicates' => sub {
    ok BarefootJS::Undefined::is_undefined($U), 'is_undefined(UNDEF)';
    ok !BarefootJS::Undefined::is_undefined(undef), '!is_undefined(undef)';
    ok BarefootJS::Undefined::is_null(undef), 'is_null(undef)';
    ok !BarefootJS::Undefined::is_null($U), '!is_null(UNDEF)';
    ok BarefootJS::Undefined::is_nullish($_), 'is_nullish' for (undef, $U);
    ok !BarefootJS::Undefined::is_nullish($_), "!is_nullish('$_')" for (0, '', 'x');
    ok $bf->is_undefined($U) && $bf->is_null(undef) && $bf->is_nullish($U) && $bf->is_nullish(undef),
        'the template helpers';
    ok !$bf->is_null($U) && !$bf->is_undefined(undef) && !$bf->is_nullish(0), 'and their negatives';
};

subtest "Perl's own view of the value" => sub {
    ok !$U, 'false in boolean context';
    ok defined $U, 'but defined: `defined` and `//` must not test it';
    is(($U // 'd'), $U, '`//` keeps it');
    is "[$U]", '[]', 'prints as the empty string';
    ok $nan->($U + 0), 'numifies to NaN';
    is scalar(@{$U}), 0, 'an array dereference reads nothing';
    ok !defined $U->{k}, 'a hash dereference reads nothing';
    ok $is_u->($U->size), 'a method call (Kolon member syntax) reads undefined';
};

subtest 'a template prints undefined as empty' => sub {
    is $bf->string($U), '', 'display string';
    is $bf->string(undef), '', 'display string of null';
    ok $nan->($bf->number($U)), 'display number';
    ok $is_u->($bf->json($U)), 'json of a top-level undefined is undefined (no string)';
};

subtest 'keep_nonnil coalesces both nils' => sub {
    ok !defined $bf->keep_nonnil($U), 'undefined is absent';
    ok !defined $bf->keep_nonnil(undef), 'null is absent';
    is $bf->keep_nonnil(0), [0], '0 is present';
    is $bf->keep_nonnil(''), [''], "'' is present";
};

subtest 'json follows JSON.stringify' => sub {
    is $bf->json({ a => undef, b => $U }), '{"a":null}', 'an undefined member is dropped';
    is $bf->json([$U, undef, 1]), '[null,null,1]', 'an undefined element is null';
    is $bf->json({ o => { b => $U } }), '{"o":{}}', 'at any depth';
};

subtest 'bf-p and the scope comment drop an undefined prop' => sub {
    my $c = bless { c => undef, config => {}, backend => PureBackend->new }, 'BarefootJS';
    $c->_props({ a => undef, b => $U, c => [$U] });
    is $c->props_attr, q{ bf-p='{&#34;a&#34;:null,&#34;c&#34;:[null]}'}, 'bf-p';
    $c->_scope_id('s');
    is $c->scope_comment, '<!--bf-scope:s|{"a":null,"c":[null]}-->', 'scope comment';
};

subtest 'coercions tell the nils apart' => sub {
    is $bf->to_string($U), 'undefined', 'ToString(undefined)';
    is $bf->to_string(undef), 'null', 'ToString(null)';
    is $bf->plus($U, 'x'), 'undefinedx', 'undefined + "x"';
    ok $nan->($bf->plus($U, 1)), 'undefined + 1';
    ok $nan->($bf->to_number($U)), 'ToNumber(undefined)';
    is $bf->to_number(undef), 0, 'ToNumber(null)';
    is $bf->subtract(undef, 1), -1, 'null - 1';
    ok $nan->($bf->multiply($U, 2)), 'undefined * 2';
    ok $nan->($bf->subtract('abc', 1)), '"abc" - 1 is NaN (JS ToNumber)';
    ok $nan->($bf->mod($U, 2)), 'undefined % 2';
    ok $bf->strict_eq($U, $U), 'undefined === undefined';
    ok !$bf->strict_eq($U, undef), 'undefined !== null';
    ok !$bf->lt($U, 1), 'undefined < 1 is false';
    ok $bf->le(undef, 0), 'null <= 0 is true';
    ok $nan->($bf->floor($U)), 'Math.floor(undefined)';
    is $bf->floor(undef), 0, 'Math.floor(null)';
    ok !$bf->truthy($U), 'ToBoolean(undefined)';
};

subtest 'reads that miss are undefined' => sub {
    ok $is_u->($bf->get({ a => 1 }, 'b')), 'get: missing key';
    ok $is_u->($bf->get([1], 5)), 'get: out of range';
    ok $is_u->($bf->get(undef, 'a')), 'get: nullish receiver';
    ok $is_null->($bf->get({ a => undef }, 'a')), 'get: a present null stays null';
    ok $is_u->($bf->at([1], 5)), 'at: out of range';
    ok $is_u->($bf->at('a', 5)), 'at: string out of range';
    ok $is_u->($bf->find([1], sub { 0 })), 'find: no match';
    ok $is_u->($bf->find_last([1], sub { 0 })), 'find_last: no match';
    ok $is_u->($bf->length({})), 'length of an object without one';
    ok $is_u->($bf->flat_map([{}], 'field', 'a')->[0]), 'flat_map: missing field';
};

subtest 'get_opt is optional chaining' => sub {
    ok $is_u->($bf->get_opt(undef, 'a')), 'over null';
    ok $is_u->($bf->get_opt($U, 'a')), 'over undefined';
    ok $is_u->($bf->get_opt({}, 'a')), 'a missing key';
    ok $is_null->($bf->get_opt({ a => undef }, 'a')), 'a present null';
    is $bf->get_opt({ a => 1 }, 'a'), 1, 'a value';
};

subtest 'array search uses strict equality' => sub {
    ok $bf->includes([$U], $U), '[undefined].includes(undefined)';
    ok !$bf->includes([$U], undef), '[undefined].includes(null)';
    is $bf->index_of([undef, $U], $U), 1, 'indexOf(undefined)';
    is $bf->index_of([$U, undef], undef), 1, 'indexOf(null)';
    ok $bf->includes('aundefinedb', $U), 'a string needle is ToString-ed';
    ok $bf->includes('anullb', undef), 'null too';
};

subtest 'join prints both nils empty' => sub {
    is $bf->join([undef, $U, 1]), ',,1', 'elements';
    is $bf->join([1, 2], $U), '1,2', 'an undefined separator is the default';
    is $bf->join([1, 2], undef), '1null2', 'a null one is ToString-ed';
};

subtest 'sort puts undefined last without the comparator' => sub {
    my $keys = { keys => [{ key_kind => 'self', compare_type => 'numeric', direction => 'asc' }] };
    my $got = $bf->sort([3, $U, 1, undef, 2], $keys);
    is [@$got[0 .. 3]], [undef, 1, 2, 3], 'structured: null sorts as 0';
    ok $is_u->($got->[4]), 'structured: undefined last';
    my $cmp = '{"kind":"binary","op":"-","left":{"kind":"identifier","name":"a"},"right":{"kind":"identifier","name":"b"}}';
    $got = $bf->sort_eval([3, $U, 1, undef, 2], $cmp, 'a', 'b');
    is [@$got[0 .. 3]], [undef, 1, 2, 3], 'evaluator: null sorts as 0';
    ok $is_u->($got->[4]), 'evaluator: undefined last';
};

subtest 'optional argument defaults apply to undefined only' => sub {
    is $bf->slice([1, 2, 3], 1), [2, 3], 'slice: omitted end';
    is $bf->slice([1, 2, 3], 1, $U), [2, 3], 'slice: undefined end';
    is $bf->slice([1, 2, 3], 1, undef), [], 'slice: null end is 0';
    is $bf->pad_start('abc', 5, $U), '  abc', 'padStart: undefined pad';
    is $bf->pad_start('abc', 5, undef), 'nuabc', 'padStart: null pad';
    is $bf->split('a,b', $U), ['a,b'], 'split: undefined separator';
    is $bf->split('anullb', undef), ['a', 'b'], 'split: null separator';
    is $bf->split('a,b', ',', undef), [], 'split: null limit is 0';
    is $bf->split('a,b', ',', $U), ['a', 'b'], 'split: undefined limit';
    ok $bf->ends_with('abc', 'c', $U), 'endsWith: undefined endPosition';
    ok $bf->ends_with('abc', '', undef), 'endsWith: null endPosition is 0';
    is $bf->at([7, 8], $U), 7, 'at: undefined index is 0';
    is $bf->at([7, 8], undef), 7, 'at: null index is 0';
    is $bf->at([7, 8]), 7, 'at: omitted index is 0';
    is $bf->to_fixed(1.25, $U), '1', 'toFixed: undefined digits';
    is $bf->flat_dynamic([[1, 2]], $U), [1, 2], 'flat: undefined depth is 1';
    is $bf->flat_dynamic([[1, 2]], undef), [[1, 2]], 'flat: null depth is 0';
    is $bf->repeat('ab', $U), '', 'repeat: undefined count is 0';
};

subtest 'searchParams get of an absent key stays null' => sub {
    ok $is_null->($bf->search_params('a=1')->get('b')), 'null, not undefined';
};

subtest 'the seed (decision 6)' => sub {
    my $defaults = { a => { propName => 'a', value => 'D' }, b => { propName => 'b' } };
    my $seed = sub { my %s = BarefootJS::_derive_stash_from_defaults($defaults, $_[0]); \%s };
    is $seed->({})->{a}, 'D', 'absent takes the default';
    is $seed->({ a => $U })->{a}, 'D', 'undefined takes the default';
    ok $is_null->($seed->({ a => undef })->{a}), 'null keeps null';
    ok $is_u->($seed->({})->{b}), 'absent without a default is undefined';
    ok $is_null->($seed->({ b => undef })->{b}), 'null without a default is null';
};

subtest 'passed counts a present nil' => sub {
    my $c = bless { c => undef, config => {}, backend => PureBackend->new }, 'BarefootJS';
    $c->_props({ a => undef, b => $U });
    ok $c->passed('a', 0), 'a present null';
    ok $c->passed('b', 0), 'a present undefined';
    ok !$c->passed('c', 1), 'an absent key';
};

subtest 'evaluator reads' => sub {
    my $ev = \&BarefootJS::Evaluator::evaluate;
    ok $is_u->($ev->({ kind => 'identifier', name => 'undefined' }, {})), 'the undefined identifier';
    is $ev->({ kind => 'identifier', name => 'undefined' }, { undefined => 1 }), 1, 'unless bound';
    my $missing = { kind => 'member', object => { kind => 'identifier', name => 'o' }, property => 'x' };
    ok $is_u->($ev->($missing, { o => {} })), 'a missing field';
    my $coalesce = { kind => 'logical', op => '??', left => $missing, right => { kind => 'literal', value => 'd' } };
    is $ev->($coalesce, { o => {} }), 'd', '?? over undefined';
    is $ev->($coalesce, { o => { x => undef } }), 'd', '?? over null';
    is $ev->($coalesce, { o => { x => 0 } }), 0, '?? keeps 0';
};

subtest 'String() and Number() with no argument' => sub {
    my $call = sub { BarefootJS::Evaluator::_call_builtin($_[0], $_[1]) };
    is $call->('Number', []), 0, 'Number() is 0';
    is $call->('String', []), '', 'String() is ""';
    ok $nan->($call->('Number', [$U])), 'Number(undefined) is NaN';
    is $call->('String', [$U]), 'undefined', 'String(undefined)';
};

done_testing;
