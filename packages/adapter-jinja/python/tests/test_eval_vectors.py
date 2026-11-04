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
from tests.vector_undefined import is_runtime_undefined, is_undef_sentinel, load_expected_failures, undefined_to_arg

VECTORS_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "..", "adapter-tests", "vectors", "eval-vectors.json"
)
# The shrink-only expected-failure ledger of the eval vectors
# (spec/js-undefined-value.md, section 6), keyed by note.
LEDGER_PATH = os.path.join(os.path.dirname(VECTORS_PATH), "eval-expected-failures.json")


def _match(got, expect):
    """Spec value-compat comparison -- non-finite sentinel hashes, booleans
    by truthiness (but the evaluator result must ITSELF be a real bool, not
    a truthy int -- matching a boolean-valued JS operator must return a real
    boolean), numbers numerically, arrays/hashes recursively, strings by
    equality. A `$undef` expect matches only the runtime's undefined
    (vector_undefined.py)."""
    if is_undef_sentinel(expect):
        return is_runtime_undefined(got)
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
        expected = load_expected_failures(LEDGER_PATH)

        problems, seen = [], set()
        for case in doc["cases"]:
            note, expr, expect = case["note"], case["expr"], case["expect"]
            env = undefined_to_arg(case["env"])
            seen.add(note)
            try:
                got = evaluator.evaluate(expr, env)
                ok, detail = _match(got, expect), f"got {got!r}, want {expect!r}"
            except Exception as exc:  # noqa: BLE001
                ok, detail = False, f"raised {exc!r}"
            if ok and note in expected:
                problems.append(f"ledger entry '{note}' now passes; remove it from the ledger (step {expected[note]['step']})")
            elif not ok and note not in expected:
                problems.append(f"UNEXPECTED-FAIL {note}: {detail}")
        problems += [f"ledger entry '{n}' matches no eval case -- renamed note?" for n in expected if n not in seen]
        self.assertEqual(problems, [], "\n" + "\n".join(problems))


if __name__ == "__main__":
    unittest.main()
