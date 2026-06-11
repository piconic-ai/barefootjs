use strict;
use warnings;
use Test::More;
use FindBin;
use File::Spec;
use JSON::PP ();
use Scalar::Util qw(looks_like_number);

# Golden helper vectors generated from the JS reference implementations
# (spec/template-helpers.md in the monorepo). The file is not shipped in
# the CPAN dist — packages/adapter-tests only exists in a monorepo
# checkout — so skip everywhere else.
my $vectors_path = File::Spec->catfile(
    $FindBin::Bin, '..', '..', 'adapter-tests', 'helper-vectors', 'vectors.json'
);
plan skip_all => 'golden vectors not available outside the monorepo checkout'
    unless -e $vectors_path;

my $doc = do {
    open my $fh, '<:raw', $vectors_path or die "open $vectors_path: $!";
    local $/;
    JSON::PP->new->decode(<$fh>);
};

# One binding per canonical helper id in the spec catalogue, bound to
# the exact code shape compiled templates execute on the Perl backends.
# Where the adapters lower an operation to a native Perl operator
# (mojo-adapter.ts maps JSX `+` straight to Perl `+`), the binding IS
# that operator rather than a BarefootJS.pm method. Per the spec, a
# vector with no binding here fails the test — the Perl backend must
# not silently fall behind the catalogue.
my %bindings = (
    add => sub { $_[0] + $_[1] },
    sub => sub { $_[0] - $_[1] },
    mul => sub { $_[0] * $_[1] },
    div => sub { $_[0] / $_[1] },
    mod => sub { $_[0] % $_[1] },
    neg => sub { -$_[0] },
);

for my $case (@{ $doc->{cases} }) {
    my ($fn, $note) = @{$case}{qw(fn note)};
    my $bind = $bindings{$fn};
    if (!$bind) {
        fail("no Perl binding for helper '$fn' — add it to %bindings in $0");
        next;
    }
    vector_ok($bind->(@{ $case->{args} }), $case->{expect}, "$fn: $note");
}

done_testing;

# Spec value-compat contract: numbers compare numerically (JSON::PP
# decodes vector numbers to IV/NV, `==` compares the values), booleans
# by truthiness, everything else structurally. Arrays currently go
# through is_deeply (string compare per element) — refine to a
# recursive numeric walk when the first float-array vector lands.
sub vector_ok {
    my ($got, $expect, $label) = @_;
    if (!defined $expect) {
        return is($got, undef, $label);
    }
    if (JSON::PP::is_bool($expect)) {
        return is(!!$got, !!$expect, $label);
    }
    if (ref $expect) {
        return is_deeply($got, $expect, $label);
    }
    if (looks_like_number($expect)) {
        return cmp_ok($got, '==', $expect, $label);
    }
    return is($got, $expect, $label);
}
