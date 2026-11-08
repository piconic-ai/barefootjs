"""JS `undefined` in the golden vectors (spec/js-undefined-value.md, "JSON
encoding for vectors"): the one-key `{"$undef": true}` sentinel, shared by the
primitive, helper and eval vector harnesses.

- In `args` and the evaluator `env` the sentinel decodes to
  `VECTOR_UNDEFINED_ARG`, the runtime's `UNDEF` (rollout step U2), which a
  template receives for `undefined`.
- In an `expect` it matches only a value `is_runtime_undefined` accepts: the
  runtime's `UNDEF`, also inside nested lists and dicts.
"""

from __future__ import annotations

from barefootjs import UNDEF, is_undefined

VECTOR_UNDEFINED_ARG = UNDEF


def is_runtime_undefined(got) -> bool:
    """Whether `got` is the runtime's own undefined value."""
    return is_undefined(got)


class _UndefinedExpect:
    """The decoded `$undef` of an expect, for harnesses that decode first."""

    def __repr__(self) -> str:
        return "<$undef>"


UNDEFINED_EXPECT = _UndefinedExpect()


def is_undef_sentinel(value) -> bool:
    """Whether a JSON-decoded value is `{"$undef": true}` (or its decoded marker)."""
    if value is UNDEFINED_EXPECT:
        return True
    return isinstance(value, dict) and len(value) == 1 and value.get("$undef") is True


def undefined_to_arg(value):
    """Replace every `$undef` in an `args` / `env` value with `VECTOR_UNDEFINED_ARG`."""
    if is_undef_sentinel(value):
        return VECTOR_UNDEFINED_ARG
    if isinstance(value, list):
        return [undefined_to_arg(v) for v in value]
    if isinstance(value, dict):
        return {k: undefined_to_arg(v) for k, v in value.items()}
    return value

