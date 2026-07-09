"""JS-compat helper coverage (#1189), ported from
packages/adapter-perl/t/template_primitives.t.

Covers the array/string method surface NOT already exercised byte-for-byte
by the shared golden vectors (`test_helper_vectors.py`) -- receiver-type
dispatch edge cases, mutation isolation (a helper must return a NEW list,
never alias the caller's), and the structured `sort` comparator dispatch.
"""

from __future__ import annotations

import json
import unittest

from barefootjs import BarefootJS


class _PureBackend:
    def encode_json(self, data):
        return json.dumps(data, separators=(",", ":"), sort_keys=True)

    def mark_raw(self, s):
        return s

    def materialize(self, value):
        return value() if callable(value) else value

    def render_named(self, *args, **kwargs):
        return ""


def _is_nan(n):
    return isinstance(n, float) and n != n


class TemplatePrimitivesTest(unittest.TestCase):
    def setUp(self):
        self.bf = BarefootJS(None, {"backend": _PureBackend()})

    def test_json(self):
        self.assertEqual(self.bf.json({"a": 1}), '{"a":1}')
        self.assertEqual(self.bf.json([1, 2, 3]), "[1,2,3]")
        self.assertEqual(self.bf.json("hi"), '"hi"')
        self.assertEqual(self.bf.json(None), "null")

    def test_string(self):
        self.assertEqual(self.bf.string(42), "42")
        self.assertEqual(self.bf.string("hi"), "hi")
        self.assertEqual(self.bf.string(None), "")
        # Python has a real boolean type -- no Perl-style divergence.
        self.assertEqual(self.bf.string(True), "true")
        self.assertEqual(self.bf.string(False), "false")
        self.assertEqual(self.bf.string(1.0), "1")

    def test_number(self):
        self.assertEqual(self.bf.number("3.14"), 3.14)
        self.assertEqual(self.bf.number(42), 42)
        self.assertTrue(_is_nan(self.bf.number("not a num")))
        self.assertTrue(_is_nan(self.bf.number(None)))

    def test_floor_ceil_round(self):
        self.assertEqual(self.bf.floor(3.7), 3)
        self.assertEqual(self.bf.floor(-3.2), -4)
        self.assertTrue(_is_nan(self.bf.floor("not")))

        self.assertEqual(self.bf.ceil(3.1), 4)
        self.assertEqual(self.bf.ceil(-3.7), -3)
        self.assertTrue(_is_nan(self.bf.ceil("not")))

        self.assertEqual(self.bf.round(3.5), 4)
        self.assertEqual(self.bf.round(3.4), 3)
        # JS Math.round ties go toward +Infinity, not away from zero.
        self.assertEqual(self.bf.round(-1.5), -1)
        self.assertEqual(self.bf.round(-1.6), -2)
        self.assertTrue(_is_nan(self.bf.round("not")))

    def test_min_max_abs(self):
        # `Math.min(a, b)` / `Math.max(a, b)` (two-arg forms only) and
        # `Math.abs()` (#2168 math-methods). JS returns NaN if EITHER
        # min/max operand is NaN.
        self.assertEqual(self.bf.min(3, 7), 3)
        self.assertEqual(self.bf.min(7, 3), 3)
        self.assertEqual(self.bf.min(-2, -5), -5)
        self.assertTrue(_is_nan(self.bf.min("not", 5)))
        self.assertTrue(_is_nan(self.bf.min(5, "not")))

        self.assertEqual(self.bf.max(3, 7), 7)
        self.assertEqual(self.bf.max(7, 3), 7)
        self.assertEqual(self.bf.max(-2, -5), -2)
        self.assertTrue(_is_nan(self.bf.max("not", 5)))
        self.assertTrue(_is_nan(self.bf.max(5, "not")))

        self.assertEqual(self.bf.abs(-7.6), 7.6)
        self.assertEqual(self.bf.abs(7.6), 7.6)
        self.assertEqual(self.bf.abs(0), 0)
        self.assertTrue(_is_nan(self.bf.abs("not")))

    def test_includes_dispatch(self):
        # `Array.prototype.includes(x)` + `String.prototype.includes(sub)`
        # lower to the same `bf.includes(recv, elem)` shape -- see #1448
        # Tier A. `BarefootJS.includes` dispatches on `recv`'s Python type:
        # a `list` scans elements via `evaluator._same_value_zero` (#2075 --
        # SameValueZero, handling None/undefined parity, and no
        # numeric/string coercion -- see the cross-type cases below);
        # anything else (a `dict`, or a scalar) falls back to a substring
        # search via `js_string` coercion.
        self.assertTrue(self.bf.includes(["a", "b", "c"], "b"))
        self.assertFalse(self.bf.includes(["a", "b", "c"], "z"))
        self.assertTrue(self.bf.includes([1, 2, 3], 2))
        self.assertFalse(self.bf.includes([], "a"))
        self.assertTrue(self.bf.includes([None, "a"], None))
        self.assertFalse(self.bf.includes(["a", "b"], None))

        # SameValueZero never coerces across types.
        self.assertFalse(self.bf.includes([2], "2"))
        self.assertTrue(self.bf.includes([2], 2))
        self.assertTrue(self.bf.includes(["2"], "2"))

        self.assertTrue(self.bf.includes("hello world", "world"))
        self.assertFalse(self.bf.includes("hello world", "earth"))
        self.assertTrue(self.bf.includes("hello", ""))
        self.assertFalse(self.bf.includes("", "x"))
        self.assertFalse(self.bf.includes(None, "x"))

        self.assertFalse(self.bf.includes({"a": 1}, "a"))

    def test_index_of_last_index_of(self):
        arr = ["a", "b", "c", "b", "d"]
        self.assertEqual(self.bf.index_of(arr, "a"), 0)
        self.assertEqual(self.bf.index_of(arr, "b"), 1)
        self.assertEqual(self.bf.index_of(arr, "d"), 4)
        self.assertEqual(self.bf.index_of(arr, "z"), -1)
        self.assertEqual(self.bf.index_of([], "a"), -1)
        self.assertEqual(self.bf.index_of("not an array", "a"), -1)

        self.assertEqual(self.bf.last_index_of(arr, "b"), 3)
        self.assertEqual(self.bf.last_index_of(arr, "a"), 0)
        self.assertEqual(self.bf.last_index_of(arr, "z"), -1)

        self.assertEqual(self.bf.index_of([None, "x", None], None), 0)
        self.assertEqual(self.bf.last_index_of([None, "x", None], None), 2)

    def test_at(self):
        arr = ["a", "b", "c"]
        self.assertEqual(self.bf.at(arr, 0), "a")
        self.assertEqual(self.bf.at(arr, 2), "c")
        self.assertEqual(self.bf.at(arr, -1), "c")
        self.assertEqual(self.bf.at(arr, -3), "a")
        self.assertIsNone(self.bf.at(arr, 3))
        self.assertIsNone(self.bf.at(arr, -4))
        self.assertIsNone(self.bf.at([], 0))
        self.assertIsNone(self.bf.at(None, 0))
        self.assertIsNone(self.bf.at({"a": 1}, 0))

    def test_concat_mutation_isolation(self):
        self.assertEqual(self.bf.concat(["a", "b"], ["c", "d"]), ["a", "b", "c", "d"])
        self.assertEqual(self.bf.concat(None, ["a"]), ["a"])
        self.assertEqual(self.bf.concat(["a"], None), ["a"])

        left = ["a", "b"]
        right = ["c", "d"]
        out = self.bf.concat(left, right)
        out.append("mutated")
        self.assertEqual(left, ["a", "b"])
        self.assertEqual(right, ["c", "d"])

    def test_slice_mutation_isolation_and_clamping(self):
        arr = ["a", "b", "c", "d", "e"]
        self.assertEqual(self.bf.slice(arr, 1, 3), ["b", "c"])
        self.assertEqual(self.bf.slice(arr, 2, None), ["c", "d", "e"])
        self.assertEqual(self.bf.slice(arr, -2, None), ["d", "e"])
        self.assertEqual(self.bf.slice(arr, 0, -1), ["a", "b", "c", "d"])
        self.assertEqual(self.bf.slice(arr, 100, None), [])
        self.assertEqual(self.bf.slice(arr, 3, 1), [])
        self.assertEqual(self.bf.slice(None, 0, None), [])

        src = ["a", "b", "c"]
        out = self.bf.slice(src, 0, 2)
        out.append("mutated")
        self.assertEqual(src, ["a", "b", "c"])

    def test_slice_string_receiver(self):
        # The `string-slice` divergence (#2182): a string receiver used
        # to fall through the array-only branch and return an empty
        # list instead of a substring.
        word = "barefootjs"
        self.assertEqual(self.bf.slice(word, 0, 4), "bare")
        self.assertEqual(self.bf.slice(word, -4, None), "otjs")
        self.assertEqual(self.bf.slice(word, 4, None), "footjs")
        self.assertEqual(self.bf.slice(word, 5, 2), "")
        # Multi-byte: index by character, not byte.
        self.assertEqual(self.bf.slice("héllo", 0, 2), "hé")

    def test_reverse_mutation_isolation(self):
        self.assertEqual(self.bf.reverse(["a", "b", "c"]), ["c", "b", "a"])
        self.assertEqual(self.bf.reverse([]), [])

        src = ["a", "b", "c"]
        out = self.bf.reverse(src)
        out.append("mutated")
        self.assertEqual(src, ["a", "b", "c"])
        self.assertEqual(self.bf.reverse(None), [])

    def test_trim(self):
        self.assertEqual(self.bf.trim("   padded   "), "padded")
        self.assertEqual(self.bf.trim(""), "")
        self.assertEqual(self.bf.trim(None), "")
        self.assertEqual(self.bf.trim({"a": 1}), "")
        self.assertEqual(self.bf.trim(42), "42")

    def test_trim_start_and_trim_end(self):
        # The one-sided siblings of `trim` above (#2183). Padding BOTH
        # sides so a swapped side fails visibly.
        self.assertEqual(self.bf.trim_start("   padded   "), "padded   ")
        self.assertEqual(self.bf.trim_end("   padded   "), "   padded")
        self.assertEqual(self.bf.trim_start(""), "")
        self.assertEqual(self.bf.trim_end(""), "")
        self.assertEqual(self.bf.trim_start(None), "")
        self.assertEqual(self.bf.trim_end(None), "")
        self.assertEqual(self.bf.trim_start({"a": 1}), "")
        self.assertEqual(self.bf.trim_end([1, 2]), "")

    def test_split(self):
        self.assertEqual(self.bf.split("a,b,c", ","), ["a", "b", "c"])
        self.assertEqual(self.bf.split("a.b.c", "."), ["a", "b", "c"])
        self.assertEqual(self.bf.split("a,", ","), ["a", ""])
        self.assertEqual(self.bf.split(",a", ","), ["", "a"])
        self.assertEqual(self.bf.split("abc", ""), ["a", "b", "c"])
        self.assertEqual(self.bf.split("", ""), [])
        self.assertEqual(self.bf.split("abc", ","), ["abc"])
        self.assertEqual(self.bf.split("a,b,c"), ["a,b,c"])
        self.assertEqual(self.bf.split("a,b,c,d", ",", 2), ["a", "b"])
        self.assertEqual(self.bf.split("a,b", ",", 0), [])
        self.assertEqual(self.bf.split(None, ","), [""])
        self.assertEqual(self.bf.split(42, ","), ["42"])

    def test_starts_with_ends_with_positions(self):
        self.assertTrue(self.bf.starts_with("hello world", "hello"))
        self.assertTrue(self.bf.starts_with("anything", ""))
        self.assertTrue(self.bf.ends_with("hello world", "world"))
        self.assertTrue(self.bf.starts_with("abc", "b", 1))
        self.assertFalse(self.bf.starts_with("abc", "a", 99))
        self.assertTrue(self.bf.starts_with("abc", "a", -5))
        self.assertTrue(self.bf.ends_with("abc", "b", 2))
        self.assertTrue(self.bf.ends_with("abc", "c", 99))
        self.assertFalse(self.bf.ends_with("abc", "a", -1))

    def test_replace(self):
        self.assertEqual(self.bf.replace("hello world", "o", "0"), "hell0 world")
        self.assertEqual(self.bf.replace("abc", "", "X"), "Xabc")
        self.assertEqual(self.bf.replace("ab", "a", "$&"), "$&b")

    def test_repeat(self):
        self.assertEqual(self.bf.repeat("ab", 3), "ababab")
        self.assertEqual(self.bf.repeat("ab", 0), "")
        self.assertEqual(self.bf.repeat("ab", -2), "")
        self.assertEqual(self.bf.repeat("ab", 2.9), "abab")

    def test_pad_start_pad_end(self):
        self.assertEqual(self.bf.pad_start("42", 5, "0"), "00042")
        self.assertEqual(self.bf.pad_end("42", 5, "."), "42...")
        self.assertEqual(self.bf.pad_start("42", 5), "   42")
        self.assertEqual(self.bf.pad_start("x", 5, "ab"), "ababx")
        self.assertEqual(self.bf.pad_start("hello", 3, "0"), "hello")
        self.assertEqual(self.bf.pad_start("42", 5, ""), "42")
        self.assertEqual(self.bf.pad_start("7", 4.9, "0"), "0007")

    def test_sort_structured_comparator_dispatch(self):
        items = [
            {"name": "c", "price": 30},
            {"name": "a", "price": 10},
            {"name": "b", "price": 20},
        ]
        self.assertEqual(
            self.bf.sort(
                items,
                {"keys": [{"key_kind": "field", "key": "price", "compare_type": "numeric", "direction": "asc"}]},
            ),
            [{"name": "a", "price": 10}, {"name": "b", "price": 20}, {"name": "c", "price": 30}],
        )
        self.assertEqual(
            self.bf.sort(
                items,
                {"keys": [{"key_kind": "field", "key": "price", "compare_type": "numeric", "direction": "desc"}]},
            ),
            [{"name": "c", "price": 30}, {"name": "b", "price": 20}, {"name": "a", "price": 10}],
        )
        self.assertEqual(
            self.bf.sort([3, 1, 2], {"keys": [{"key_kind": "self", "compare_type": "numeric", "direction": "asc"}]}),
            [1, 2, 3],
        )

        # Mutation isolation.
        src = [{"price": 3}, {"price": 1}, {"price": 2}]
        out = self.bf.sort(
            src, {"keys": [{"key_kind": "field", "key": "price", "compare_type": "numeric", "direction": "asc"}]}
        )
        out.append({"price": 99})
        self.assertEqual(src, [{"price": 3}, {"price": 1}, {"price": 2}])

        self.assertEqual(
            self.bf.sort(None, {"keys": [{"key_kind": "self", "compare_type": "numeric", "direction": "asc"}]}), []
        )
        self.assertEqual(self.bf.sort([], {"keys": [{"key_kind": "field", "key": "price"}]}), [])

    def test_sort_multi_key_tie_break(self):
        items = [{"p": 1, "name": "b"}, {"p": 1, "name": "a"}, {"p": 0, "name": "c"}]
        self.assertEqual(
            self.bf.sort(
                items,
                {
                    "keys": [
                        {"key_kind": "field", "key": "p", "compare_type": "numeric", "direction": "asc"},
                        {"key_kind": "field", "key": "name", "compare_type": "string", "direction": "asc"},
                    ]
                },
            ),
            [{"p": 0, "name": "c"}, {"p": 1, "name": "a"}, {"p": 1, "name": "b"}],
        )

    def test_sort_auto_compare(self):
        self.assertEqual(
            self.bf.sort([3, 1, 2], {"keys": [{"key_kind": "self", "compare_type": "auto", "direction": "asc"}]}),
            [1, 2, 3],
        )
        self.assertEqual(
            self.bf.sort(
                ["charlie", "alice", "bob"],
                {"keys": [{"key_kind": "self", "compare_type": "auto", "direction": "asc"}]},
            ),
            ["alice", "bob", "charlie"],
        )


