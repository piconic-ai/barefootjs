use strict;
use warnings;
use Test::More;
use FindBin;
use JSON::PP ();

use lib "$FindBin::Bin/../lib";
use BarefootJS::Evaluator;

# Hand-built ParsedExpr constructors for the fold / sort_by trees, mirroring
# the Go eval_test.go demonstrations so the two backends prove the SAME
# restriction-lifting on the SAME shapes.
sub nid  { return { kind => 'identifier', name => $_[0] } }
sub nmem { return { kind => 'member', object => $_[0], property => $_[1], computed => JSON_false() } }
sub nbin { return { kind => 'binary', op => $_[0], left => $_[1], right => $_[2] } }
sub nstr { return { kind => 'literal', value => $_[0], literalType => 'string' } }

sub ncall_math {
    my ($fn, $arg) = @_;
    return { kind => 'call', callee => nmem(nid('Math'), $fn), args => [$arg] };
}

sub nincludes {
    my ($object, $needle) = @_;
    return { kind => 'array-method', method => 'includes', object => $object, args => [$needle] };
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

# Non-finite coercion stays JS-faithful (and matches the Go evaluator):
# division by zero is ±Infinity / NaN rather than a Perl die, and those
# values stringify as "Infinity" / "-Infinity" / "NaN" (not Perl's "Inf").
subtest 'non-finite: division by zero and JS stringification' => sub {
    my $div = sub {
        my ($a, $b) = @_;
        BarefootJS::Evaluator::evaluate(
            nbin('/', { kind => 'identifier', name => 'a' }, { kind => 'identifier', name => 'b' }),
            { a => $a, b => $b },
        );
    };
    my $inf = 9**9**9;
    is($div->(1, 0),  $inf,  '1/0 is +Infinity, not a die');
    is($div->(-1, 0), -$inf, '-1/0 is -Infinity');
    my $nan = $div->(0, 0);
    ok($nan != $nan, '0/0 is NaN');

    is(BarefootJS::Evaluator::_to_string($inf),    'Infinity',  'String(Infinity)');
    is(BarefootJS::Evaluator::_to_string(-$inf),   '-Infinity', 'String(-Infinity)');
    is(BarefootJS::Evaluator::_to_string($inf - $inf), 'NaN',   'String(NaN)');
};

# Captured free vars flow through $base_env (mirrors the Go FoldEval/SortEval
# baseEnv test) — a reducer / comparator body can reference an outer const.
subtest 'captured free vars via base_env' => sub {
    # reduce: acc + item * factor, with `factor` captured.
    my $body = nbin('+', nid('acc'), nbin('*', nid('item'), nid('factor')));
    my $sum = BarefootJS::Evaluator::fold([1, 2, 3], $body, 'acc', 'item', 0, 'left', { factor => 10 });
    is($sum, 60, '0 + 1*10 + 2*10 + 3*10 with captured factor');

    # sort by distance from a captured `pivot`: |a-pivot| - |b-pivot|.
    my $cmp = nbin('-',
        ncall_math('abs', nbin('-', nid('a'), nid('pivot'))),
        ncall_math('abs', nbin('-', nid('b'), nid('pivot'))),
    );
    my $sorted = BarefootJS::Evaluator::sort_by([1, 8, 4], $cmp, 'a', 'b', { pivot => 5 });
    is_deeply($sorted, [4, 8, 1], 'ascending by distance from captured pivot');
};

# Boolean-valued operators return JS booleans (JSON::PP::Boolean), not 1/0 —
# matching the Go evaluator, so they stringify "true"/"false" and concatenate
# as JS does.
subtest 'boolean-valued ops return JS booleans, not 1/0' => sub {
    my $lt = BarefootJS::Evaluator::evaluate(nbin('<', nid('a'), nid('b')), { a => 1, b => 2 });
    ok(JSON::PP::is_bool($lt), 'a < b is a JS boolean');
    is(BarefootJS::Evaluator::_to_string($lt), 'true', 'String(a < b) is "true", not "1"');

    my $cat = BarefootJS::Evaluator::evaluate(
        nbin('+', nstr('x'), nbin('<', nid('a'), nid('b'))), { a => 1, b => 2 });
    is($cat, 'xtrue', "'x' + (a < b) is 'xtrue', not 'x1'");

    my $eq = BarefootJS::Evaluator::evaluate(nbin('===', nid('a'), nid('b')), { a => 1, b => 1 });
    ok(JSON::PP::is_bool($eq), '1 === 1 is a JS boolean');

    my $not = BarefootJS::Evaluator::evaluate({ kind => 'unary', op => '!', argument => nstr('') }, {});
    is(BarefootJS::Evaluator::_to_string($not), 'true', 'String(!"") is "true"');

    my $b = BarefootJS::Evaluator::evaluate(
        { kind => 'call', callee => nid('Boolean'), args => [nstr('')] }, {});
    ok(JSON::PP::is_bool($b), 'Boolean("") is a JS boolean');
    is(BarefootJS::Evaluator::_to_string($b), 'false', 'String(Boolean("")) is "false", not "0"');

    # `.length` is a string/array property only; a numeric scalar has none.
    my $len = BarefootJS::Evaluator::evaluate(nmem(nid('n'), 'length'), { n => 123 });
    ok(!defined $len, '(123).length is null, not 3');
};

# `.includes` (#2075) is the one `array-method` in the evaluator subset,
# dispatching on the receiver type like the SSR template lowering does at
# runtime (`bf_includes` / `$bf->includes`): array → SameValueZero membership
# (the same value rules as `===`, so a numeric 2 does NOT match the string
# "2"); string → substring search; anything else degrades to false rather
# than dying.
subtest 'array-method includes' => sub {
    my $hit = BarefootJS::Evaluator::evaluate(nincludes(nid('tags'), nstr('go')), { tags => [ 'perl', 'go' ] });
    ok(JSON::PP::is_bool($hit), 'array hit is a JS boolean');
    ok($hit, 'array .includes: hit');

    my $miss = BarefootJS::Evaluator::evaluate(nincludes(nid('tags'), nstr('rust')), { tags => [ 'perl', 'go' ] });
    ok(JSON::PP::is_bool($miss), 'array miss is a JS boolean');
    ok(!$miss, 'array .includes: miss');

    # SameValueZero, not loose equality: the numeric element 2 matches the
    # numeric needle 2, but the string needle "2" (a different JS type) does
    # not — mirroring `===`'s type-sensitivity.
    my $num_hit = BarefootJS::Evaluator::evaluate(nincludes(nid('nums'), { kind => 'literal', value => 2 }), { nums => [ 1, 2, 3 ] });
    ok($num_hit, 'array .includes: numeric element hit');
    my $num_vs_string = BarefootJS::Evaluator::evaluate(nincludes(nid('nums'), nstr('2')), { nums => [ 1, 2, 3 ] });
    ok(!$num_vs_string, 'array .includes: numeric element does not match a string needle');

    my $sub = BarefootJS::Evaluator::evaluate(nincludes(nid('name'), nstr('ar')), { name => 'bare' });
    ok($sub, 'string .includes: substring hit');

    # A non-array, non-string receiver (number, null, object) is not a JS
    # `.includes` target; the evaluator degrades to false rather than dying.
    my $scalar_recv = BarefootJS::Evaluator::evaluate(nincludes(nid('n'), { kind => 'literal', value => 1 }), { n => 42 });
    ok(!$scalar_recv, 'non-collection receiver (number) is false, not a die');
    my $null_recv = BarefootJS::Evaluator::evaluate(nincludes(nid('n'), nstr('x')), { n => undef });
    ok(!$null_recv, 'non-collection receiver (null) is false, not a die');
};

# sort_by tolerates a non-array receiver by returning an empty arrayref (the
# BarefootJS->sort convention), never undef — so callers can always deref it.
subtest 'sort_by non-array receiver returns []' => sub {
    my $cmp = nbin('-', nid('a'), nid('b'));
    is_deeply(BarefootJS::Evaluator::sort_by(undef, $cmp, 'a', 'b'), [], 'undef receiver → []');
    is_deeply(BarefootJS::Evaluator::sort_by(42, $cmp, 'a', 'b'), [], 'scalar receiver → []');
};

# sort_by is stable: equal-comparing elements keep their input order. The
# explicit index tie-break makes this independent of the `sort` pragma /
# build, matching Go's sort.SliceStable.
subtest 'sort_by is stable for equal keys' => sub {
    my $cmp = nbin('-', nmem(nid('a'), 'k'), nmem(nid('b'), 'k'));
    # All-equal keys → input order preserved.
    my $eq = BarefootJS::Evaluator::sort_by(
        [ { k => 1, id => 'a' }, { k => 1, id => 'b' }, { k => 1, id => 'c' } ],
        $cmp, 'a', 'b');
    is_deeply([ map { $_->{id} } @$eq ], [ 'a', 'b', 'c' ], 'equal keys keep input order');
    # Mixed keys → sorted by key, ties stable (x before z).
    my $mixed = BarefootJS::Evaluator::sort_by(
        [ { k => 2, id => 'x' }, { k => 1, id => 'y' }, { k => 2, id => 'z' } ],
        $cmp, 'a', 'b');
    is_deeply([ map { $_->{id} } @$mixed ], [ 'y', 'x', 'z' ], 'tie (x,z) stays in input order');
};

# fold_json / sort_by_json are the JSON-string seam the adapters emit into:
# the serialized ParsedExpr body travels as a `bf->reduce_eval` / `bf->sort_eval`
# argument and is decoded here, then handed to fold / sort_by. These exercise
# the exact shapes the #2018 EXPR2 reduce/sort migration emits (field access
# over hashref rows keyed by the raw JS prop name), with the captured-env arg.
subtest 'fold_json / sort_by_json decode a JSON body and evaluate it' => sub {
    my @rows = ({ duration => 95 }, { duration => 213 }, { duration => 185 });

    # reduce: sum + t.duration, seed 0 → 493
    my $reduce = JSON::PP->new->encode(
        nbin('+', nid('sum'), nmem(nid('t'), 'duration')));
    is(BarefootJS::Evaluator::fold_json(\@rows, $reduce, 'sum', 't', 0, 'left', {}),
        493, 'fold_json sums a field');

    # reduceRight concat is order-observable: cba, not abc.
    my @labels = ({ label => 'a' }, { label => 'b' }, { label => 'c' });
    my $concat = JSON::PP->new->encode(
        nbin('+', nid('acc'), nmem(nid('x'), 'label')));
    is(BarefootJS::Evaluator::fold_json(\@labels, $concat, 'acc', 'x', '', 'left', {}),
        'abc', 'fold_json concat left → abc');
    is(BarefootJS::Evaluator::fold_json(\@labels, $concat, 'acc', 'x', '', 'right', {}),
        'cba', 'fold_json concat right → cba');

    # sort: a.duration - b.duration → ascending
    my $cmp = JSON::PP->new->encode(
        nbin('-', nmem(nid('a'), 'duration'), nmem(nid('b'), 'duration')));
    my $sorted = BarefootJS::Evaluator::sort_by_json(\@rows, $cmp, 'a', 'b', {});
    is_deeply([ map { $_->{duration} } @$sorted ], [ 95, 185, 213 ],
        'sort_by_json orders by a field');
};

# The #2018 P2 higher-order predicate helpers evaluate an arbitrary pure
# predicate body per element, generalizing bf_filter / bf_find / bf_every /
# bf_some. Mirrors the Go TestPredicateEvalHelpers shapes (u => u.age >= 18).
subtest 'filter / every / some / find / find_index over a predicate body' => sub {
    my @rows = ({ age => 15 }, { age => 30 }, { age => 18 });
    my $pred = nbin('>=', nmem(nid('u'), 'age'),
        { kind => 'literal', value => 18, literalType => 'number' });

    my $f = BarefootJS::Evaluator::filter(\@rows, $pred, 'u');
    is_deeply([ map { $_->{age} } @$f ], [ 30, 18 ], 'filter keeps age >= 18');

    is(BarefootJS::Evaluator::some(\@rows, $pred, 'u'), 1, 'some → true');
    is(BarefootJS::Evaluator::every(\@rows, $pred, 'u'), 0, 'every → false (15 < 18)');

    is(BarefootJS::Evaluator::find(\@rows, $pred, 'u', 1)->{age}, 30, 'find forward → 30');
    is(BarefootJS::Evaluator::find(\@rows, $pred, 'u', 0)->{age}, 18, 'findLast → 18');
    is(BarefootJS::Evaluator::find_index(\@rows, $pred, 'u', 1), 1, 'findIndex → 1');
    is(BarefootJS::Evaluator::find_index(\@rows, $pred, 'u', 0), 2, 'findLastIndex → 2');

    # Empty receiver: every vacuously true, some false, find undef / index -1.
    is(BarefootJS::Evaluator::every([], $pred, 'u'), 1, 'every(empty) → true');
    is(BarefootJS::Evaluator::some([], $pred, 'u'), 0, 'some(empty) → false');
    ok(!defined BarefootJS::Evaluator::find([], $pred, 'u'), 'find(empty) → undef');
    is(BarefootJS::Evaluator::find_index([], $pred, 'u'), -1, 'find_index(empty) → -1');

    # JSON seam: the body arrives as the string the adapter emits. Cover more
    # than filter_json so each *_json entry point is pinned (Copilot review
    # #2032).
    my $json = JSON::PP->new->encode($pred);
    my $fj = BarefootJS::Evaluator::filter_json(\@rows, $json, 'u');
    is_deeply([ map { $_->{age} } @$fj ], [ 30, 18 ], 'filter_json decodes + filters');
    is(BarefootJS::Evaluator::every_json(\@rows, $json, 'u'), 0, 'every_json → false');
    is(BarefootJS::Evaluator::some_json(\@rows, $json, 'u'),  1, 'some_json → true');
    is(BarefootJS::Evaluator::find_json(\@rows, $json, 'u', 1)->{age}, 30, 'find_json forward → 30');
    is(BarefootJS::Evaluator::find_index_json(\@rows, $json, 'u', 0), 2, 'find_index_json backward → 2');

    # Captured base_env: a predicate `u => u.age >= threshold` reads the outer
    # `threshold`, and changing it changes the result — pins the capture
    # plumbing (Copilot review #2032).
    my $cap = nbin('>=', nmem(nid('u'), 'age'), nid('threshold'));
    my $hi  = BarefootJS::Evaluator::filter(\@rows, $cap, 'u', { threshold => 18 });
    my $lo  = BarefootJS::Evaluator::filter(\@rows, $cap, 'u', { threshold => 100 });
    is(scalar(@$hi), 2, 'captured threshold 18 keeps 2');
    is(scalar(@$lo), 0, 'captured threshold 100 keeps 0');
    is(BarefootJS::Evaluator::find_index(\@rows, $cap, 'u', 1, { threshold => 100 }), -1,
        'find_index with unmet captured threshold → -1');
};

# #2018 P3: flat_map projects each element through a projection body and
# flattens one level — a field projection yielding an arrayref contributes its
# elements; an array-literal (tuple) projection contributes its leaves. Mirrors
# the Go TestFlatMapEval shapes.
subtest 'flat_map projects + flattens one level' => sub {
    my @rows = ({ tags => [ 'a', 'b' ] }, { tags => [ 'c' ] });
    my $field = nmem(nid('i'), 'tags');
    is_deeply(BarefootJS::Evaluator::flat_map(\@rows, $field, 'i'), [ 'a', 'b', 'c' ],
        'field projection flattens the per-item arrays');

    my @pts = ({ x => 1, y => 2 }, { x => 3, y => 4 });
    my $tuple = {
        kind     => 'array-literal',
        elements => [ nmem(nid('p'), 'x'), nmem(nid('p'), 'y') ],
    };
    is_deeply(BarefootJS::Evaluator::flat_map(\@pts, $tuple, 'p'), [ 1, 2, 3, 4 ],
        'array-literal projection flattens the leaf tuples');

    # JSON seam.
    my $fj = BarefootJS::Evaluator::flat_map_json(\@rows,
        JSON::PP->new->encode($field), 'i');
    is_deeply($fj, [ 'a', 'b', 'c' ], 'flat_map_json decodes + projects');
};

# #2073: map_items is the value-producing `.map(cb)` — one result per element,
# NO flatten (an array-valued projection stays one element). Mirrors the Go
# TestMapEval shapes.
subtest 'map_items projects one result per element (no flatten)' => sub {
    my $tmpl = {
        kind  => 'template-literal',
        parts => [
            { type => 'string',     value => '#' },
            { type => 'expression', expr  => nid('t') },
        ],
    };
    is_deeply(BarefootJS::Evaluator::map_items([ 'perl', 'go' ], $tmpl, 't'),
        [ '#perl', '#go' ], 'template-literal projection maps each element');

    my @users = ({ name => 'Ada' }, { name => 'Grace' });
    my $field = nmem(nid('u'), 'name');
    is_deeply(BarefootJS::Evaluator::map_items(\@users, $field, 'u'),
        [ 'Ada', 'Grace' ], 'field projection maps each element');

    my @rows = ({ tags => [ 'a', 'b' ] });
    is_deeply(BarefootJS::Evaluator::map_items(\@rows, nmem(nid('i'), 'tags'), 'i'),
        [ [ 'a', 'b' ] ], 'array-valued projection stays ONE element (no flatten)');

    # JSON seam.
    my $mj = BarefootJS::Evaluator::map_json(\@users,
        JSON::PP->new->encode($field), 'u');
    is_deeply($mj, [ 'Ada', 'Grace' ], 'map_json decodes + projects');
};

# #2094: the evaluator widening lets a callback body (already evaluated here
# for reduce/sort/filter/find/…) itself contain a nested `.map(cb)` /
# `.filter(cb)` call — e.g. the #1938 blog-showcase
# `.flatMap(p => p.tags.map(t => '#'+t))` projection body. Mirrors the Go
# TestArrayCallback shapes.
subtest 'nested .map / .filter callback calls (#2094)' => sub {
    # item.tags.map(t => '#' + t)
    my $map_call = {
        kind    => 'call',
        callee  => nmem(nmem(nid('item'), 'tags'), 'map'),
        args    => [ {
            kind   => 'arrow',
            params => ['t'],
            body   => nbin('+', nstr('#'), nid('t')),
        } ],
    };
    is_deeply(
        BarefootJS::Evaluator::evaluate($map_call, { item => { tags => [ 'go', 'perl' ] } }),
        [ '#go', '#perl' ],
        'nested .map: string-prefix projection',
    );

    # item.tags.filter(t => t.active)
    my $filter_call = {
        kind   => 'call',
        callee => nmem(nmem(nid('item'), 'tags'), 'filter'),
        args   => [ {
            kind   => 'arrow',
            params => ['t'],
            body   => nmem(nid('t'), 'active'),
        } ],
    };
    my $filtered = BarefootJS::Evaluator::evaluate($filter_call, {
        item => { tags => [ { active => JSON::PP::true, n => 1 }, { active => JSON::PP::false, n => 2 } ] },
    });
    is_deeply([ map { $_->{n} } @$filtered ], [1], 'nested .filter: keeps only active');

    # 2-param arrow (value, index): item.tags.map((t, i) => t.n + i)
    my $indexed = {
        kind   => 'call',
        callee => nmem(nmem(nid('item'), 'tags'), 'map'),
        args   => [ {
            kind   => 'arrow',
            params => ['t', 'i'],
            body   => nbin('+', nmem(nid('t'), 'n'), nid('i')),
        } ],
    };
    is_deeply(
        BarefootJS::Evaluator::evaluate($indexed, { item => { tags => [ { n => 10 }, { n => 20 }, { n => 30 } ] } }),
        [ 10, 21, 32 ],
        'nested .map: 2-param arrow does not leak the index across sibling calls',
    );

    # .filter(...).length > 0 — the doc/#2038 motivating composed shape.
    my $len_gt = {
        kind => 'binary', op => '>',
        left => nmem($filter_call, 'length'),
        right => { kind => 'literal', value => 0, literalType => 'number' },
    };
    ok(BarefootJS::Evaluator::evaluate($len_gt, {
        item => { tags => [ { active => JSON::PP::true }, { active => JSON::PP::false } ] },
    }), '.filter(...).length > 0 composes: at least one active');
    ok(!BarefootJS::Evaluator::evaluate($len_gt, {
        item => { tags => [ { active => JSON::PP::false }, { active => JSON::PP::false } ] },
    }), '.filter(...).length > 0 composes: none active is falsy');
};

# #2094: `.join(sep?)` — a sibling `array-method` alongside `.includes`.
subtest 'array-method join (#2094)' => sub {
    my $tags = nmem(nid('item'), 'tags');
    my $join_default = { kind => 'array-method', method => 'join', object => $tags, args => [] };
    is(BarefootJS::Evaluator::evaluate($join_default, { item => { tags => [ 'a', 'b' ] } }),
        'a,b', 'no separator defaults to a comma');

    my $join_custom = {
        kind => 'array-method', method => 'join', object => $tags,
        args => [ nstr('-') ],
    };
    is(BarefootJS::Evaluator::evaluate($join_custom, { item => { tags => [ 'a', 'b', 'c' ] } }),
        'a-b-c', 'custom separator');

    is(BarefootJS::Evaluator::evaluate($join_custom, { item => { tags => [] } }),
        '', 'empty array joins to the empty string');

    is(BarefootJS::Evaluator::evaluate($join_default, { item => { tags => [ 'a', undef, 'b' ] } }),
        'a,,b', 'a null/undef element joins as empty, not the string "null"');
};

done_testing;
