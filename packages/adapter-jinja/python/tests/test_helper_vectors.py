"""Golden helper-vector conformance, ported from
packages/adapter-perl/t/helper_vectors.t.

Runs `packages/adapter-tests/helper-vectors/vectors.json` -- generated from
the JS reference implementations (spec/template-helpers.md) -- against this
package's `BarefootJS` runtime. One binding per canonical helper id in the
spec catalogue, bound to the exact code shape a compiled Jinja template
would execute (a `bf.<method>(...)` call, or the native Python operator the
adapter emits for `add`/`sub`/`mul`/`div`/`neg`, mirroring how
`helper_vectors.t` binds those to native Perl operators).

Per spec/template-helpers.md's "Adapter status model", this file is the
single source of truth for this backend's divergences from the JS-normative
expect -- keyed by `fn/note`, mirroring the Perl harness's `%DIVERGENCES`
table exactly in spirit (values differ where Python's actual behaviour
differs from Perl's).

Skipped everywhere the golden vectors file isn't available (i.e. outside a
monorepo checkout), matching the Perl/Go harnesses' `skip_all` policy.
"""

from __future__ import annotations

import json
import math
import os
import unittest

from barefootjs import BarefootJS
from barefootjs.backend_jinja import default_json_encoder

VECTORS_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "..", "adapter-tests", "helper-vectors", "vectors.json"
)


class _PureBackend:
    """Pure-Python backend (no Jinja Environment needed) -- `json` is the
    only helper that reaches the backend."""

    def encode_json(self, data):
        return default_json_encoder(data)

    def mark_raw(self, s):
        return s

    def materialize(self, value):
        return value() if callable(value) else value

    def render_named(self, *args, **kwargs):
        return ""


bf = BarefootJS(None, {"backend": _PureBackend()})


def _truthy_pred(field):
    return lambda item: item.get(field) if isinstance(item, dict) else None


def _field_eq_pred(field, value):
    # Python's `==` already distinguishes JS-typed operands correctly
    # (int 2 != str "2"), unlike Perl's `eq`-based approach which needed a
    # looks_like_number dispatch to fake the distinction -- see the
    # runtime.py module docstring's `includes` divergence note.
    return lambda item: isinstance(item, dict) and item.get(field) == value


def _bind_sort(recv, *spec):
    keys = []
    spec = list(spec)
    while len(spec) >= 4:
        kind, name, compare_type, direction = spec[:4]
        spec = spec[4:]
        keys.append(
            {"key_kind": kind, "key": name, "compare_type": compare_type, "direction": direction}
        )
    return bf.sort(recv, {"keys": keys})


def _bind_reduce(recv, op, key_kind, key, rtype, init, direction):
    seed = float(init) if rtype == "numeric" else init
    return bf.reduce(
        recv,
        {"op": op, "key_kind": key_kind, "key": key, "type": rtype, "init": seed, "direction": direction},
    )


def _bind_flat_map_tuple(recv, *flat):
    flat = list(flat)
    specs = []
    while len(flat) >= 2:
        specs.append((flat[0], flat[1]))
        flat = flat[2:]
    return bf.flat_map_tuple(recv, *specs)