class EvalDelegationTest(unittest.TestCase):
    """Verifies `bf.*_eval` methods correctly delegate to the `evaluator`
    module (JSON-string seam wiring), not just the underlying evaluator
    functions tested directly in test_evaluator.py / test_eval_vectors.py."""

    def setUp(self):
        self.bf = BarefootJS(None, {"backend": _PureBackend()})

    def _node(self, **kwargs):
        return kwargs

    def test_sort_eval(self):
        cmp = self._node(
            kind="binary",
            op="-",
            left={"kind": "member", "object": {"kind": "identifier", "name": "a"}, "property": "v"},
            right={"kind": "member", "object": {"kind": "identifier", "name": "b"}, "property": "v"},
        )
        out = self.bf.sort_eval([{"v": 3}, {"v": 1}, {"v": 2}], json.dumps(cmp), "a", "b")
        self.assertEqual([x["v"] for x in out], [1, 2, 3])

    def test_reduce_eval(self):
        body = self._node(
            kind="binary",
            op="+",
            left={"kind": "identifier", "name": "acc"},
            right={"kind": "identifier", "name": "item"},
        )
        out = self.bf.reduce_eval([1, 2, 3], json.dumps(body), "acc", "item", 0)
        self.assertEqual(out, 6)

    def test_filter_every_some_find_eval(self):
        pred = self._node(
            kind="binary",
            op=">=",
            left={"kind": "member", "object": {"kind": "identifier", "name": "u"}, "property": "age"},
            right={"kind": "literal", "value": 18},
        )
        pred_json = json.dumps(pred)
        rows = [{"age": 15}, {"age": 30}, {"age": 18}]
        self.assertEqual([r["age"] for r in self.bf.filter_eval(rows, pred_json, "u")], [30, 18])
        self.assertFalse(self.bf.every_eval(rows, pred_json, "u"))
        self.assertTrue(self.bf.some_eval(rows, pred_json, "u"))
        self.assertEqual(self.bf.find_eval(rows, pred_json, "u")["age"], 30)
        self.assertEqual(self.bf.find_index_eval(rows, pred_json, "u", forward=False), 2)

    def test_flat_map_eval_and_map_eval(self):
        field = self._node(kind="member", object={"kind": "identifier", "name": "i"}, property="tags")
        rows = [{"tags": ["a", "b"]}, {"tags": ["c"]}]
        self.assertEqual(self.bf.flat_map_eval(rows, json.dumps(field), "i"), ["a", "b", "c"])

        name_field = self._node(kind="member", object={"kind": "identifier", "name": "u"}, property="name")
        users = [{"name": "Ada"}, {"name": "Grace"}]
        self.assertEqual(self.bf.map_eval(users, json.dumps(name_field), "u"), ["Ada", "Grace"])


if __name__ == "__main__":
    unittest.main()
