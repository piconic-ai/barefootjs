package VectorUndefined;
use strict;
use warnings;

# JS `undefined` in the golden vectors (spec/js-undefined-value.md, "JSON
# encoding for vectors"): the one-key `{"$undef": true}` sentinel, shared by
# the primitive, helper and eval vector harnesses of both Perl adapters.
#
# The Perl runtime has no undefined value yet (rollout step U5 adds it), so
# for now:
#
# - in `args` and the evaluator `env` the sentinel decodes to `arg()`, the
#   host nil (undef) a template receives for `undefined` today;
# - in an `expect` it matches only a value `runtime_undefined` accepts. None
#   exists yet, so it never matches, also inside nested arrays and hashes,
#   and every such case is listed in an expected-failure ledger or pinned as
#   a divergence.
#
# U5 flips both here: `arg()` returns the runtime's undefined and
# `runtime_undefined` recognizes it.

sub arg { return undef }

# Whether `$got` is the runtime's own undefined value (none yet: U5).
sub runtime_undefined { return 0 }

# Whether a JSON-decoded value is `{"$undef": true}`.
sub is_sentinel {
    my ($v) = @_;
    return 0 unless ref $v eq 'HASH' && keys %$v == 1 && exists $v->{'$undef'};
    return $v->{'$undef'} ? 1 : 0;
}

# Replaces every `$undef` in an `args` / `env` value with `arg()`.
sub to_arg {
    my ($v) = @_;
    return arg() if is_sentinel($v);
    return [ map { to_arg($_) } @$v ] if ref $v eq 'ARRAY';
    return { map { $_ => to_arg($v->{$_}) } keys %$v } if ref $v eq 'HASH';
    return $v;
}

1;
