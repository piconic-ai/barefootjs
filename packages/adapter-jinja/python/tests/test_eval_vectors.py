"""Golden ParsedExpr-evaluator vectors, ported from
packages/adapter-perl/t/eval_vectors.t.

Runs `packages/adapter-tests/vectors/eval-vectors.json` -- generated
from the JS reference evaluator, shared with the Go and Perl evaluators --
against `barefootjs.evaluator.evaluate`. The evaluator is JS-faithful by
contract, so unlike the helper vectors there are NO Python-side
divergences here: each case's real ParsedExpr tree, evaluated against its
environment, must reproduce the JS-computed expect exactly.
"""

from __future__ import annotations

import json
import os
import unittest

from barefootjs import evaluator

VECTORS_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "..", "adapter-tests", "vectors", "eval-vectors.json"
)


def _match(got, expect):
    """Spec value-compat comparison -- non-finite sentinel hashes, booleans
    by truthiness (but the evaluator result must ITSELF be a real bool, not
    a truthy int -- matching a boolean-valued JS operator must return a real
    boolean), numbers numerically, arrays/hashes recursively, strings by
    equality."""
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
        return isinstance(got, bool) and got == expect
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
    # Numeric comparison only when BOTH are real numbers (not
    # numeric-looking strings) -- e.g. String(42) must return the string
    # "42", and evaluating it as the number 42 must NOT pass.
    want_num = isinstance(expect, (int, float)) and not isinstance(expect, bool)
    got_num = isinstance(got, (int, float)) and not isinstance(got, bool)
    if want_num != got_num:
        return False
    if want_num:
        if isinstance(got, int) and isinstance(expect, int):
            return got == expect
        return float(got) == float(expect)
    return got == expect


@unittest.skipUnless(os.path.exists(VECTORS_PATH), "eval vectors not available outside the monorepo checkout")
class EvalVectorsTest(unittest.TestCase):
    def test_vectors(self):
        with open(VECTORS_PATH, encoding="utf-8") as fh:
            doc = json.load(fh)

        self.assertTrue(doc["cases"], "eval-vectors.json contains no cases")

        for case in doc["cases"]:
            note, expr, env, expect = case["note"], case["expr"], case["env"], case["expect"]
            with self.subTest(note=note):
                try:
                    got = evaluator.evaluate(expr, env)
                except Exception as exc:  # noqa: BLE001
                    self.fail(f"{note} raised: {exc!r}")
                    continue
                self.assertTrue(_match(got, expect), f"{note}: got {got!r}, want {expect!r}")


if __name__ == "__main__":
    unittest.main()
