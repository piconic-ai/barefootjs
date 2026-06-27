use strict;
use warnings;
use Test::More;
use FindBin;

use lib "$FindBin::Bin/../lib";
use BarefootJS::Evaluator;

# Hand-built ParsedExpr constructors for the fold / sort_by trees, mirroring
# the Go eval_test.go demonstrations so the two backends prove the SAME
# restriction-lifting on the SAME shapes.
sub nid  { return { kind => 'identifier', name => $_[0] } }
sub nmem { return { kind => 'member', object => $_[0], property => $_[1], computed => JSON_false() } }
sub nbin { return { kind => 'binary', op => $_[0], left => $_[1], right => $_[2] } }

sub ncall_math {
    my ($fn, $arg) = @_;
    return { kind => 'call', callee => nmem(nid('Math'), $fn), args => [$arg] };
}

# A plain false for the `computed` flag; the evaluator only checks truthiness.
sub JSON_false { return 0 }

# fold lifts bf_reduce's op restriction and acc-canonical form: a reducer body
# that mixes acc with a product of two fields is impossible in the +/*
# self/field catalogue but trivial for the evaluator.
subtest 'fold: arbitrary reducer body (acc + item.price * item.qty)' => sub {
    my $body = nbin('+',
        nid('acc'),
        nbin('*', nmem(nid('item'), 'price'), nmem(nid('item'), 'qty')),
    );
    my $items = [ { price => 5, qty => 3 }, { price => 2, qty => 4 } ];
    is(BarefootJS::Evaluator::fold($items, $body, 'acc', 'item', 0, 'left'),
        23, '0 + 5*3 + 2*4');
};

# reduceRight is observable for string concatenation; the same body folds both
# directions.
subtest 'fold: direction is observable for string concat' => sub {
    my $body  = nbin('+', nid('acc'), nid('item'));
    my $items = [ 'a', 'b', 'c' ];
    is(BarefootJS::Evaluator::fold($items, $body, 'acc', 'item', '', 'left'),  'abc', 'left');
    is(BarefootJS::Evaluator::fold($items, $body, 'acc', 'item', '', 'right'), 'cba', 'right');
};

# sort_by lifts bf_sort's comparator pattern restriction: a comparator that
# calls Math.abs on each operand's field is outside the subtraction /
# localeCompare / relational-ternary catalogue, but is just another pure
# expression to the evaluator.
subtest 'sort_by: arbitrary comparator body (abs-of-field difference)' => sub {
    my $cmp = nbin('-',
        ncall_math('abs', nmem(nid('a'), 'v')),
        ncall_math('abs', nmem(nid('b'), 'v')),
    );
    my $items  = [ { v => -5 }, { v => 3 }, { v => -1 } ];
    my $sorted = BarefootJS::Evaluator::sort_by($items, $cmp, 'a', 'b');
    is_deeply([ map { $_->{v} } @$sorted ], [ -1, 3, -5 ], 'ascending by |v|');
};

# Descending is just a reversed comparator body — no separate direction knob.
subtest 'sort_by: descending via a reversed comparator' => sub {
    my $cmp = nbin('-', nmem(nid('b'), 'x'), nmem(nid('a'), 'x'));
    my $items  = [ { x => 10 }, { x => 30 }, { x => 20 } ];
    my $sorted = BarefootJS::Evaluator::sort_by($items, $cmp, 'a', 'b');
    is_deeply([ map { $_->{x} } @$sorted ], [ 30, 20, 10 ], 'descending by x');
};

done_testing;
