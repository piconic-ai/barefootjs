package BarefootJS::Evaluator;
our $VERSION = "0.14.0";
use strict;
use warnings;
use utf8;
use feature 'signatures';
no warnings 'experimental::signatures';

use B ();
use POSIX ();
use JSON::PP ();
use Scalar::Util qw(looks_like_number);

# Lightweight evaluator for the pure `ParsedExpr` subset, scoped to
# higher-order callback bodies (reduce / sort / map / filter / find
# `(…) => expr`) — issue #2018. Templates cannot carry a lambda in
# expression position, which is why the adapters historically special-cased
# these callbacks into fixed shapes (bf_sort's comparator catalogue,
# bf_reduce's +/* fold). Instead, the callback BODY rides as a pure
# `ParsedExpr` subtree (the structured IR the compiler already produces) and
# is evaluated here against an environment (`{acc, item, …captured free
# vars}`).
#
# ONE shared implementation for both Perl backends (Mojo + Xslate), living
# alongside SearchParams.pm in the engine-agnostic core (no CPAN deps beyond
# core B / POSIX / Scalar::Util). The accepted subset and its semantics are
# documented in spec/compiler.md ("ParsedExpr Evaluator Semantics") and pinned
# isomorphically by the cross-language golden vectors
# (packages/adapter-tests/helper-vectors/eval-vectors.json), shared with the Go
# evaluator (bf.go) — same input → same output.
#
# The coercion below is JS-faithful (ToNumber / ToString / ToBoolean, strict
# equality) and deliberately distinct from the divergent bf->string / number
# helpers in BarefootJS.pm, so the contract is unambiguous and the two
# template adapters stay byte-equal with each other and with Go.

