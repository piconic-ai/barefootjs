"""JS `undefined` in the golden vectors (spec/js-undefined-value.md, "JSON
encoding for vectors"): the one-key `{"$undef": true}` sentinel, shared by the
primitive, helper and eval vector harnesses.

The Python runtime has no undefined value yet (rollout step U2 adds it), so
for now:

- in `args` and the evaluator `env` the sentinel decodes to
  `VECTOR_UNDEFINED_ARG`, the host nil a template receives for `undefined`
  today;
- in an `expect` it matches only a value `is_runtime_undefined` accepts. None
  exists yet, so it never matches, also inside nested lists and dicts, and
  every such case is listed in an expected-failure ledger or pinned as a
  divergence.

U2 flips both here: `VECTOR_UNDEFINED_ARG` becomes the runtime's undefined and
`is_runtime_undefined` recognizes it.
"""

from __future__ import annotations

import json

VECTOR_UNDEFINED_ARG = None


def is_runtime_undefined(got) -> bool:
    """Whether `got` is the runtime's own undefined value (none yet: U2)."""
    return False


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


def load_expected_failures(path: str) -> dict:
    """The "python" runtime of an expected-failure ledger: case key -> entry."""
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)["runtimes"]["python"]
