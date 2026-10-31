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

from barefootjs import BarefootJS

VECTORS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "..", "adapter-tests", "vectors")
PRIMITIVE_FILES = sorted(glob.glob(os.path.join(VECTORS_DIR, "primitives", "*.json")))
LEDGER_PATH = os.path.join(VECTORS_DIR, "primitives-expected-failures.json")

bf = BarefootJS(None, {})

# One binding per op, to the helper compiled templates call. An op with no
# binding fails.
#
# TODO(#3824 step 0b/1): also bind each op to the native Jinja operator and
# run only the cases whose `domain` the Jinja adapter's NativeSafeTable claims
# (spec/js-primitive-semantics.md, "Conformance" item 3). That needs the
# table step 0b adds.
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


def _run(case):
    bind = BINDINGS.get(case["fn"])
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


if __name__ == "__main__":
    unittest.main()
