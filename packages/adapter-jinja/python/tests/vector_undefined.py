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
from barefootjs.evaluator import decode_undefined
from barefootjs.evaluator import is_undef_sentinel as _runtime_is_undef_sentinel

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
    return value is UNDEFINED_EXPECT or _runtime_is_undef_sentinel(value)


def undefined_to_arg(value):
    """Replace every `$undef` in an `args` / `env` value with `VECTOR_UNDEFINED_ARG`.
    A raw JSON tree goes through the runtime's own manifest decoder
    (`decode_undefined`); a harness that decoded first carries the marker."""
    if value is UNDEFINED_EXPECT:
        return VECTOR_UNDEFINED_ARG
    if isinstance(value, list):
        return [undefined_to_arg(v) for v in value]
    if isinstance(value, dict) and not _runtime_is_undef_sentinel(value):
        return {k: undefined_to_arg(v) for k, v in value.items()}
    return decode_undefined(value)

