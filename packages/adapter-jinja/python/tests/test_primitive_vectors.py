"""JS primitive-operation vector conformance (spec/js-primitive-semantics.md,
"Conformance").

Runs every `packages/adapter-tests/vectors/primitives/<op>.json` case against
the `BarefootJS` helper a compiled Jinja template calls for that operation.
The step-0 expected-failure ledger
(`packages/adapter-tests/vectors/primitives-expected-failures.json`) lists the
cases that fail on Python today, each naming the rollout step that removes
it. It may only shrink: an unlisted failure fails, and so does a listed case
that now passes.

Skipped outside a monorepo checkout, like the other vector harnesses.
"""

from __future__ import annotations

import glob
import json
import math
import os
import unittest

from jinja2 import Environment

from barefootjs import BarefootJS

VECTORS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "..", "adapter-tests", "vectors")
PRIMITIVE_FILES = sorted(glob.glob(os.path.join(VECTORS_DIR, "primitives", "*.json")))
LEDGER_PATH = os.path.join(VECTORS_DIR, "primitives-expected-failures.json")
NATIVE_SAFE_PATH = os.path.join(VECTORS_DIR, "primitives-native-safe.json")

bf = BarefootJS(None, {})

# One binding per op, to the helper compiled templates call. An op with no
# binding fails.
BINDINGS = {
    "truthy": bf.truthy,
    "to_number": bf.to_number,
    "to_string": bf.to_string,
    "get": bf.get,
    "strict_eq": bf.strict_eq,
    "lt": bf.lt,
    "le": bf.le,
    "gt": bf.gt,
    "ge": bf.ge,
    "plus": bf.plus,
    "neg": bf.neg,
    "number": bf.number,
}

_JINJA_IF = Environment().from_string("{% if v %}1{% else %}0{% endif %}")
_JINJA_INDEX = Environment().compile_expression("recv[key]")

# One binding per op the Jinja adapter can spell natively, to the native Jinja
# operator: a test is Jinja's own `{% if %}` (`not`, `if … else`); an index
# read is Jinja's own `[]` (an undefined result reads as None, as a template's
# nil); a number literal is a Jinja literal. It runs over the cases whose domain the adapter's NATIVE_SAFE table
# claims (primitives-native-safe.json; spec/js-primitive-semantics.md,
# "Conformance" item 3).
NATIVE_BINDINGS = {
    "truthy": lambda v: _JINJA_IF.render(v=v) == "1",
    "get": lambda recv, key: _JINJA_INDEX(recv=recv, key=key),
    "number": lambda text: Environment().compile_expression(text)(),
}

SENTINELS = {"NaN": math.nan, "Infinity": math.inf, "-Infinity": -math.inf, "-0": -0.0}


def _decode(v):
    """Materialize the `{"$num": ...}` sentinel, `-0` included."""
    if isinstance(v, list):
        return [_decode(x) for x in v]
    if isinstance(v, dict):
        if list(v) == ["$num"]:
            return SENTINELS[v["$num"]]
        return {k: _decode(x) for k, x in v.items()}
    return v


def _is_number(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _match(got, expect):
    """The primitives contract: types are strict (a bool for a boolean, a
    number for a number, a str for a string), numbers compare as doubles and
    a zero compares by sign."""
    if expect is None:
        return got is None
    if isinstance(expect, bool):
        return isinstance(got, bool) and got == expect
    if _is_number(expect):
        if not _is_number(got):
            return False
        g, e = float(got), float(expect)
        if math.isnan(e):
            return math.isnan(g)
        if e == 0 and g == 0:
            return math.copysign(1, g) == math.copysign(1, e)
        return g == e
    if isinstance(expect, list):
        return isinstance(got, list) and len(got) == len(expect) and all(map(_match, got, expect))
    if isinstance(expect, dict):
        return (
            isinstance(got, dict)
            and len(got) == len(expect)
            and all(k in got and _match(got[k], v) for k, v in expect.items())
        )
    return isinstance(got, str) and got == expect


def _run(case, bind=None):
    bind = bind or BINDINGS.get(case["fn"])
    if bind is None:
        return False, f"no Python binding for '{case['fn']}' -- add it to BINDINGS"
    try:
        got = bind(*[_decode(a) for a in case["args"]])
    except Exception as exc:  # noqa: BLE001
        return False, f"raised {exc!r}"
    expect = _decode(case["expect"])
    if _match(got, expect):
        return True, ""
    return False, f"got {got!r}, want {expect!r}"


@unittest.skipUnless(PRIMITIVE_FILES, "primitive vectors not available outside the monorepo checkout")
class PrimitiveVectorsTest(unittest.TestCase):
    def test_primitive_vectors(self):
        with open(LEDGER_PATH, encoding="utf-8") as fh:
            expected = json.load(fh)["runtimes"]["python"]
        problems, seen, total, passed = [], set(), 0, 0
        for path in PRIMITIVE_FILES:
            with open(path, encoding="utf-8") as fh:
                cases = json.load(fh)["cases"]
            for case in cases:
                key = f"{case['fn']}/{case['note']}"
                seen.add(key)
                total += 1
                ok, detail = _run(case)
                passed += ok
                if ok and key in expected:
                    problems.append(
                        f"ledger entry '{key}' now passes; remove it from the ledger (step {expected[key]['step']})"
                    )
                elif not ok and key not in expected:
                    problems.append(f"UNEXPECTED-FAIL {key}: {detail}")
        problems += [f"ledger entry '{k}' matches no primitives case -- renamed note?" for k in expected if k not in seen]
        print(f"primitives: {total} cases, {passed} pass, {len(expected)} in the expected-failure ledger")
        self.assertEqual(problems, [], "\n" + "\n".join(problems))

    def test_native_claims(self):
        """Every native claim gives the JS answer on every case it covers; no ledger applies."""
        with open(NATIVE_SAFE_PATH, encoding="utf-8") as fh:
            claims = json.load(fh)["runtimes"]["python"]
        problems, ran = [], 0
        for fn, domains in claims.items():
            bind = NATIVE_BINDINGS.get(fn)
            if bind is None:
                problems.append(f"no native Jinja binding for '{fn}' -- add it to NATIVE_BINDINGS")
                continue
            with open(os.path.join(VECTORS_DIR, "primitives", f"{fn}.json"), encoding="utf-8") as fh:
                cases = json.load(fh)["cases"]
            for case in cases:
                if case["domain"] not in domains:
                    continue
                ran += 1
                ok, detail = _run(case, bind)
                if not ok:
                    problems.append(f"NATIVE-FAIL {case['fn']}/{case['note']} (domain {case['domain']}): {detail}")
        print(f"primitives (native): {ran} claimed cases")
        self.assertEqual(problems, [], "\n" + "\n".join(problems))


if __name__ == "__main__":
    unittest.main()
