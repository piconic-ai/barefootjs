use strict;
use warnings;
use Test::More;
use FindBin;
use File::Spec;
use JSON::PP ();
use POSIX ();
use Scalar::Util qw(looks_like_number);

use lib "$FindBin::Bin/../lib";
use BarefootJS;
use BarefootJS::Evaluator ();

binmode Test::More->builder->$_, ':encoding(UTF-8)'
    for qw(output failure_output todo_output);

# The JS primitive-operation corpus (spec/js-primitive-semantics.md,
# "Conformance"): one <op>.json per operation, generated from
# packages/adapter-tests/vectors/primitives/*.ts. Shared by both Perl
# adapters (Mojolicious, Xslate), which call the same BarefootJS helpers.
# Not shipped in the CPAN dist, so skip outside the monorepo checkout.
my $vectors_dir = File::Spec->catdir($FindBin::Bin, '..', '..', 'adapter-tests', 'vectors');
my @files = sort glob(File::Spec->catfile($vectors_dir, 'primitives', '*.json'));
plan skip_all => 'primitive vectors not available outside the monorepo checkout'
    unless @files;

sub _read_json {
    my ($path) = @_;
    open my $fh, '<:raw', $path or die "open $path: $!";
    local $/;
    return JSON::PP->new->utf8->decode(scalar <$fh>);
}

