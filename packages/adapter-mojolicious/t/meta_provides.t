use strict;
use warnings;

use Test2::V0;

use FindBin qw($Bin);
use Module::Metadata;

# PAUSE indexability of META's `provides`.
#
# Makefile.PL populates META_MERGE's `provides` from
# `Module::Metadata->provides`, and shipping `provides` makes PAUSE index
# from META instead of scanning the .pm files. Module::Metadata reports the
# version of each package's *own* `our $VERSION`, so a package declared
# inline in a file that carries a $VERSION for a different package lands in
# META with no version; PAUSE turns that into the string "undef", reads it as
# a decreasing version number against the last indexed release, and freezes
# the package out of the index. BarefootJS::Date hit this between 0.29.0 and
# 0.30.0 -- see packages/adapter-perl/t/meta_provides.t for the full story.
# This dist shares the same Makefile.PL pattern, so it guards the same
# invariant.

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
