use strict;
use warnings;
# Probe runner (Perl evaluator, shared by mojo/xslate). Reads $PROBE_VECTORS.
# See ../README.md.
use FindBin;
use JSON::PP ();
use B ();
use Scalar::Util qw(looks_like_number);
use lib "$FindBin::Bin/../../../../adapter-perl/lib";
use BarefootJS::Evaluator;

binmode STDOUT, ':encoding(UTF-8)'; # non-ASCII case notes (café, 日本, ...) print raw below

my $doc = do {
    open my $fh, '<:raw', $ENV{PROBE_VECTORS} or die $!;
    local $/;
    # ->utf8 decodes the file's UTF-8 bytes into Perl characters (see
    # eval_vectors.t's identical fix, #2196) — without it, the STRS corpus's
    # non-ASCII values (café, 日本, ...) arrive as mojibake, masking whether
    # Evaluator.pm's `.length` fix actually agrees with JS on codepoints.
    JSON::PP->new->utf8->decode(scalar <$fh>);
};

sub _is_real_number {
    my ($v) = @_;
    return 0 unless defined $v && !ref $v;
    return (B::svref_2object(\$v)->FLAGS & (B::SVf_IOK | B::SVf_NOK)) ? 1 : 0;
}
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
        return 0 unless JSON::PP::is_bool($got);
        return (!!$got eq !!$expect) ? 1 : 0;
    }
    if (ref $expect eq 'ARRAY') {
        return 0 unless ref $got eq 'ARRAY' && @$got == @$expect;
        _match($got->[$_], $expect->[$_]) or return 0 for 0 .. $#$expect;
        return 1;
    }
    if (ref $expect eq 'HASH') {
        return 0 unless ref $got eq 'HASH' && keys %$got == keys %$expect;
        for my $k (keys %$expect) { return 0 unless exists $got->{$k}; _match($got->{$k}, $expect->{$k}) or return 0; }
        return 1;
    }
    return 0 if !defined $got || ref $got;
    my $want_num = _is_real_number($expect);
    return 0 if $want_num != _is_real_number($got);
    return ($got == $expect ? 1 : 0) if $want_num;
    return ($got eq $expect) ? 1 : 0;
}
sub explain {
    my ($v) = @_;
    return 'undef' unless defined $v;
    return JSON::PP->new->canonical->allow_nonref->allow_blessed->convert_blessed->encode($v) if ref $v;
    return "'$v'";
}

my $n = 0;
for my $c (@{ $doc->{cases} }) {
    $n++;
    my $got = eval { BarefootJS::Evaluator::evaluate($c->{expr}, $c->{env} // {}) };
    if (my $err = $@) {
        chomp $err;
        print "ERROR\t$c->{category}\t$c->{note}\t$err\n";
        next;
    }
    unless (_match($got, $c->{expect})) {
        my $kind = $c->{known} ? 'KNOWN' : 'NEW';
        print "$kind\t$c->{category}\t$c->{note}\t" . explain($got) . "\t" . explain($c->{expect}) . "\n";
    }
}
print "RAN\t$n\n";
