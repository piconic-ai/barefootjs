"""Hand-built ParsedExpr evaluator demonstrations, ported from
packages/adapter-perl/t/evaluator.t.

Mirrors the Go/Perl `eval_test.go` / `evaluator.t` demonstrations so all
three backends prove the SAME restriction-lifting on the SAME shapes (a
reducer/comparator/predicate body the fixed bf_reduce/bf_sort/bf_filter
catalogues can't express, but the evaluator handles as just another pure
expression).
"""

from __future__ import annotations

import json
import unittest

from barefootjs import evaluator


def nid(name):
    return {"kind": "identifier", "name": name}


def nmem(obj, prop):
    return {"kind": "member", "object": obj, "property": prop, "computed": False}


def nbin(op, left, right):
    return {"kind": "binary", "op": op, "left": left, "right": right}


def nstr(value):
    return {"kind": "literal", "value": value, "literalType": "string"}


def nnum(value):
    return {"kind": "literal", "value": value, "literalType": "number"}


def ncall_math(fn, arg):
    return {"kind": "call", "callee": nmem(nid("Math"), fn), "args": [arg]}


def nincludes(obj, needle):
    return {"kind": "array-method", "method": "includes", "object": obj, "args": [needle]}


class EvaluatorTest(unittest.TestCase):
    def test_fold_arbitrary_reducer_body(self):
        # acc + item.price * item.qty
        body = nbin("+", nid("acc"), nbin("*", nmem(nid("item"), "price"), nmem(nid("item"), "qty")))
        items = [{"price": 5, "qty": 3}, {"price": 2, "qty": 4}]
        self.assertEqual(evaluator.fold(items, body, "acc", "item", 0, "left"), 23)

    def test_fold_direction_observable_for_string_concat(self):
        body = nbin("+", nid("acc"), nid("item"))
        items = ["a", "b", "c"]
        self.assertEqual(evaluator.fold(items, body, "acc", "item", "", "left"), "abc")
        self.assertEqual(evaluator.fold(items, body, "acc", "item", "", "right"), "cba")

    def test_sort_by_arbitrary_comparator_abs_of_field_difference(self):
        cmp = nbin("-", ncall_math("abs", nmem(nid("a"), "v")), ncall_math("abs", nmem(nid("b"), "v")))
        items = [{"v": -5}, {"v": 3}, {"v": -1}]
        sorted_items = evaluator.sort_by(items, cmp, "a", "b")
        self.assertEqual([x["v"] for x in sorted_items], [-1, 3, -5])

    def test_sort_by_descending_via_reversed_comparator(self):
        cmp = nbin("-", nmem(nid("b"), "x"), nmem(nid("a"), "x"))
        items = [{"x": 10}, {"x": 30}, {"x": 20}]
        sorted_items = evaluator.sort_by(items, cmp, "a", "b")
        self.assertEqual([x["x"] for x in sorted_items], [30, 20, 10])

    def test_nonfinite_division_and_js_stringification(self):
        def div(a, b):
            return evaluator.evaluate(nbin("/", nid("a"), nid("b")), {"a": a, "b": b})

        inf = float("inf")
        self.assertEqual(div(1, 0), inf)
        self.assertEqual(div(-1, 0), -inf)
        nan = div(0, 0)
        self.assertNotEqual(nan, nan)

        self.assertEqual(evaluator._to_string(inf), "Infinity")
        self.assertEqual(evaluator._to_string(-inf), "-Infinity")
        self.assertEqual(evaluator._to_string(inf - inf), "NaN")

    def test_captured_free_vars_via_base_env(self):
        body = nbin("+", nid("acc"), nbin("*", nid("item"), nid("factor")))
        total = evaluator.fold([1, 2, 3], body, "acc", "item", 0, "left", {"factor": 10})
        self.assertEqual(total, 60)

        cmp = nbin(
            "-",
            ncall_math("abs", nbin("-", nid("a"), nid("pivot"))),
            ncall_math("abs", nbin("-", nid("b"), nid("pivot"))),
        )
        sorted_items = evaluator.sort_by([1, 8, 4], cmp, "a", "b", {"pivot": 5})
        self.assertEqual(sorted_items, [4, 8, 1])

    def test_boolean_valued_ops_return_real_booleans(self):
        lt = evaluator.evaluate(nbin("<", nid("a"), nid("b")), {"a": 1, "b": 2})
        self.assertIsInstance(lt, bool)
        self.assertEqual(evaluator._to_string(lt), "true")

        cat = evaluator.evaluate(nbin("+", nstr("x"), nbin("<", nid("a"), nid("b"))), {"a": 1, "b": 2})
        self.assertEqual(cat, "xtrue")

        eq = evaluator.evaluate(nbin("===", nid("a"), nid("b")), {"a": 1, "b": 1})
        self.assertIsInstance(eq, bool)

        not_ = evaluator.evaluate({"kind": "unary", "op": "!", "argument": nstr("")}, {})
        self.assertEqual(evaluator._to_string(not_), "true")

        b = evaluator.evaluate({"kind": "call", "callee": nid("Boolean"), "args": [nstr("")]}, {})
        self.assertIsInstance(b, bool)
        self.assertEqual(evaluator._to_string(b), "false")

        # `.length` is a string/array property only; a numeric scalar has none.
        length = evaluator.evaluate(nmem(nid("n"), "length"), {"n": 123})
        self.assertIsNone(length)

    def test_array_method_includes(self):
        # `.includes` (#2075) is the one `array-method` in the evaluator
        # subset, dispatching on the receiver type like the SSR template
        # lowering does at runtime (`bf.includes`): array -> SameValueZero
        # membership (the same value rules as `===`, so a numeric 2 does NOT
        # match the string "2"); string -> substring search; anything else
        # degrades to false rather than raising.
        hit = evaluator.evaluate(nincludes(nid("tags"), nstr("go")), {"tags": ["perl", "go"]})
        self.assertIsInstance(hit, bool)
        self.assertTrue(hit)

        miss = evaluator.evaluate(nincludes(nid("tags"), nstr("rust")), {"tags": ["perl", "go"]})
        self.assertIsInstance(miss, bool)
        self.assertFalse(miss)

        # SameValueZero, not loose equality: the numeric element 2 matches
        # the numeric needle 2, but the string needle "2" (a different JS
        # type) does not -- mirroring `===`'s type-sensitivity.
        num_hit = evaluator.evaluate(nincludes(nid("nums"), nnum(2)), {"nums": [1, 2, 3]})
        self.assertTrue(num_hit)
        num_vs_string = evaluator.evaluate(nincludes(nid("nums"), nstr("2")), {"nums": [1, 2, 3]})
        self.assertFalse(num_vs_string)

        sub = evaluator.evaluate(nincludes(nid("name"), nstr("ar")), {"name": "bare"})
        self.assertTrue(sub)

        # A non-array, non-string receiver (number, null, object) is not a
        # JS `.includes` target; the evaluator degrades to false rather than
        # raising.
        scalar_recv = evaluator.evaluate(nincludes(nid("n"), nnum(1)), {"n": 42})
        self.assertFalse(scalar_recv)
        null_recv = evaluator.evaluate(nincludes(nid("n"), nstr("x")), {"n": None})
        self.assertFalse(null_recv)

    def test_sort_by_non_array_receiver_returns_empty_list(self):
        cmp = nbin("-", nid("a"), nid("b"))
        self.assertEqual(evaluator.sort_by(None, cmp, "a", "b"), [])
        self.assertEqual(evaluator.sort_by(42, cmp, "a", "b"), [])

    def test_sort_by_is_stable_for_equal_keys(self):
        cmp = nbin("-", nmem(nid("a"), "k"), nmem(nid("b"), "k"))
        eq = evaluator.sort_by(
            [{"k": 1, "id": "a"}, {"k": 1, "id": "b"}, {"k": 1, "id": "c"}], cmp, "a", "b"
        )
        self.assertEqual([x["id"] for x in eq], ["a", "b", "c"])

        mixed = evaluator.sort_by(
            [{"k": 2, "id": "x"}, {"k": 1, "id": "y"}, {"k": 2, "id": "z"}], cmp, "a", "b"
        )
        self.assertEqual([x["id"] for x in mixed], ["y", "x", "z"])

    def test_fold_json_and_sort_by_json_decode_and_evaluate(self):
        rows = [{"duration": 95}, {"duration": 213}, {"duration": 185}]

        reduce_body = json.dumps(nbin("+", nid("sum"), nmem(nid("t"), "duration")))
        self.assertEqual(evaluator.fold_json(rows, reduce_body, "sum", "t", 0, "left", {}), 493)

        labels = [{"label": "a"}, {"label": "b"}, {"label": "c"}]
        concat_body = json.dumps(nbin("+", nid("acc"), nmem(nid("x"), "label")))
        self.assertEqual(evaluator.fold_json(labels, concat_body, "acc", "x", "", "left", {}), "abc")
        self.assertEqual(evaluator.fold_json(labels, concat_body, "acc", "x", "", "right", {}), "cba")

        cmp_json = json.dumps(nbin("-", nmem(nid("a"), "duration"), nmem(nid("b"), "duration")))
        sorted_rows = evaluator.sort_by_json(rows, cmp_json, "a", "b", {})
        self.assertEqual([r["duration"] for r in sorted_rows], [95, 185, 213])

    def test_filter_every_some_find_find_index_over_predicate(self):
        rows = [{"age": 15}, {"age": 30}, {"age": 18}]
        pred = nbin(">=", nmem(nid("u"), "age"), nnum(18))

        f = evaluator.filter(rows, pred, "u")
        self.assertEqual([r["age"] for r in f], [30, 18])

        self.assertTrue(evaluator.some(rows, pred, "u"))
        self.assertFalse(evaluator.every(rows, pred, "u"))

        self.assertEqual(evaluator.find(rows, pred, "u", True)["age"], 30)
        self.assertEqual(evaluator.find(rows, pred, "u", False)["age"], 18)
        self.assertEqual(evaluator.find_index(rows, pred, "u", True), 1)
        self.assertEqual(evaluator.find_index(rows, pred, "u", False), 2)

        self.assertTrue(evaluator.every([], pred, "u"))
        self.assertFalse(evaluator.some([], pred, "u"))
        self.assertIsNone(evaluator.find([], pred, "u"))
        self.assertEqual(evaluator.find_index([], pred, "u"), -1)

        pred_json = json.dumps(pred)
        fj = evaluator.filter_json(rows, pred_json, "u")
        self.assertEqual([r["age"] for r in fj], [30, 18])
        self.assertFalse(evaluator.every_json(rows, pred_json, "u"))
        self.assertTrue(evaluator.some_json(rows, pred_json, "u"))
        self.assertEqual(evaluator.find_json(rows, pred_json, "u", True)["age"], 30)
        self.assertEqual(evaluator.find_index_json(rows, pred_json, "u", False), 2)

        cap = nbin(">=", nmem(nid("u"), "age"), nid("threshold"))
        hi = evaluator.filter(rows, cap, "u", {"threshold": 18})
        lo = evaluator.filter(rows, cap, "u", {"threshold": 100})
        self.assertEqual(len(hi), 2)
        self.assertEqual(len(lo), 0)
        self.assertEqual(evaluator.find_index(rows, cap, "u", True, {"threshold": 100}), -1)

    def test_flat_map_projects_and_flattens_one_level(self):
        rows = [{"tags": ["a", "b"]}, {"tags": ["c"]}]
        field = nmem(nid("i"), "tags")
        self.assertEqual(evaluator.flat_map(rows, field, "i"), ["a", "b", "c"])

        pts = [{"x": 1, "y": 2}, {"x": 3, "y": 4}]
        tuple_proj = {
            "kind": "array-literal",
            "elements": [nmem(nid("p"), "x"), nmem(nid("p"), "y")],
        }
        self.assertEqual(evaluator.flat_map(pts, tuple_proj, "p"), [1, 2, 3, 4])

        fj = evaluator.flat_map_json(rows, json.dumps(field), "i")
        self.assertEqual(fj, ["a", "b", "c"])

    def test_map_items_projects_one_result_per_element_no_flatten(self):
        tmpl = {
            "kind": "template-literal",
            "parts": [
                {"type": "string", "value": "#"},
                {"type": "expression", "expr": nid("t")},
            ],
        }
        self.assertEqual(evaluator.map_items(["perl", "go"], tmpl, "t"), ["#perl", "#go"])

        users = [{"name": "Ada"}, {"name": "Grace"}]
        field = nmem(nid("u"), "name")
        self.assertEqual(evaluator.map_items(users, field, "u"), ["Ada", "Grace"])

        rows = [{"tags": ["a", "b"]}]
        self.assertEqual(evaluator.map_items(rows, nmem(nid("i"), "tags"), "i"), [["a", "b"]])

        mj = evaluator.map_json(users, json.dumps(field), "u")
        self.assertEqual(mj, ["Ada", "Grace"])


if __name__ == "__main__":
    unittest.main()