# One binding per canonical helper id. `add`/`sub`/`mul`/`div`/`neg` are not
# BarefootJS methods (matching the Perl port -- the adapter lowers JS
# `+`/`-`/`*`/`/`/unary `-` to the native template-language operator, not a
# `bf.` call); `mod` DOES route through `bf.mod` since the plan requires the
# Jinja emitter to use `bf.mod` for JS `%` (Python `%` differs from JS `%` on
# negative operands, unlike native `+`/`-`/`*`/`/`).
BINDINGS = {
    "add": lambda a, b: a + b,
    "sub": lambda a, b: a - b,
    "mul": lambda a, b: a * b,
    "div": lambda a, b: a / b,
    "mod": lambda a, b: bf.mod(a, b),
    "neg": lambda a: -a,
    "string": bf.string,
    "json": bf.json,
    "number": bf.number,
    "floor": bf.floor,
    "ceil": bf.ceil,
    "round": bf.round,
    "to_fixed": lambda *a: bf.to_fixed(*a),
    "lower": bf.lc,
    "upper": bf.uc,
    "trim": bf.trim,
    "starts_with": lambda *a: bf.starts_with(*a),
    "ends_with": lambda *a: bf.ends_with(*a),
    "replace": lambda *a: bf.replace(*a),
    "repeat": lambda *a: bf.repeat(*a),
    "pad_start": lambda *a: bf.pad_start(*a),
    "pad_end": lambda *a: bf.pad_end(*a),
    "split": lambda *a: bf.split(*a),
    "len": bf.length,
    "at": lambda *a: bf.at(*a),
    "includes": lambda *a: bf.includes(*a),
    "index_of": lambda *a: bf.index_of(*a),
    "last_index_of": lambda *a: bf.last_index_of(*a),
    "concat": lambda a, b: bf.concat(a, b),
    # The adapters always pass three value args (None for an absent end) --
    # mirror that exact shape, like helper_vectors.t does.
    "slice": lambda recv, start, end=None: bf.slice(recv, start, end),
    "reverse": bf.reverse,
    "flat": lambda *a: bf.flat(*a),
    "join": lambda *a: bf.join(*a),
    "arr": lambda *a: list(a),
    # Mirrors the JS `arr.filter(Boolean)` lowering, using JS truthiness.
    "filter_truthy": lambda arr: [x for x in arr if bf.truthy(x)],
    "search_params_get": lambda q, k: BarefootJS.search_params(q).get(k),
    "query": lambda *a: bf.query(*a),
    # Higher-order entries arrive in the canonical projection form (spec:
    # items + field [+ value]); rebuild the predicate the adapter compiles.
    "every": lambda items, field: bf.every(items, _truthy_pred(field)),
    "some": lambda items, field: bf.some(items, _truthy_pred(field)),
    "filter": lambda items, field, value: bf.filter(items, _field_eq_pred(field, value)),
    "find": lambda items, field, value: bf.find(items, _field_eq_pred(field, value)),
    "find_index": lambda items, field, value: bf.find_index(items, _field_eq_pred(field, value)),
    "find_last": lambda items, field, value: bf.find_last(items, _field_eq_pred(field, value)),
    "find_last_index": lambda items, field, value: bf.find_last_index(
        items, _field_eq_pred(field, value)
    ),
    "sort": _bind_sort,
    "reduce": _bind_reduce,
    "flat_map": lambda *a: bf.flat_map(*a),
    "flat_map_tuple": _bind_flat_map_tuple,
}

# Helper ids not implemented on this backend yet -- empty (this backend's
# catalogue is complete).
UNSUPPORTED: dict = {}

# Per-backend status declarations (spec/template-helpers.md "Adapter status
# model"). Forms:
#   {"expect": <value>}          assert the pinned value (exact, no numeric
#                                 coercion -- deliberately stricter than the
#                                 spec's value-compat `_match` so an int-vs-
#                                 float rounding accident can't hide behind
#                                 the comparison)
#   {"nan": True}                assert a real NaN result
#   {"raises": <ExceptionType>}  assert the call raises
DIVERGENCES = {
    "add/beyond the safe-integer edge rounds as a double": {
        "expect": 9007199254740993,
        "reason": "Python int arithmetic is exact (arbitrary precision), not double-rounded",
    },
    "div/zero divisor yields Infinity": {
        "raises": ZeroDivisionError,
        "reason": "Python native / raises ZeroDivisionError on a zero divisor",
    },
    "number/empty string coerces to 0": {
        "nan": True,
        "reason": "deliberate: empty input must not silently zero downstream arithmetic (matches the Perl port)",
    },
    "number/null coerces to 0": {
        "nan": True,
        "reason": "deliberate: unset props must not silently zero downstream arithmetic (matches the Perl port)",
    },
    'string/null renders as the string "null"': {
        "expect": "",
        "reason": "deliberate: an unset prop must not surface a literal \"null\" in HTML (matches the Perl port)",
    },
    "sort/localeCompare orders case-insensitively (ICU collation)": {
        "expect": ["B", "a"],
        "reason": "Python str comparison is codepoint order, not ICU collation",
    },
    "sort/relational compare on numeric strings is lexical": {
        "expect": ["9", "10"],
        "reason": 'the "auto" compare goes numeric when both keys look_like_number (Perl/Go parity)',
    },
    "reduce/numeric-string items concatenate under JS +": {
        "expect": 11.0,
        "reason": "numeric folds parse numeric strings instead of concatenating (Perl/Go parity)",
    },
}


