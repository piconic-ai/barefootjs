package BarefootJS::Undefined;
our $VERSION = "0.41.2";
use strict;
use warnings;

# JS `undefined` (spec/js-undefined-value.md). Perl's `undef` is JS `null`;
# JS `undefined` is one singleton, `$BarefootJS::Undefined::UNDEF` (also
# `$BarefootJS::UNDEF`), created only where JS reads one: a missing key, an
# out-of-range index, `.at()` / `.find()` with no result, `?.` over a
# nullish receiver, the `undefined` identifier (`bf->undefined` in a
# template), an omitted declared prop. No decoded data is walked to convert
# anything.
#
# It is a blessed scalar reference with overloads, so Perl's own operators
# see it as JS sees `undefined` where they can:
#
# - `bool` is false: a native `if` / `unless` / `?:` / `!` reads it as falsy.
# - `""` is `''`: printed in a text or attribute position it renders nothing,
#   as JS renders `undefined` there.
# - `0+` is NaN: native arithmetic over it is NaN, as JS ToNumber.
# - `%{}` / `@{}` give a fresh empty hash / array, so a stray `->{k}` read or
#   an `@{...}` loop over it reads nothing instead of dying.
# - any method call (Kolon's `$x.k`, `$x.size()`) returns the singleton.
#
# It is NOT `undef`: Perl's `defined` is true for it and `//` keeps it. So
# every runtime and emitter site that means JS "nullish" tests through
# `is_nullish` below (or `$bf->is_nullish` in a template), never `defined` /
# `//`. A strict `=== null` is `is_null`, `=== undefined` is `is_undefined`.
#
# Identity is the class, not the address: a host's deep copy of a props
# structure (Storable's `dclone`, ...) keeps reading as `undefined`.
use overload
    'bool'   => sub { '' },
    '""'     => sub { '' },
    '0+'     => sub { my $inf = 9**9**9; $inf - $inf },
    '%{}'    => sub { +{} },
    '@{}'    => sub { [] },
    fallback => 1;

our $UNDEF = bless \(my $slot = undef), __PACKAGE__;

# The singleton survives a copy, and a constructor call returns it.
sub new { return $UNDEF }

# Any other method (Kolon's member and method syntax on an object) reads as
# `undefined` itself, as Kolon reads a member of `nil` as `nil`.
our $AUTOLOAD;
sub AUTOLOAD {
    return if $AUTOLOAD =~ /::DESTROY\z/;
    return $UNDEF;
}
sub DESTROY { }

# A host encoder that honours TO_JSON writes `null`; the runtime's own JSON
# walk follows `JSON.stringify` instead (a member holding it is dropped).
sub TO_JSON { return undef }

# JS `v === undefined`.
sub is_undefined { return ref($_[0]) eq __PACKAGE__ ? 1 : 0 }

# JS `v === null`: Perl's `undef`.
sub is_null { return defined($_[0]) ? 0 : 1 }

# JS `v == null`: `null` or `undefined`.
sub is_nullish { return (!defined($_[0]) || ref($_[0]) eq __PACKAGE__) ? 1 : 0 }

# Whether a JSON-decoded value is the `{"$undef": true}` sentinel, the
# manifest's (and the golden vectors') spelling of JS `undefined`
# (spec/js-undefined-value.md, "JSON encoding for vectors").
sub is_undefined_sentinel {
    my ($v) = @_;
    return 0 unless ref $v eq 'HASH' && keys %$v == 1 && exists $v->{'$undef'};
    return $v->{'$undef'} ? 1 : 0;
}

# `$v` with every sentinel, at any depth, replaced by `$UNDEF`; inside a
# hash it is a present key holding `undefined`. Every other hash key that
# begins with `$$` loses one leading `$`: the manifest encoder escapes a
# seed's own `$`-prefixed keys that way, so data shaped like the sentinel
# stays data.
sub decode_undefined {
    my ($v) = @_;
    return $UNDEF if is_undefined_sentinel($v);
    return [ map { decode_undefined($_) } @$v ] if ref $v eq 'ARRAY';
    if (ref $v eq 'HASH') {
        my %out;
        for my $k (keys %$v) {
            my $key = $k;
            $key = substr($key, 1) if index($key, '$$') == 0;
            $out{$key} = decode_undefined($v->{$k});
        }
        return \%out;
    }
    return $v;
}

1;
__END__

=encoding utf8

=head1 NAME

BarefootJS::Undefined - JS C<undefined> for the BarefootJS Perl runtime

=head1 SYNOPSIS

    use BarefootJS;

    my $u = $BarefootJS::UNDEF;               # JS undefined
    BarefootJS::Undefined::is_undefined($u);  # 1
    BarefootJS::Undefined::is_null(undef);    # 1 (Perl undef is JS null)
    BarefootJS::Undefined::is_nullish($u);    # 1

=head1 DESCRIPTION

Perl's C<undef> is JS C<null>. JS C<undefined> is the singleton
C<$BarefootJS::UNDEF>, which is false in boolean context, prints as C<''>,
numifies to NaN, and is C<defined> in Perl's sense. Test it with
C<is_undefined>, C<is_null> and C<is_nullish>, never with C<defined> or C<//>.

=cut
