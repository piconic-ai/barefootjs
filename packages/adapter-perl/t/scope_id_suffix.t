use Test2::V0;

# BarefootJS::scope_id_suffix — the random `<Template>_<suffix>` part of a
# scope id that has no slot to derive from. The old inline form,
# `substr(rand() =~ s/^0\.//r, 0, 6)`, put a `.` into the id whenever Perl
# stringified a small `rand()` in exponent form (`3.2247e-05` -> `3.2247`),
# e.g. `TableRow_3.2247`.

use FindBin qw($Bin);
use lib "$Bin/../lib";

# Replace `rand` before BarefootJS.pm is compiled, so its calls see the stub.
our $RAND;
BEGIN {
    *CORE::GLOBAL::rand = sub { defined $RAND ? (@_ ? $_[0] : 1) * $RAND : CORE::rand(@_ ? $_[0] : 1) };
}

use BarefootJS;

subtest 'a small rand() still gives six digits' => sub {
    local $RAND = 3.2247e-05;
    is "$RAND", '3.2247e-05', 'the stub value stringifies in exponent form';
    is BarefootJS::scope_id_suffix(), '000032', 'zero-padded, no dot';
};

subtest 'boundary values' => sub {
    local $RAND = 0;
    is BarefootJS::scope_id_suffix(), '000000', 'rand() == 0';
    $RAND = 0.9999999;
    is BarefootJS::scope_id_suffix(), '999999', 'rand() just below 1';
};

subtest 'real rand() always matches /^\d{6}$/' => sub {
    local $RAND;
    my @bad = grep { $_ !~ /\A\d{6}\z/ } map { BarefootJS::scope_id_suffix() } 1 .. 10_000;
    is \@bad, [], 'no malformed suffix in 10k draws';
};

done_testing;