def _match(got, expect):
    """Spec value-compat comparison against a JSON-decoded expect --
    sentinel hashes, booleans by truthiness, numbers numerically,
    arrays/hashes recursively."""
    if expect is None:
        return got is None
    if isinstance(expect, dict) and "$num" in expect:
        kind = expect["$num"]
        if isinstance(got, bool) or not isinstance(got, (int, float)):
            return False
        g = float(got)
        if kind == "NaN":
            return g != g
        inf = float("inf")
        return g == (inf if kind == "Infinity" else -inf)
    if isinstance(expect, bool):
        return bool(got) == expect
    if isinstance(expect, list):
        if not isinstance(got, list) or len(got) != len(expect):
            return False
        return all(_match(g, e) for g, e in zip(got, expect))
    if isinstance(expect, dict):
        if not isinstance(got, dict) or len(got) != len(expect):
            return False
        return all(k in got and _match(got[k], v) for k, v in expect.items())
    if got is None or isinstance(got, (list, dict)):
        return False
    if isinstance(expect, (int, float)) and not isinstance(expect, bool):
        if isinstance(got, bool) or not isinstance(got, (int, float)):
            return False
        # Exact comparison when both are Python `int` (JSON-integral values
        # decode to `int`): a float() cast would silently round a huge
        # integer to its nearest float64 and could mask a genuine mismatch
        # (e.g. the safe-integer-edge divergence, where the wrong exact int
        # happens to float-round to the right answer).
        if isinstance(got, int) and isinstance(expect, int):
            return got == expect
        return float(got) == float(expect)
    return got == expect


@unittest.skipUnless(os.path.exists(VECTORS_PATH), "golden vectors not available outside the monorepo checkout")
class HelperVectorsTest(unittest.TestCase):
    def test_vectors(self):
        with open(VECTORS_PATH, encoding="utf-8") as fh:
            doc = json.load(fh)

        self.assertTrue(doc["cases"], "vectors.json contains no cases")
        seen_declarations = set()

        for case in doc["cases"]:
            fn, note, args, expect = case["fn"], case["note"], case["args"], case["expect"]
            key = f"{fn}/{note}"
            with self.subTest(key=key):
                if fn in UNSUPPORTED:
                    self.skipTest(f"unsupported on this backend: {UNSUPPORTED[fn]}")
                    continue
                bind = BINDINGS.get(fn)
                self.assertIsNotNone(bind, f"no Python binding for helper '{fn}' -- add it to BINDINGS")

                divergence = DIVERGENCES.get(key)
                if divergence and divergence.get("raises"):
                    seen_declarations.add(key)
                    with self.assertRaises(
                        divergence["raises"],
                        msg=f"{key} (declared divergence: {divergence['reason']})",
                    ):
                        bind(*args)
                    continue

                try:
                    got = bind(*args)
                except Exception as exc:  # noqa: BLE001
                    self.fail(f"{key} raised unexpectedly: {exc!r}")
                    continue

                if divergence:
                    seen_declarations.add(key)
                    label = f"{key} (declared divergence: {divergence['reason']})"
                    self.assertFalse(
                        _match(got, expect),
                        f"stale divergence declaration for '{key}' -- the backend now matches JS; remove it",
                    )
                    if divergence.get("nan"):
                        self.assertTrue(
                            isinstance(got, float) and got != got,
                            f"{label}: got {got!r}, wanted real NaN",
                        )
                    else:
                        want = divergence["expect"]
                        if isinstance(want, (int, float)) and not isinstance(want, bool):
                            self.assertEqual(got, want, label)
                        else:
                            self.assertEqual(got, want, label)
                    continue

                self.assertTrue(_match(got, expect), f"{key}: got {got!r}, want {expect!r}")

        stale = [k for k in DIVERGENCES if k not in seen_declarations]
        self.assertEqual(stale, [], f"divergence declarations match no vector case -- renamed note? {stale}")


if __name__ == "__main__":
    unittest.main()
