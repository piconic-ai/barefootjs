"""JS `undefined` as a value (spec/js-undefined-value.md, rollout step U2).

`UNDEF` is the Jinja backend's `JsUndefined` singleton, registered as the
Environment's `undefined`; host `None` is JS `null`. These pin the parts the
golden vectors do not reach: the engine's view of `UNDEF`, the JSON walk the
`bf-p` writer shares with `bf.json`, and the helpers' optional-argument
defaults.
"""

from __future__ import annotations

import json
import unittest

from barefootjs import UNDEF, BarefootJS, JinjaBackend, JsUndefined, is_null, is_nullish, is_undefined
from barefootjs import evaluator


class _Backend(JinjaBackend):
    def __init__(self):
        super().__init__(paths=[])


class UndefinedValueTest(unittest.TestCase):
    def setUp(self):
        self.backend = _Backend()
        self.bf = BarefootJS(None, {"backend": self.backend})

    def render(self, src: str, **variables) -> str:
        return self.backend.env.from_string(src).render(bf=self.bf, **variables)

    def test_the_runtime_produces_the_backend_singleton(self):
        self.assertIsInstance(UNDEF, JsUndefined)
        self.assertIs(evaluator.undefined(), UNDEF)
        self.assertIs(self.bf.undefined, UNDEF)

    def test_predicates(self):
        self.assertTrue(is_undefined(UNDEF))
        self.assertFalse(is_undefined(None))
        self.assertTrue(is_null(None))
        self.assertFalse(is_null(UNDEF))
        for v in (None, UNDEF):
            self.assertTrue(is_nullish(v))
        for v in (0, "", False, [], {}):
            self.assertFalse(is_nullish(v))

    def test_a_missing_template_variable_is_undefined(self):
        # The Environment's `undefined` is `JsUndefined`, so a never-set var
        # is JS `undefined` to the runtime too.
        self.assertEqual(self.render("{{ bf.is_undefined(x) }}|{{ bf.is_null(x) }}|{{ bf.is_nullish(x) }}"), "True|False|True")
        self.assertEqual(self.render("{{ bf.is_undefined(x) }}|{{ bf.is_null(x) }}", x=None), "False|True")

    def test_the_engine_sees_undef_as_neither_defined_nor_none(self):
        out = self.render(
            "[{{ u }}]{{ u is defined }}{{ u is none }}{% if u %}T{% else %}F{% endif %}{{ u.a['b'] is defined }}",
            u=UNDEF,
        )
        self.assertEqual(out, "[]FalseFalseFFalse")

    def test_keep_nonnil_coalesces_both_nils(self):
        self.assertEqual(self.bf.keep_nonnil(UNDEF), [])
        self.assertEqual(self.bf.keep_nonnil(None), [])
        self.assertEqual(self.bf.keep_nonnil(0), [0])

    def test_json_follows_json_stringify(self):
        # A member holding `undefined` is dropped, an element is `null`, and
        # a top-level `undefined` gives no string (UNDEF, which prints "").
        self.assertEqual(self.bf.json({"a": None, "b": UNDEF}), '{"a":null}')
        self.assertEqual(self.bf.json([UNDEF, None, 1]), "[null,null,1]")
        self.assertEqual(self.bf.json({"o": {"b": UNDEF}}), '{"o":{}}')
        self.assertIs(self.bf.json(UNDEF), UNDEF)
        self.assertEqual(self.render("[{{ bf.json(u) }}]", u=UNDEF), "[]")

    def test_bf_p_drops_an_undefined_prop(self):
        self.bf._props({"a": None, "b": UNDEF, "c": [UNDEF]})
        attr = self.bf.props_attr()
        payload = json.loads(attr[len(" bf-p='") : -1].replace("&#34;", '"'))
        self.assertEqual(payload, {"a": None, "c": [None]})

    def test_the_default_encoder_never_receives_undef(self):
        from barefootjs.backend_jinja import default_json_encoder

        self.assertEqual(default_json_encoder({"a": UNDEF, "b": [UNDEF]}), '{"b":[null]}')

    def test_coercions_tell_the_nils_apart(self):
        self.assertEqual(self.bf.to_string(UNDEF), "undefined")
        self.assertEqual(self.bf.to_string(None), "null")
        self.assertEqual(self.bf.plus(UNDEF, "x"), "undefinedx")
        self.assertNotEqual(self.bf.to_number(UNDEF), self.bf.to_number(UNDEF))  # NaN
        self.assertEqual(self.bf.to_number(None), 0)
        self.assertEqual(self.bf.sub(None, 1), -1)
        self.assertNotEqual(self.bf.mul(UNDEF, 2), self.bf.mul(UNDEF, 2))  # NaN
        self.assertFalse(self.bf.strict_eq(UNDEF, None))
        self.assertTrue(self.bf.strict_eq(UNDEF, UNDEF))
        # The display helpers render both nils as "" / NaN.
        self.assertEqual(self.bf.string(UNDEF), "")
        self.assertEqual(self.bf.string(None), "")

    def test_reads_that_miss_are_undefined(self):
        self.assertIs(self.bf.get({"a": 1}, "b"), UNDEF)
        self.assertIs(self.bf.get([1], 5), UNDEF)
        self.assertIs(self.bf.at([1], 5), UNDEF)
        self.assertIs(self.bf.find([1], lambda x: False), UNDEF)
        self.assertIs(self.bf.length({}), UNDEF)
        self.assertIsNone(self.bf.get({"a": None}, "a"))

    def test_array_search_uses_strict_equality(self):
        self.assertTrue(self.bf.includes([UNDEF], UNDEF))
        self.assertFalse(self.bf.includes([None], UNDEF))
        self.assertFalse(self.bf.includes([UNDEF], None))
        self.assertEqual(self.bf.index_of([None, UNDEF], UNDEF), 1)
        self.assertEqual(self.bf.index_of([UNDEF, None], None), 1)
        # A string receiver ToString's its needle.
        self.assertTrue(self.bf.includes("aundefinedb", UNDEF))
        self.assertTrue(self.bf.includes("anullb", None))
        self.assertFalse(self.bf.includes("ab", None))

    def test_join_prints_both_nils_empty(self):
        self.assertEqual(self.bf.join([None, UNDEF, 1]), ",,1")
        self.assertEqual(self.bf.join([1, 2], UNDEF), "1,2")
        self.assertEqual(self.bf.join([1, 2], None), "1null2")

    def test_sort_puts_undefined_last(self):
        keys = {"keys": [{"key_kind": "self", "compare_type": "numeric", "direction": "asc"}]}
        self.assertEqual(self.bf.sort([3, UNDEF, 1, None, 2], keys), [None, 1, 2, 3, UNDEF])
        cmp = json.dumps({"kind": "binary", "op": "-", "left": {"kind": "identifier", "name": "a"}, "right": {"kind": "identifier", "name": "b"}})
        self.assertEqual(self.bf.sort_eval([3, UNDEF, 1, None, 2], cmp, "a", "b"), [None, 1, 2, 3, UNDEF])

    def test_optional_argument_defaults_apply_to_undefined_only(self):
        # Omitted or `undefined` takes the JS default; `null` is coerced.
        self.assertEqual(self.bf.slice([1, 2, 3], 1, UNDEF), [2, 3])
        self.assertEqual(self.bf.slice([1, 2, 3], 1, None), [])
        self.assertEqual(self.bf.pad_start("abc", 5, UNDEF), "  abc")
        self.assertEqual(self.bf.pad_start("abc", 5, None), "nuabc")
        self.assertEqual(self.bf.split("a,b", UNDEF), ["a,b"])
        self.assertEqual(self.bf.split("anullb", None), ["a", "b"])
        self.assertEqual(self.bf.split("a,b", ",", None), [])
        self.assertEqual(self.bf.split("a,b", ",", UNDEF), ["a", "b"])
        self.assertTrue(self.bf.ends_with("abc", "c", UNDEF))
        self.assertTrue(self.bf.ends_with("abc", "", None))
        self.assertFalse(self.bf.ends_with("abc", "c", None))
        self.assertEqual(self.bf.at([7, 8], UNDEF), 7)
        self.assertEqual(self.bf.at([7, 8], None), 7)
        self.assertEqual(self.bf.to_fixed(1.25, UNDEF), "1")

    def test_search_params_get_of_an_absent_key_stays_null(self):
        self.assertIsNone(BarefootJS.search_params("a=1").get("b"))

    def test_evaluator_reads(self):
        ident = {"kind": "identifier", "name": "undefined"}
        self.assertIs(evaluator.evaluate(ident, {}), UNDEF)
        missing = {"kind": "member", "object": {"kind": "identifier", "name": "o"}, "property": "x", "computed": False}
        self.assertIs(evaluator.evaluate(missing, {"o": {}}), UNDEF)
        coalesce = {"kind": "logical", "op": "??", "left": missing, "right": {"kind": "literal", "value": "d", "literalType": "string"}}
        self.assertEqual(evaluator.evaluate(coalesce, {"o": {}}), "d")
        self.assertEqual(evaluator.evaluate(coalesce, {"o": {"x": None}}), "d")


if __name__ == "__main__":
    unittest.main()