# The step-0 expected-failure ledger: the cases that fail on Perl today, each
# naming the rollout step that removes it. It may only shrink: an unlisted
# failure fails, and so does a listed case that now passes.
my $ledger = _read_json(File::Spec->catfile($vectors_dir, 'primitives-expected-failures.json'));
my %expected = %{ $ledger->{runtimes}{perl} // die "ledger has no \"perl\" runtime" };

my $bf = bless { c => undef, config => {}, backend => undef }, 'BarefootJS';

# One binding per op, to the BarefootJS helper compiled templates call. An
# op with no binding fails.
my %bindings = (
    truthy    => sub { $bf->truthy($_[0]) },
    to_number => sub { $bf->to_number($_[0]) },
    to_string => sub { $bf->to_string($_[0]) },
    get       => sub { $bf->get($_[0], $_[1]) },
    strict_eq => sub { $bf->strict_eq($_[0], $_[1]) },
    lt        => sub { $bf->lt($_[0], $_[1]) },
    le        => sub { $bf->le($_[0], $_[1]) },
    gt        => sub { $bf->gt($_[0], $_[1]) },
    ge        => sub { $bf->ge($_[0], $_[1]) },
    plus      => sub { $bf->plus($_[0], $_[1]) },
    neg       => sub { $bf->neg($_[0]) },
);

# One binding per op the Perl adapters can spell natively, to the native
# Perl operator: a test is Perl's own truthiness (`if`, `!`, `&&`, `||`,
# `?:`). It runs over the cases whose domain the two adapters' NATIVE_SAFE
# tables claim (primitives-native-safe.json, "perl": their union, since they
# share this operator; spec/js-primitive-semantics.md, "Conformance" item 3).
my %native_bindings = (
    truthy => sub { $_[0] ? !!1 : !!0 },
);

my $INF = 9**9**9;
my %SENTINEL = (
    'NaN'       => sub { $INF - $INF },
    'Infinity'  => sub { $INF },
    '-Infinity' => sub { -$INF },
    '-0'        => sub { -1 / $INF },
);

# Arguments keep JSON::PP booleans: the evaluator primitives the helpers
# delegate to read them as JS booleans. `$num` sentinels become doubles.
sub decode_arg {
    my ($v) = @_;
    return [ map { decode_arg($_) } @$v ] if ref $v eq 'ARRAY';
    if (ref $v eq 'HASH') {
        return $SENTINEL{ $v->{'$num'} }->() if keys %$v == 1 && exists $v->{'$num'};
        return { map { $_ => decode_arg($v->{$_}) } keys %$v };
    }
    return $v;
}

my ($total, $passed, %seen) = (0, 0);
for my $file (@files) {
    for my $case (@{ _read_json($file)->{cases} }) {
        my $key = "$case->{fn}/$case->{note}";
        $seen{$key} = 1;
        $total++;
        my ($ok, $detail) = run_case($case);
        $passed++ if $ok;
        if ($ok && $expected{$key}) {
            fail("ledger entry '$key' now passes; remove it from the ledger (step $expected{$key}{step})");
        } elsif (!$ok && !$expected{$key}) {
            fail("UNEXPECTED-FAIL $key: $detail");
        } else {
            pass($key . ($ok ? '' : " (expected failure, step $expected{$key}{step})"));
        }
    }
}
for my $key (sort keys %expected) {
    fail("ledger entry '$key' matches no primitives case — renamed note?") unless $seen{$key};
}

# Every native claim must give the JS answer on every case it covers; no
# ledger applies.
my $claims = _read_json(File::Spec->catfile($vectors_dir, 'primitives-native-safe.json'))->{runtimes}{perl}
    // die 'primitives-native-safe.json has no "perl" runtime';
my $native_ran = 0;
for my $fn (sort keys %$claims) {
    my $bind = $native_bindings{$fn};
    unless ($bind) {
        fail("no native Perl binding for '$fn' — add it to %native_bindings");
        next;
    }
    my %claimed = map { $_ => 1 } @{ $claims->{$fn} };
    for my $case (@{ _read_json(File::Spec->catfile($vectors_dir, 'primitives', "$fn.json"))->{cases} }) {
        next unless $claimed{ $case->{domain} };
        $native_ran++;
        my ($ok, $detail) = run_case($case, $bind);
        ok($ok, "native $case->{fn}/$case->{note} (domain $case->{domain})") or diag("NATIVE-FAIL: $detail");
    }
}
diag(sprintf('primitives: %d cases, %d pass, %d in the expected-failure ledger; %d native claimed cases',
    $total, $passed, scalar keys %expected, $native_ran));
done_testing;

sub run_case {
    my ($case, $bind) = @_;
    $bind //= $bindings{ $case->{fn} }
        or return (0, "no Perl binding for '$case->{fn}' — add it to %bindings");
    my @args = map { decode_arg($_) } @{ $case->{args} };
    my $got = eval { $bind->(@args) };
    return (0, "died: $@") if $@;
    return (1, '') if match($got, $case->{expect});
    return (0, 'got ' . explain_value($got) . ', want ' . explain_value($case->{expect}));
}

# The primitives contract on a host with no boolean type: a boolean expect
# accepts any non-reference scalar or JSON boolean by truthiness; a number
# expect needs a number (not a string) of the same double value, a zero of
# the same sign; a string expect needs a string.
sub match {
    my ($got, $expect) = @_;
    return !defined $got if !defined $expect;
    return 0 if !defined $got;
    if (ref $expect eq 'HASH' && keys %$expect == 1 && exists $expect->{'$num'}) {
        return match_number($got, $SENTINEL{ $expect->{'$num'} }->());
    }
    if (JSON::PP::is_bool($expect)) {
        return 0 if ref $got && !JSON::PP::is_bool($got);
        return (!!$got eq !!$expect) ? 1 : 0;
    }
    if (ref $expect eq 'ARRAY') {
        return 0 unless ref $got eq 'ARRAY' && @$got == @$expect;
        match($got->[$_], $expect->[$_]) or return 0 for 0 .. $#$expect;
        return 1;
    }
    if (ref $expect eq 'HASH') {
        return 0 unless ref $got eq 'HASH' && keys %$got == keys %$expect;
        exists $got->{$_} && match($got->{$_}, $expect->{$_}) or return 0 for keys %$expect;
        return 1;
    }
    return 0 if ref $got;
    return match_number($got, $expect) if BarefootJS::Evaluator::_is_number($expect);
    return (BarefootJS::Evaluator::_is_string($got) && $got eq $expect) ? 1 : 0;
}

sub match_number {
    my ($got, $want) = @_;
    return 0 if ref $got || !BarefootJS::Evaluator::_is_number($got);
    my ($g, $w) = (unpack('d', pack('d', $got)), unpack('d', pack('d', $want)));
    return ($g != $g) ? 1 : 0 if $w != $w;
    return 0 if $g != $w;
    return 1 if $w != 0;
    return (POSIX::signbit($g) ? 1 : 0) == (POSIX::signbit($w) ? 1 : 0) ? 1 : 0;
}

sub explain_value {
    my ($v) = @_;
    return 'undef' unless defined $v;
    return JSON::PP->new->canonical->allow_nonref->allow_blessed->convert_blessed->encode($v)
        if ref $v;
    return BarefootJS::Evaluator::_is_string($v) ? "'$v'" : sprintf('%.17g', $v);
}
