use strict;
use warnings;

use Test2::V0;

use FindBin qw($Bin);
use Module::Metadata;

# PAUSE indexability of META's `provides`.
#
# Makefile.PL populates META_MERGE's `provides` from
# `Module::Metadata->provides`. A dist that ships `provides` makes PAUSE
# index from META instead of scanning the .pm files, and Module::Metadata
# reports the version of each package's *own* `our $VERSION` -- not the
# file's. A package declared inline in a file that already carries a
# $VERSION for a different package (BarefootJS::Date inside BarefootJS.pm)
# therefore lands in META with no version at all. PAUSE turns that into the
# literal string "undef", compares it against the version it indexed last
# release, and rejects the package with "Decreasing version number" -- so it
# silently freezes at whatever release last had a version, while every other
# package in the dist moves on. That is exactly what happened to
# BarefootJS::Date between 0.29.0 and 0.30.0.
#
# The file-scanning fallback masks this: it hands every package in a file the
# file's $VERSION, which is why the problem only appeared once `provides` was
# added. Guard the invariant here rather than at release time.

my $provides = Module::Metadata->provides(version => 2, dir => "$Bin/../lib");

ok(%$provides, 'META provides lists at least one package');

my %by_version;
for my $pkg (sort keys %$provides) {
    my $version = $provides->{$pkg}{version};
    ok(
        defined $version && length $version,
        "$pkg declares its own \$VERSION (in $provides->{$pkg}{file})",
    ) or diag(
        "Add `our \$VERSION = \"<dist version>\";` to `package $pkg;`.\n"
      . "A literal is required: Module::Metadata evaluates the version line\n"
      . "in a Safe compartment, so `\$Some::Other::VERSION` collapses to 0."
    );
    push @{ $by_version{ defined $version ? $version : '(undef)' } }, $pkg;
}

is(
    scalar keys %by_version,
    1,
    'every package in provides carries the same $VERSION',
) or diag(
    join "\n",
    map { "  $_: " . join(', ', @{ $by_version{$_} }) } sort keys %by_version
);

done_testing;
