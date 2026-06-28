use strict;
use warnings;
use Test::More;
use FindBin;
use File::Spec;
use JSON::PP ();
use B ();
use Scalar::Util qw(looks_like_number);

use lib "$FindBin::Bin/../lib";
use BarefootJS::Evaluator;

# Golden ParsedExpr-evaluator vectors (issue #2018, spec/compiler.md
# "ParsedExpr Evaluator Semantics"), generated from the JS reference
# evaluator and shared with the Go evaluator. The file is not shipped in
# the CPAN dist — packages/adapter-tests only exists in a monorepo
# checkout — so skip everywhere else.
my $vectors_path = File::Spec->catfile(
    $FindBin::Bin, '..', '..', 'adapter-tests', 'helper-vectors', 'eval-vectors.json'
);
plan skip_all => 'eval vectors not available outside the monorepo checkout'
    unless -e $vectors_path;

my $doc = do {
    open my $fh, '<:raw', $vectors_path or die "open $vectors_path: $!";
    local $/;
    JSON::PP->new->decode(<$fh>);
};

die "eval-vectors.json contains no cases" unless @{ $doc->{cases} || [] };

# The evaluator is JS-faithful by contract, so there are NO Perl-side
# divergences here (unlike the bf->string / number helper vectors). Each
# case's real ParsedExpr tree, evaluated against its environment, must
# reproduce the JS-computed expect exactly — same input → same output as Go.
for my $case (@{ $doc->{cases} }) {
    my $note   = $case->{note};
    my $expr   = $case->{expr};
    my $env    = $case->{env};
    my $expect = $case->{expect};

    my $got = eval { BarefootJS::Evaluator::evaluate($expr, $env) };
    if (my $err = $@) {
        fail("$note died: $err");
        next;
    }
    ok(_match($got, $expect), $note)
        or diag('got ' . explain_value($got) . ', want ' . explain_value($expect));
}

done_testing;

# _is_real_number: true only when the scalar is an actual number (SV carries
# IOK/NOK), NOT a numeric-looking string. JSON::PP decodes a JSON number to
# IOK/NOK and a JSON string to a POK-only scalar, so this tells the JS *number*
# 42 from the JS *string* "42" — the distinction the evaluator must preserve.
# (looks_like_number can't: it is true for the string "42" too.)
sub _is_real_number {
    my ($v) = @_;
    return 0 unless defined $v && !ref $v;
    return (B::svref_2object(\$v)->FLAGS & (B::SVf_IOK | B::SVf_NOK)) ? 1 : 0;
}

# _match: boolean form of the spec's value-compat comparison against a
# JSON-decoded expect — non-finite sentinel hashes, booleans by truthiness,
# numbers numerically, arrays/hashes recursively, strings by eq.
sub _match {
    my ($got, $expect) = @_;
    return !defined $got if !defined $expect;
    if (ref $expect eq 'HASH' && exists $expect->{'$num'}) {
        my $kind = $expect->{'$num'};
        return 0 unless defined $got && looks_like_number($got);
        return $got != $got ? 1 : 0 if $kind eq 'NaN';
        my $inf = 9**9**9;
        return $got == ($kind eq 'Infinity' ? $inf : -$inf) ? 1 : 0;
    }
    if (JSON::PP::is_bool($expect)) {
        return (!!$got eq !!$expect) ? 1 : 0;
    }
    if (ref $expect eq 'ARRAY') {
        return 0 unless ref $got eq 'ARRAY' && @$got == @$expect;
        _match($got->[$_], $expect->[$_]) or return 0 for 0 .. $#$expect;
        return 1;
    }
    if (ref $expect eq 'HASH') {
        return 0 unless ref $got eq 'HASH' && keys %$got == keys %$expect;
        for my $k (keys %$expect) {
            return 0 unless exists $got->{$k};
            _match($got->{$k}, $expect->{$k}) or return 0;
        }
        return 1;
    }
    return 0 if !defined $got || ref $got;
    # Numeric == only when BOTH are real numbers (not numeric-looking strings),
    # so a string-vs-number mismatch fails: e.g. String(42) must return the
    # string "42", and the evaluator returning the number 42 must NOT pass.
    my $want_num = _is_real_number($expect);
    return 0 if $want_num != _is_real_number($got);
    return ($got == $expect ? 1 : 0) if $want_num;
    return ($got eq $expect) ? 1 : 0;
}

sub explain_value {
    my ($v) = @_;
    return 'undef' unless defined $v;
    return JSON::PP->new->canonical->allow_nonref->allow_blessed->convert_blessed->encode($v)
        if ref $v;
    return "'$v'";
}