# evaluate($node, $env)
#
# Evaluate a decoded ParsedExpr node (a hashref keyed by `kind`) against the
# environment hashref ($env), returning a Perl value (number, string,
# JSON::PP::Boolean, undef for null, arrayref, hashref). The matching JSON
# entry point is eval_json() below.
sub evaluate ($node, $env) {
    return undef unless ref $node eq 'HASH';
    my $kind = $node->{kind} // '';

    if ($kind eq 'literal') {
        return $node->{value};
    }
    if ($kind eq 'identifier') {
        return $env->{ $node->{name} };
    }
    if ($kind eq 'binary') {
        return _binary($node->{op},
            evaluate($node->{left}, $env), evaluate($node->{right}, $env));
    }
    if ($kind eq 'unary') {
        return _unary($node->{op}, evaluate($node->{argument}, $env));
    }
    if ($kind eq 'logical') {
        my $op   = $node->{op};
        my $left = evaluate($node->{left}, $env);
        if ($op eq '&&') {
            return _truthy($left) ? evaluate($node->{right}, $env) : $left;
        }
        if ($op eq '||') {
            return _truthy($left) ? $left : evaluate($node->{right}, $env);
        }
        # `??`
        return defined $left ? $left : evaluate($node->{right}, $env);
    }
    if ($kind eq 'conditional') {
        return _truthy(evaluate($node->{test}, $env))
            ? evaluate($node->{consequent}, $env)
            : evaluate($node->{alternate}, $env);
    }
    if ($kind eq 'member') {
        return _read_property(evaluate($node->{object}, $env), $node->{property});
    }
    if ($kind eq 'index-access') {
        return _read_index(evaluate($node->{object}, $env), evaluate($node->{index}, $env));
    }
    if ($kind eq 'call') {
        my $name = _builtin_name($node->{callee});
        return undef unless defined $name && $name ne '';
        my @args = map { evaluate($_, $env) } @{ $node->{args} // [] };
        return _call_builtin($name, \@args);
    }
    if ($kind eq 'template-literal') {
        my $out = '';
        for my $p (@{ $node->{parts} // [] }) {
            if (($p->{type} // '') eq 'string') {
                $out .= $p->{value} // '';
            }
            else {
                $out .= _to_string(evaluate($p->{expr}, $env));
            }
        }
        return $out;
    }
    if ($kind eq 'array-literal') {
        return [ map { evaluate($_, $env) } @{ $node->{elements} // [] } ];
    }
    if ($kind eq 'object-literal') {
        my %out;
        for my $prop (@{ $node->{properties} // [] }) {
            $out{ $prop->{key} } = evaluate($prop->{value}, $env);
        }
        return \%out;
    }

    # arrow-fn / higher-order / array-method / unsupported: a callback body
    # containing these is refused upstream (BF101); never reached here.
    return undef;
}

# eval_json($json, $env): decode a ParsedExpr JSON string and evaluate it.
# Mirrors the Go EvalExpr entry point. Requires JSON::PP only when used.
sub eval_json ($json, $env) {
    require JSON::PP;
    my $node = JSON::PP->new->decode($json);
    return evaluate($node, $env);
}

# ---------------------------------------------------------------------------
# JS value classification. JSON-decoded strings carry the string flag (POK)
# but no numeric flag; JSON-decoded numbers carry IOK/NOK. This lets the
# evaluator tell the JS *string* "10" from the JS *number* 10 — essential for
# the `+` overload and relational comparison — which looks_like_number alone
# cannot (it is true for both).
# ---------------------------------------------------------------------------

sub _is_string ($v) {
    return 0 if !defined $v || ref $v;
    my $f = B::svref_2object(\$v)->FLAGS;
    return (($f & B::SVf_POK) && !($f & (B::SVf_IOK | B::SVf_NOK))) ? 1 : 0;
}

sub _is_number ($v) {
    return (defined $v && !ref $v && !_is_string($v)) ? 1 : 0;
}

sub _nan {
    my $inf = 9**9**9;
    return $inf - $inf;
}

# ---------------------------------------------------------------------------
# JS coercion primitives (ToNumber / ToString / ToBoolean).
# ---------------------------------------------------------------------------

sub _to_number ($v) {
    return 0 if !defined $v;
    if (ref $v eq 'JSON::PP::Boolean') { return $v ? 1 : 0 }
    return _nan() if ref $v;
    if (_is_string($v)) {
        my $t = $v;
        $t =~ s/\A\s+//;
        $t =~ s/\s+\z//;
        return 0 if $t eq '';
        return looks_like_number($t) ? ($t + 0) : _nan();
    }
    return $v + 0;
}

sub _to_string ($v) {
    return 'null' if !defined $v;
    if (ref $v eq 'JSON::PP::Boolean') { return $v ? 'true' : 'false' }
    # JS spells the non-finite doubles "Infinity" / "-Infinity" / "NaN";
    # Perl stringifies them "Inf" / "-Inf" / "NaN", so the non-finite cases
    # are pinned here to stay JS-faithful (and match the Go evaluator's
    # evalToString). Finite numbers and strings fall through to plain
    # interpolation.
    if (_is_number($v)) {
        my $n = $v + 0;
        return 'NaN'       if $n != $n;
        return 'Infinity'  if $n == 9**9**9;
        return '-Infinity' if $n == -(9**9**9);
    }
    return "$v";
}

sub _truthy ($v) {
    return 0 if !defined $v;
    if (ref $v eq 'JSON::PP::Boolean') { return $v ? 1 : 0 }
    return 1 if ref $v;    # arrays / objects are always truthy in JS
    if (_is_string($v)) { return $v ne '' ? 1 : 0 }    # incl. the truthy "0"
    my $n = $v + 0;
    return ($n != 0 && $n == $n) ? 1 : 0;              # nonzero and not NaN
}

# _bool: wrap a Perl truthy/falsy into a JS boolean (JSON::PP::Boolean), so
# boolean-valued operators (relational, ===, !, Boolean()) return a real
# boolean rather than 1/0 — matching the Go evaluator's bool (e.g.
# String(a < b) is "true", and `'x' + (a < b)` is "xtrue"). The coercions
# above already treat JSON::PP::Boolean correctly.
sub _bool ($t) { $t ? JSON::PP::true() : JSON::PP::false() }

# ---------------------------------------------------------------------------
# Operators
# ---------------------------------------------------------------------------

sub _binary ($op, $l, $r) {
    if ($op eq '+') {
        # JS `+`: string concatenation once either operand is a string,
        # numeric addition otherwise.
        return _to_string($l) . _to_string($r) if _is_string($l) || _is_string($r);
        return _to_number($l) + _to_number($r);
    }
    return _to_number($l) - _to_number($r) if $op eq '-';
    return _to_number($l) * _to_number($r) if $op eq '*';
    if ($op eq '/') {
        my $ln = _to_number($l);
        my $rn = _to_number($r);
        # JS division by zero is finite-valued, not an error: x/0 is ±Infinity
        # (NaN for 0/0). Perl's native `/` dies on a zero divisor, so guard it
        # to stay JS-faithful and match the Go evaluator (Go float division
        # already yields ±Inf / NaN).
        if ($rn == 0) {
            return _nan() if $ln == 0 || $ln != $ln;
            return $ln > 0 ? 9**9**9 : -(9**9**9);
        }
        return $ln / $rn;
    }
    if ($op eq '%') {
        my $rn = _to_number($r);
        return _nan() if $rn == 0;
        return POSIX::fmod(_to_number($l), $rn);
    }
    return _relational($op, $l, $r) if $op eq '<' || $op eq '<=' || $op eq '>' || $op eq '>=';
    return _bool(_strict_eq($l, $r))  if $op eq '===';
    return _bool(!_strict_eq($l, $r)) if $op eq '!==';
    # Loose equality / bitwise / shift are out of the subset.
    return undef;
}

sub _relational ($op, $l, $r) {
    # JS Abstract Relational Comparison: both strings → compare by code unit;
    # otherwise coerce both to numbers (a NaN operand makes it false).
    my $c;
    if (_is_string($l) && _is_string($r)) {
        $c = $l lt $r ? -1 : $l gt $r ? 1 : 0;
    }
    else {
        my $ln = _to_number($l);
        my $rn = _to_number($r);
        return _bool(0) if $ln != $ln || $rn != $rn;    # NaN → false
        $c = $ln < $rn ? -1 : $ln > $rn ? 1 : 0;
    }
    return _bool($c < 0)  if $op eq '<';
    return _bool($c <= 0) if $op eq '<=';
    return _bool($c > 0)  if $op eq '>';
    return _bool($c >= 0) if $op eq '>=';
    return _bool(0);
}

sub _strict_eq ($l, $r) {
    # Strict `===`: equal JS type and value, no coercion.
    my $ln = _is_number($l);
    my $rn = _is_number($r);
    if ($ln && $rn) {
        my ($lf, $rf) = ($l + 0, $r + 0);
        return 0 if $lf != $lf || $rf != $rf;    # NaN
        return $lf == $rf ? 1 : 0;
    }
    return 0 if $ln != $rn;    # one numeric, one not
    if (!defined $l) { return !defined $r ? 1 : 0 }
    return 0 if !defined $r;
    my $lb = ref $l eq 'JSON::PP::Boolean';
    my $rb = ref $r eq 'JSON::PP::Boolean';
    if ($lb || $rb) {
        return 0 unless $lb && $rb;
        return ((!!$l) == (!!$r)) ? 1 : 0;
    }
    return ($l eq $r ? 1 : 0) if _is_string($l) && _is_string($r);
    return 0;
}

sub _unary ($op, $v) {
    return _bool(!_truthy($v)) if $op eq '!';
    return -_to_number($v) if $op eq '-';
    return _to_number($v)  if $op eq '+';
    return undef;
}

# ---------------------------------------------------------------------------
# Built-in calls (the deterministic allowlist). Locale-sensitive builtins
# (localeCompare) are deliberately excluded to keep the backends isomorphic.
# ---------------------------------------------------------------------------

# _builtin_name: resolve a `call` callee to its builtin name (e.g.
# "Math.max"), or '' when the callee is not an allowlisted builtin reference.
sub _builtin_name ($callee) {
    return '' unless ref $callee eq 'HASH';
    my $kind = $callee->{kind} // '';
    if ($kind eq 'identifier') {
        return $callee->{name} // '';
    }
    if ($kind eq 'member' && !$callee->{computed}) {
        my $obj = $callee->{object};
        return '' unless ref $obj eq 'HASH' && ($obj->{kind} // '') eq 'identifier';
        return ($obj->{name} // '') . '.' . ($callee->{property} // '');
    }
    return '';
}

# _math_round: half rounds toward +Infinity (JS Math.round: 2.5→3, -2.5→-2),
# matching the existing round helper rather than half-away-from-zero.
sub _math_round ($n) {
    return POSIX::floor($n + 0.5);
}

sub _call_builtin ($name, $args) {
    if ($name eq 'Math.max') {
        my $m = -(9**9**9);    # JS Math.max() with no args is -Infinity
        for my $a (@$args) {
            my $n = _to_number($a);
            return $n if $n != $n;    # any NaN argument ⇒ NaN (JS / Go)
            $m = $n if $n > $m;
        }
        return $m;
    }
    if ($name eq 'Math.min') {
        my $m = 9**9**9;       # JS Math.min() with no args is +Infinity
        for my $a (@$args) {
            my $n = _to_number($a);
            return $n if $n != $n;    # any NaN argument ⇒ NaN (JS / Go)
            $m = $n if $n < $m;
        }
        return $m;
    }
    return abs(_to_number($args->[0]))          if $name eq 'Math.abs';
    return POSIX::floor(_to_number($args->[0])) if $name eq 'Math.floor';
    return POSIX::ceil(_to_number($args->[0]))  if $name eq 'Math.ceil';
    return _math_round(_to_number($args->[0]))  if $name eq 'Math.round';
    return _to_string($args->[0])              if $name eq 'String';
    return _to_number($args->[0])              if $name eq 'Number';
    return _bool(_truthy($args->[0]))          if $name eq 'Boolean';
    # Any other callee is outside the subset (refused upstream).
    return undef;
}

# ---------------------------------------------------------------------------
# Member / index access
# ---------------------------------------------------------------------------

sub _read_property ($obj, $key) {
    return undef unless defined $obj;
    if (ref $obj eq 'HASH') {
        return exists $obj->{$key} ? $obj->{$key} : undef;
    }
    if (ref $obj eq 'ARRAY') {
        return $key eq 'length' ? scalar(@$obj) : undef;
    }
    return undef if ref $obj;
    # `.length` is a string property only — a numeric scalar (123) has no
    # `.length` in the subset (JS `(123).length` is undefined → null), so
    # guard on _is_string rather than coercing the number to a string.
    # Matches the Go evaluator (numbers fall through to nil there).
    return length($obj) if $key eq 'length' && _is_string($obj);
    return undef;
}

sub _read_index ($obj, $index) {
    if (ref $obj eq 'ARRAY') {
        my $f = _to_number($index);
        my $i = int($f);
        return undef if $i != $f || $i < 0 || $i >= @$obj;
        return $obj->[$i];
    }
    if (ref $obj eq 'HASH') {
        return $obj->{ _to_string($index) };
    }
    return undef;
}

# ---------------------------------------------------------------------------
# Evaluator-driven higher-order folds (the generalization of bf_reduce /
# bf_sort onto the evaluator) — the runtime half both Perl backends share.
# ---------------------------------------------------------------------------

# fold($items, $body, $acc_name, $item_name, $init, $direction, $base_env)
#
# Fold an arrayref into a value via the evaluator. The reducer $body is a
# pure ParsedExpr node evaluated against `{$acc_name => acc, $item_name =>
# item}` plus the captured free vars in $base_env per element; $init seeds the
# accumulator and $direction is "left" (reduce) or "right" (reduceRight).
# Generalizes bf_reduce — any reducer body, not just the +/* arithmetic
# catalogue, and acc may appear anywhere. $base_env is optional; the
# acc/item keys shadow any same-named base key. Mirrors Go's FoldEval.
sub fold ($items, $body, $acc_name, $item_name, $init, $direction = 'left', $base_env = undef) {
    my @arr = ref $items eq 'ARRAY' ? @$items : ();
    @arr = reverse @arr if ($direction // '') eq 'right';
    # Seed the env from the captured free vars once; acc / item are
    # overwritten each iteration (constant base keys carry through).
    my %env = $base_env ? %$base_env : ();
    my $acc = $init;
    for my $item (@arr) {
        $env{$acc_name}  = $acc;
        $env{$item_name} = $item;
        $acc = evaluate($body, \%env);
    }
    return $acc;
}

# sort_by($items, $cmp, $param_a, $param_b, $base_env)
#
# Return a new arrayref ordered by a ParsedExpr comparator $cmp evaluated
# against `{$param_a => a, $param_b => b}` plus the captured free vars in
# $base_env to a number (negative / zero / positive, like a JS comparator).
# Generalizes bf_sort — any comparator body. $base_env is optional. Stable
# and non-mutating. Mirrors Go's SortEval.
sub sort_by ($items, $cmp, $param_a, $param_b, $base_env = undef) {
    # Non-array receiver → empty arrayref, matching the nil-tolerant
    # BarefootJS->sort helper convention (and avoiding an undef-deref footgun
    # for callers that use the result as an arrayref). Value-compatible with
    # the Go SortEval, whose nil slice iterates as empty too.
    return [] unless ref $items eq 'ARRAY';
    my %env = $base_env ? %$base_env : ();
    # Decorate each element with its original index and tie-break on it when
    # the comparator returns 0, so stability is explicit and independent of
    # the `sort` pragma / build (portable to the declared minimum Perl, and
    # matching Go's sort.SliceStable).
    my @decorated = map { [ $_, $items->[$_] ] } 0 .. $#$items;
    my @sorted = sort {
        $env{$param_a} = $a->[1];
        $env{$param_b} = $b->[1];
        my $c = _to_number(evaluate($cmp, \%env));
        # Explicit sign test rather than `<=> 0`: a NaN comparator result
        # warns / is undefined under `<=>`, whereas `< 0` / `> 0` are both
        # false for NaN, yielding 0 (no reordering) — matching JS (NaN
        # comparator ⇒ keep order) and the Go SortEval sign test. The
        # original-index tie-break then preserves input order for equal keys.
        ($c < 0 ? -1 : $c > 0 ? 1 : 0) || ($a->[0] <=> $b->[0])
    } @decorated;
    return [ map { $_->[1] } @sorted ];
}

# JSON entry points for the adapters: decode the callback body once, then fold /
# sort. Mirror the Go `bf_reduce_eval` / `bf_sort_eval` template funcs, which the
# adapters emit with a serialized-ParsedExpr body argument.
sub fold_json ($items, $body_json, $acc_name, $item_name, $init, $direction = 'left', $base_env = undef) {
    require JSON::PP;
    return fold($items, JSON::PP->new->decode($body_json), $acc_name, $item_name, $init, $direction, $base_env);
}

sub sort_by_json ($items, $cmp_json, $param_a, $param_b, $base_env = undef) {
    require JSON::PP;
    return sort_by($items, JSON::PP->new->decode($cmp_json), $param_a, $param_b, $base_env);
}

# ---------------------------------------------------------------------------
# Higher-order predicates (#2018, P2) — the generalization of bf_filter /
# bf_find / bf_find_index / bf_every / bf_some onto the evaluator. The
# predicate $pred is a pure ParsedExpr evaluated against `{$param => item}`
# plus the captured free vars in $base_env per element, lifting the
# field-equality / truthiness restriction to any pure predicate body. Each
# mirrors the corresponding Go helper (FilterEval / EveryEval / SomeEval /
# FindEval / FindIndexEval). $base_env is optional.
# ---------------------------------------------------------------------------

# filter — new arrayref of the elements the predicate keeps. Non-array receiver
# → empty arrayref (the BarefootJS->filter nil-tolerant convention).
sub filter ($items, $pred, $param, $base_env = undef) {
    return [] unless ref $items eq 'ARRAY';
    my %env = $base_env ? %$base_env : ();
    my @out;
    for my $item (@$items) {
        $env{$param} = $item;
        push @out, $item if _truthy(evaluate($pred, \%env));
    }
    return \@out;
}

# every — 1 iff the predicate holds for every element (vacuously 1 for an empty
# receiver, like JS).
sub every ($items, $pred, $param, $base_env = undef) {
    my @arr = ref $items eq 'ARRAY' ? @$items : ();
    my %env = $base_env ? %$base_env : ();
    for my $item (@arr) {
        $env{$param} = $item;
        return 0 unless _truthy(evaluate($pred, \%env));
    }
    return 1;
}

# some — 1 iff the predicate holds for any element (0 for an empty receiver).
sub some ($items, $pred, $param, $base_env = undef) {
    my @arr = ref $items eq 'ARRAY' ? @$items : ();
    my %env = $base_env ? %$base_env : ();
    for my $item (@arr) {
        $env{$param} = $item;
        return 1 if _truthy(evaluate($pred, \%env));
    }
    return 0;
}

# find — first matching element, or undef. $forward false searches from the end
# (findLast).
sub find ($items, $pred, $param, $forward = 1, $base_env = undef) {
    my @arr = ref $items eq 'ARRAY' ? @$items : ();
    @arr = reverse @arr unless $forward;
    my %env = $base_env ? %$base_env : ();
    for my $item (@arr) {
        $env{$param} = $item;
        return $item if _truthy(evaluate($pred, \%env));
    }
    return undef;
}

# find_index — index of the first matching element, or -1. $forward false →
# findLastIndex (the index is into the original array either way).
sub find_index ($items, $pred, $param, $forward = 1, $base_env = undef) {
    my @arr = ref $items eq 'ARRAY' ? @$items : ();
    my %env = $base_env ? %$base_env : ();
    my @idx = $forward ? ( 0 .. $#arr ) : reverse( 0 .. $#arr );
    for my $i (@idx) {
        $env{$param} = $arr[$i];
        return $i if _truthy(evaluate($pred, \%env));
    }
    return -1;
}

# flat_map — project each element through $proj (a pure ParsedExpr) and flatten
# the results one level. A projection yielding an arrayref contributes its
# elements; any other value contributes itself (JS `.flatMap` keeps a non-array
# return as a single element). Generalizes bf->flat_map / flat_map_tuple to any
# pure projection. Mirrors Go's FlatMapEval. $base_env is optional.
sub flat_map ($items, $proj, $param, $base_env = undef) {
    my @arr = ref $items eq 'ARRAY' ? @$items : ();
    my %env = $base_env ? %$base_env : ();
    my @out;
    for my $item (@arr) {
        $env{$param} = $item;
        my $v = evaluate($proj, \%env);
        if (ref $v eq 'ARRAY') { push @out, @$v }
        else                   { push @out, $v }
    }
    return \@out;
}

# ---------------------------------------------------------------------------
# JSON-string seams — the adapters emit `bf->filter_eval($recv, '<json>', …)`;
# the predicate body arrives as a JSON string here, decoded then handed to the
# helper above (mirroring fold_json / sort_by_json).
# ---------------------------------------------------------------------------

sub filter_json ($items, $pred_json, $param, $base_env = undef) {
    require JSON::PP;
    return filter($items, JSON::PP->new->decode($pred_json), $param, $base_env);
}

sub every_json ($items, $pred_json, $param, $base_env = undef) {
    require JSON::PP;
    return every($items, JSON::PP->new->decode($pred_json), $param, $base_env);
}

sub some_json ($items, $pred_json, $param, $base_env = undef) {
    require JSON::PP;
    return some($items, JSON::PP->new->decode($pred_json), $param, $base_env);
}

sub find_json ($items, $pred_json, $param, $forward = 1, $base_env = undef) {
    require JSON::PP;
    return find($items, JSON::PP->new->decode($pred_json), $param, $forward, $base_env);
}

sub find_index_json ($items, $pred_json, $param, $forward = 1, $base_env = undef) {
    require JSON::PP;
    return find_index($items, JSON::PP->new->decode($pred_json), $param, $forward, $base_env);
}

sub flat_map_json ($items, $proj_json, $param, $base_env = undef) {
    require JSON::PP;
    return flat_map($items, JSON::PP->new->decode($proj_json), $param, $base_env);
}

1;
