"""Golden helper-vector conformance, ported from
packages/adapter-perl/t/helper_vectors.t.

Runs `packages/adapter-tests/vectors/vectors.json` -- generated from
the JS reference implementations (spec/template-helpers.md) -- against this
package's `BarefootJS` runtime. One binding per canonical helper id in the
spec catalogue, bound to the exact code shape a compiled Jinja template
would execute (a `bf.<method>(...)` call, or the native Python operator the
adapter emits for `add`/`sub`/`mul`/`div`/`neg`, mirroring how
`helper_vectors.t` binds those to native Perl operators).

Per spec/template-helpers.md's "Adapter status model", this backend's
divergences from the JS-normative expect live in
`tests/vector-divergences.json` (package-local, next to this file) -- keyed
by `fn/note`, mirroring the Perl harness's `%DIVERGENCES` table exactly in
spirit (values differ where Python's actual behaviour differs from Perl's).
This harness still fails on stale or dead declarations in that file.

Skipped everywhere the golden vectors file isn't available (i.e. outside a
monorepo checkout), matching the Perl/Go harnesses' `skip_all` policy.
"""

from __future__ import annotations

import builtins
import datetime
import json
import math
import os
import unittest

from barefootjs import BarefootJS
from barefootjs.backend_jinja import default_json_encoder

VECTORS_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "..", "adapter-tests", "vectors", "vectors.json"
)
DIVERGENCES_PATH = os.path.join(os.path.dirname(__file__), "vector-divergences.json")


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


def _materialize_arg(v):
    """Materializes the `{"$date": "<ISO>"}` native-date arg sentinel
    (#2288) into a real `datetime`, so `date`'s native-receiver branch (not
    just its ISO-string branch) is exercised. Recurses through lists/dicts
    the same shape the Perl port's `normalize_arg` walks, since a vector's
    `args` may nest the sentinel inside a higher-order projection payload."""
    if isinstance(v, list):
        return [_materialize_arg(x) for x in v]
    if isinstance(v, dict) and list(v) == ["$date"]:
        s = v["$date"]
        return datetime.datetime.fromisoformat(s[:-1] + "+00:00" if s.endswith("Z") else s)
    if isinstance(v, dict):
        return {k: _materialize_arg(x) for k, x in v.items()}
    return v


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
    "min": bf.min,
    "max": bf.max,
    "abs": bf.abs,
    "to_fixed": lambda *a: bf.to_fixed(*a),
    "date": lambda recv, op: bf.date(recv, op),
    "format_date": lambda recv, pattern, tz: bf.format_date(recv, pattern, tz),
    "lower": bf.lc,
    "upper": bf.uc,
    "trim": bf.trim,
    "trim_start": bf.trim_start,
    "trim_end": bf.trim_end,
    "starts_with": lambda *a: bf.starts_with(*a),
    "ends_with": lambda *a: bf.ends_with(*a),
    "replace": lambda *a: bf.replace(*a),
    "replace_all": lambda *a: bf.replace_all(*a),
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
    "flat_dynamic": lambda *a: bf.flat_dynamic(*a),
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

# Per-backend status declarations (spec/template-helpers.md "Adapter status
# model"), loaded from tests/vector-divergences.json (package-local, always
# present regardless of whether the golden vectors themselves are available
# outside the monorepo checkout). Forms:
#   {"expect": <value>}                  assert the pinned value (exact, no
#                                         numeric coercion -- deliberately
#                                         stricter than the spec's
#                                         value-compat `_match` so an
#                                         int-vs-float rounding accident
#                                         can't hide behind the comparison)
#   {"expect": {"$num": "NaN"}}          assert a real NaN result
#   {"throws": true, "exception": <n>}   assert the call raises the named
#                                         builtin exception (default
#                                         `Exception` if `exception` absent)
with open(DIVERGENCES_PATH, encoding="utf-8") as _fh:
    _divergences_doc = json.load(_fh)
DIVERGENCES = _divergences_doc["divergences"]
UNSUPPORTED = _divergences_doc["unsupported"]


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
            fn, note, expect = case["fn"], case["note"], case["expect"]
            args = [_materialize_arg(a) for a in case["args"]]
            key = f"{fn}/{note}"
            with self.subTest(key=key):
                if fn in UNSUPPORTED:
                    self.skipTest(f"unsupported on this backend: {UNSUPPORTED[fn]}")
                    continue
                bind = BINDINGS.get(fn)
                self.assertIsNotNone(bind, f"no Python binding for helper '{fn}' -- add it to BINDINGS")

                divergence = DIVERGENCES.get(key)
                if divergence and divergence.get("throws"):
                    seen_declarations.add(key)
                    exception_name = divergence.get("exception")
                    exception_cls = getattr(builtins, exception_name) if exception_name else Exception
                    with self.assertRaises(
                        exception_cls,
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
                    want = divergence["expect"]
                    if isinstance(want, dict) and want.get("$num") == "NaN":
                        self.assertTrue(
                            isinstance(got, float) and got != got,
                            f"{label}: got {got!r}, wanted real NaN",
                        )
                    else:
                        self.assertEqual(got, want, label)
                    continue

                self.assertTrue(_match(got, expect), f"{key}: got {got!r}, want {expect!r}")

        stale = [k for k in DIVERGENCES if k not in seen_declarations]
        self.assertEqual(stale, [], f"divergence declarations match no vector case -- renamed note? {stale}")


if __name__ == "__main__":
    unittest.main()
