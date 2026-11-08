package VectorUndefined;
use strict;
use warnings;

# JS `undefined` in the golden vectors (spec/js-undefined-value.md, "JSON
# encoding for vectors"): the one-key `{"$undef": true}` sentinel, shared by
# the primitive, helper and eval vector harnesses of both Perl adapters.
#
# - in `args` and the evaluator `env` the sentinel decodes to `arg()`, the
#   runtime's undefined (`$BarefootJS::UNDEF`);
# - in an `expect` it matches only a value `runtime_undefined` accepts, also
#   inside nested arrays and hashes. A Perl `undef` is JS `null` and never
#   matches it.

use BarefootJS::Undefined ();

sub arg { return $BarefootJS::Undefined::UNDEF }

# Whether `$got` is the runtime's own undefined value.
sub runtime_undefined { return BarefootJS::Undefined::is_undefined($_[0]) }

# Whether a JSON-decoded value is `{"$undef": true}`.
sub is_sentinel { return BarefootJS::Undefined::is_undefined_sentinel($_[0]) }

# Replaces every `$undef` in an `args` / `env` value with `arg()`: the
# runtime's own manifest decoder.
sub to_arg { return BarefootJS::Undefined::decode_undefined($_[0]) }

1;
