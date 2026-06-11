use strict;
use warnings;
use Test::More;
use FindBin;
use File::Spec;
use JSON::PP ();
use Scalar::Util qw(looks_like_number);

use lib "$FindBin::Bin/../lib";
use BarefootJS;

# Pure-Perl backend (core JSON::PP only) so this test runs with zero
# Mojo present — same pattern as t/template_primitives.t.
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

    string => sub { $bf->string($_[0]) },
    json   => sub { $bf->json($_[0]) },
    number => sub { $bf->number($_[0]) },
    floor  => sub { $bf->floor($_[0]) },
    ceil   => sub { $bf->ceil($_[0]) },
    round  => sub { $bf->round($_[0]) },

    # The Mojo renderer emits native lc()/uc(); Xslate emits $bf.lc /
    # $bf.uc. The helper methods wrap CORE::lc/uc, so binding them
    # covers both shapes at value level.
    lower       => sub { $bf->lc($_[0]) },
    upper       => sub { $bf->uc($_[0]) },
    trim        => sub { $bf->trim($_[0]) },
    starts_with => sub { $bf->starts_with(@_) },
    ends_with   => sub { $bf->ends_with(@_) },
    replace     => sub { $bf->replace(@_) },
    repeat      => sub { $bf->repeat(@_) },
    pad_start   => sub { $bf->pad_start(@_) },
    pad_end     => sub { $bf->pad_end(@_) },
    split       => sub { $bf->split(@_) },

    len           => sub { $bf->length($_[0]) },
    at            => sub { $bf->at(@_) },
    includes      => sub { $bf->includes(@_) },
    index_of      => sub { $bf->index_of(@_) },
    last_index_of => sub { $bf->last_index_of(@_) },
    concat        => sub { $bf->concat(@_) },
    # The Mojo emit always passes three value args (`undef` for an
    # absent end) — mirror that exact shape.
    slice   => sub { $bf->slice($_[0], $_[1], $_[2]) },
    reverse => sub { $bf->reverse($_[0]) },
    flat    => sub { $bf->flat(@_) },
    join    => sub { $bf->join(@_) },
    # Array literals are native arrayrefs on the Perl backends.
    arr => sub { [@_] },
    # Mirrors the Mojo inline `[grep { $_ } @{...}]` for filter(Boolean).
    filter_truthy => sub { [grep { $_ } @{ $_[0] }] },

    # Higher-order entries arrive in the canonical projection form
    # (spec: items + field [+ value]); the closures below rebuild the
    # predicate the adapters compile (`i => i.field === value`,
    # `i => i.field`), choosing eq vs == by the probe's string-typing
    # the same way the Mojo emitter does.
    every  => sub { $bf->every($_[0],  _truthy_pred($_[1])) },
    some   => sub { $bf->some($_[0],   _truthy_pred($_[1])) },
    filter => sub { $bf->filter($_[0], _field_eq_pred($_[1], $_[2])) },
    find   => sub { $bf->find($_[0],   _field_eq_pred($_[1], $_[2])) },
    find_index      => sub { $bf->find_index($_[0],      _field_eq_pred($_[1], $_[2])) },
    find_last       => sub { $bf->find_last($_[0],       _field_eq_pred($_[1], $_[2])) },
    find_last_index => sub { $bf->find_last_index($_[0], _field_eq_pred($_[1], $_[2])) },

    sort => sub {
        my ($recv, @spec) = @_;
        my @keys;
        while (@spec >= 4) {
            my ($kind, $name, $ct, $dir) = splice(@spec, 0, 4);
            push @keys, {
                key_kind     => $kind,
                key          => $name,
                compare_type => $ct,
                direction    => $dir,
            };
        }
        return $bf->sort($recv, { keys => \@keys });
    },
    reduce => sub {
        my ($recv, $op, $key_kind, $key, $type, $init, $direction) = @_;
        return $bf->reduce($recv, {
            op        => $op,
            key_kind  => $key_kind,
            key       => $key,
            type      => $type,
            init      => $init,
            direction => $direction,
        });
    },
    flat_map       => sub { $bf->flat_map(@_) },
    flat_map_tuple => sub {
        my ($recv, @flat) = @_;
        my @specs;
        while (@flat >= 2) {
            my ($kind, $name) = splice(@flat, 0, 2);
            push @specs, [$kind, $name];
        }
        return $bf->flat_map_tuple($recv, @specs);
    },
);

sub _truthy_pred {
    my ($field) = @_;
    return sub { ref $_[0] eq 'HASH' ? $_[0]{$field} : undef };
}

sub _field_eq_pred {
    my ($field, $value) = @_;
    my $get = sub { ref $_[0] eq 'HASH' ? $_[0]{$field} : undef };
    return looks_like_number($value)
        ? sub { my $v = $get->($_[0]); defined $v && $v == $value }
        : sub { my $v = $get->($_[0]); defined $v && $v eq $value };
}

for my $case (@{ $doc->{cases} }) {
    my ($fn, $note) = @{$case}{qw(fn note)};
    my $bind = $bindings{$fn};
    if (!$bind) {
        fail("no Perl binding for helper '$fn' — add it to %bindings in $0");
        next;
    }
    my @args = map { normalize_arg($_) } @{ $case->{args} };
    vector_ok($bind->(@args), $case->{expect}, "$fn: $note");
}

done_testing;

# Spec value-compat contract: numbers compare numerically (JSON::PP
# decodes vector numbers to IV/NV, `==` compares the values), booleans
# by truthiness, everything else structurally. Arrays currently go
# through is_deeply (string compare per element) — refine to a
# recursive numeric walk when the first float-array vector lands.
# Production Perl template data has no boolean type — the adapters pass
# 1/0 where JS has true/false — so JSON::PP boolean objects in vector
# ARGS are lowered to 1/0 before reaching a binding. Expects keep their
# boolean identity (vector_ok compares those by truthiness).
sub normalize_arg {
    my ($v) = @_;
    return [ map { normalize_arg($_) } @$v ] if ref $v eq 'ARRAY';
    return { map { $_ => normalize_arg($v->{$_}) } keys %$v } if ref $v eq 'HASH';
    return JSON::PP::is_bool($v) ? ($v ? 1 : 0) : $v;
}

sub vector_ok {
    my ($got, $expect, $label) = @_;
    if (!defined $expect) {
        return is($got, undef, $label);
    }
    # Reserved non-finite sentinel (spec/template-helpers.md):
    # {"$num": "NaN" | "Infinity" | "-Infinity"}. NaN is the only value
    # for which `$x != $x` holds.
    if (ref $expect eq 'HASH' && exists $expect->{'$num'}) {
        my $kind = $expect->{'$num'};
        return ok($got != $got, "$label (NaN)") if $kind eq 'NaN';
        my $inf = 9**9**9;
        return cmp_ok($got, '==', $kind eq 'Infinity' ? $inf : -$inf, $label);
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
