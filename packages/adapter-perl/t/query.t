use Test2::V0;
use utf8;

# BarefootJS->query — the `queryHref(base, { … })` URL-query builder helper
# (#2042).
#
# The full CROSS-BACKEND behaviour (control flow + form-encoding parity with the
# browser's URLSearchParams) is defined ONCE in the shared golden helper vectors
# — packages/adapter-tests/vectors/vectors.json, fn "query" — and run
# here by t/helper_vectors.t and by the Go runtime's TestHelperVectors, so the
# Perl and Go expectations can't drift apart.
#
# This file keeps a few representative cases for always-on coverage (the golden
# file is monorepo-only, absent from the CPAN dist) plus the Perl-runtime-
# SPECIFIC defensive behaviour the golden vectors can't express: an `undef`
# value. JSON has no `undefined`, and a JSON `null` stringifies to "null" under
# JS `String()`, so it can't be a shared vector; Perl coerces `undef` to '' and
# omits the empty pair.

use FindBin qw($Bin);
use lib "$Bin/../lib";

use BarefootJS;

# `query` is a pure helper (no backend / controller), so a bare blessed stub is
# enough — mirroring t/helper_vectors.t. Triples are (include, key, value).
my $bf = bless {}, 'BarefootJS';

# Representative control flow: a repeated key overwrites at its first position
# (URLSearchParams.set), surrounding order preserved.
is $bf->query('/blog', 1, 'sort', 'title', 1, 'tag', 'go', 1, 'sort', 'date'),
    '/blog?sort=date&tag=go', 'order preserved, repeated key overwrites at first position';

# Representative form-encoding: space → '+', '~' → %7E, '*' kept (URLSearchParams,
# not Go's url.QueryEscape).
is $bf->query('/s', 1, 't', 'a~b *c'), '/s?t=a%7Eb+*c', 'form-encode: ~ → %7E, * kept, space → +';

# Representative array value: an array ref appends one pair per non-empty member
# (#2048), skipping empties.
is $bf->query('/list', 1, 'tag', ['a', '', 'b']), '/list?tag=a&tag=b',
    'array value appends a pair per non-empty member';

# Perl-specific: an `undef` value is coerced to '' and then omitted, without
# disturbing the surrounding pairs.
is $bf->query('/list', 1, 'tag', undef), '/list', 'undef value coerced to empty → omitted';
is $bf->query('/list', 1, 'tag', undef, 1, 'keep', 'me'), '/list?keep=me',
    'undef value dropped, surrounding pairs intact';

done_testing;
