package BarefootJS::SearchParams;
our $VERSION = "0.14.0";
use strict;
use warnings;
use utf8;
use feature 'signatures';
no warnings 'experimental::signatures';

# Request-scoped SSR view of the query string behind the reactive
# `searchParams()` environment signal (router v0.5, #1922). The framework
# integration builds one per request from the request URL and threads it into
# the template scope as `$searchParams` (the camelCase JS name the adapters
# keep, like every other signal/prop var); the compiled template reads it via
# `$searchParams->get('key')` (Mojo) / `$searchParams.get('key')` (Xslate).
#
# This runtime is template-engine- and framework-agnostic (core Perl only),
# matching the rest of BarefootJS.pm, so it can ship in the standalone
# @barefootjs/perl distribution.
#
# Semantics mirror the browser's URLSearchParams.get exactly under the
# adapters' `?? → //` lowering: get() returns the first value for a key, or
# `undef` when the key is absent. Perl's `//` (defined-or) coalesces only
# `undef`, so an absent key falls back to the author's default while a
# present-but-empty value (`?sort=`) keeps the empty string — the same
# distinction JS `??` draws between `null` and `''`. (This is a closer match
# than the Go adapter, whose `or` lowering also coalesces the empty string.)

# new($class, $query = '')
#
# Parse a raw query string into the reader. A leading '?' is tolerated, '+'
# decodes to a space, and %XX escapes are decoded — mirroring URLSearchParams's
# application/x-www-form-urlencoded parsing. A malformed pair never dies; it
# simply contributes nothing, matching the browser's lenient parsing.
sub new ($class, $query = '') {
    $query //= '';
    $query =~ s/\A\?//;
    my %values;
    for my $pair (split /[&;]/, $query) {
        next if $pair eq '';
        my ($key, $val) = split /=/, $pair, 2;
        $key = _decode($key);
        $val = defined $val ? _decode($val) : '';
        push @{ $values{$key} }, $val;
    }
    return bless { values => \%values }, $class;
}

# get($self, $key)
#
# First value for $key, or `undef` when the key is absent (see the package
# docstring for why `undef` — not '' — is the right "missing" sentinel under
# the `//` lowering). A present-but-empty value returns ''.
sub get ($self, $key) {
    my $vals = $self->{values}{$key};
    return undef unless $vals && @$vals;
    return $vals->[0];
}

sub _decode ($s) {
    $s //= '';
    $s =~ tr/+/ /;
    $s =~ s/%([0-9A-Fa-f]{2})/chr hex $1/ge;
    return $s;
}

1;
