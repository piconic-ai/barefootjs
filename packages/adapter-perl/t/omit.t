use Test2::V0;

# omit — object-rest residual runtime helper for a `.map()` destructure
# binding (`{ id, ...rest } => …`, #2087 Phase B). Both the Mojo and Xslate
# template adapters lower an object-rest binding to `bf->omit($parent,
# [...excluded keys...])` / `$bf.omit($parent, [...])` so the residual is a
# TRUE hashref (not the whole item aliased) — `rest.flag` and `{...rest}`
# both read from the same real value. See packages/adapter-perl/lib/BarefootJS.pm.

use FindBin qw($Bin);
use lib "$Bin/../lib";

use BarefootJS;

# Minimal pure-Perl backend: `omit` never reaches the backend (no
# mark_raw / escaping — it returns a plain hashref, not markup).
{
    package PureBackend;
    sub new { bless {}, shift }
}

my $bf = bless { c => undef, config => {}, backend => PureBackend->new }, 'BarefootJS';

subtest 'basic shapes' => sub {
    is $bf->omit(undef, []), {}, 'undef bag -> empty hashref';
    is $bf->omit('not a hash', []), {}, 'non-hash scalar -> empty hashref';
    is $bf->omit({}, []), {}, 'empty bag -> empty hashref';
    is $bf->omit({ id => 'a', title => 'b' }, []),
       { id => 'a', title => 'b' },
       'no excluded keys -> full copy';
};

subtest 'excludes named keys' => sub {
    is $bf->omit({ id => 't1', title => 'one', flag => 'a' }, ['id', 'title']),
       { flag => 'a' },
       'excludes the destructured sibling keys, keeps the rest';
    is $bf->omit({ id => 't1' }, ['id', 'title']),
       {},
       'excluding a key absent from the bag is a no-op for that key';
};

subtest 'non-identifier keys (rest-spread-onto-element shape)' => sub {
    # Mirrors the `rest-destructure-object-spread-in-map` fixture:
    # `{ id, title, ...rest }` with a hyphenated sibling key
    # (`'data-priority'`) surviving into the residual untouched.
    is $bf->omit(
        { id => 't1', title => 'one', 'data-priority' => 'high', tag => 'urgent' },
        ['id', 'title'],
    ),
       { 'data-priority' => 'high', tag => 'urgent' },
       'non-identifier keys pass through the residual unchanged';
};

subtest 'returns a new hashref (no aliasing)' => sub {
    my $bag = { id => 'a', flag => 'x' };
    my $rest = $bf->omit($bag, ['id']);
    $rest->{flag} = 'mutated';
    is $bag->{flag}, 'x', 'mutating the residual does not affect the source bag';
};

done_testing;
