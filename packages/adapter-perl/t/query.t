use Test2::V0;
use utf8;

# BarefootJS->query — the `queryHref(base, { … })` URL-query builder helper
# (#2042). The cross-language VALUE semantics (truthy-omit over strings,
# `URLSearchParams.set` overwrite, form-encoding) must equal the browser /
# Hono render the SSR is compared against, so the expected strings below are the
# `URLSearchParams`-serialised forms.

use FindBin qw($Bin);
use lib "$Bin/../lib";

use BarefootJS;

# `query` is a pure helper (no backend / controller), so a bare blessed stub is
# enough — mirroring t/helper_vectors.t.
my $bf = bless {}, 'BarefootJS';

# Triples are (guard, key, value); the adapter passes guard `1` for a plain
# `key: v` and the lowered condition for `key: cond ? v : undefined`.

is $bf->query('/list'), '/list', 'no params → bare base';
is $bf->query('/list', 1, 'tag', 'go'), '/list?tag=go', 'single pair';
is $bf->query('/list', 1, 'tag', ''), '/list', 'empty value omitted (truthy-omit)';
is $bf->query('/list', 1, 'sort', 'name', 1, 'tag', 'go'),
    '/list?sort=name&tag=go', 'two pairs, in order';

# guard false (a `cond ? v : undefined` whose cond is false) drops the pair.
is $bf->query('/list', 0, 'sort', 'x', 1, 'tag', 'go'),
    '/list?tag=go', 'falsy guard drops the pair';
# guard true but value empty → still omitted (matches `if (cond ? '' : undefined)`).
is $bf->query('/list', 1, 'sort', ''), '/list', 'truthy guard, empty value → omitted';

# `URLSearchParams.set` overwrite: a repeated key keeps its first position,
# last value.
is $bf->query('/p', 1, 'k', 'v', 1, 'k', 'w'), '/p?k=w', 'repeated key overwrites at first position';

# Form-encoding parity with URLSearchParams: space → '+', '&' → %26, '~' → %7E,
# '*' kept.
is $bf->query('/s', 1, 'q', 'a b', 1, 'x y', 'c&d'),
    '/s?q=a+b&x+y=c%26d', 'space → + and & → %26';
is $bf->query('/s', 1, 't', 'a~b*c'), '/s?t=a%7Eb*c', '~ → %7E, * kept (URLSearchParams set)';

# UTF-8 is encoded byte-wise.
is $bf->query('/s', 1, 'q', 'café'), '/s?q=caf%C3%A9', 'UTF-8 byte-encoded';

# undef value / undef key are coerced to '' (and an empty value is omitted).
is $bf->query('/list', 1, 'tag', undef), '/list', 'undef value omitted';

done_testing;
