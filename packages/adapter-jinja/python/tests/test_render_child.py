"""`render_child` renderer-invocation contract, ported from
packages/adapter-perl/t/render_child.t.

Renderer contract (#1897): the renderer is invoked with `(props, invoking_bf)`
so nested renders can chain scope/slot identity off the caller, not the
registrant.
"""

from __future__ import annotations

import unittest

from barefootjs import UNDEF, BarefootJS


class _StubBackend:
    def materialize(self, value):
        return value() if callable(value) else value


def new_bf():
    return BarefootJS(None, {"backend": _StubBackend()})


class RenderChildTest(unittest.TestCase):
    def test_renderer_receives_invoking_instance(self):
        bf = new_bf()
        bf._scope_id("Root_test")

        seen = {}

        def probe(props, caller):
            seen["props"] = props
            seen["caller"] = caller
            return "ok"

        bf.register_child_renderer("probe", probe)

        self.assertEqual(bf.render_child("probe", value=1), "ok")
        self.assertEqual(seen["props"]["value"], 1)
        self.assertIs(seen["caller"], bf)

        # A nested invocation from a different instance passes THAT instance.
        child = new_bf()
        child._scope_id("Root_test_s0")
        child._child_renderers(bf._child_renderers())
        child.render_child("probe")
        self.assertIs(seen["caller"], child)

    def test_renderer_exceptions_propagate(self):
        bf = new_bf()

        def boom(props, caller):
            raise RuntimeError("renderer exploded")

        bf.register_child_renderer("boom", boom)

        with self.assertRaisesRegex(RuntimeError, "renderer exploded"):
            bf.render_child("boom")

    def test_single_dict_form(self):
        # Mirrors the Perl port's hashref form for callers that can't splat
        # a hash into positional/keyword args.
        bf = new_bf()
        seen = {}

        def probe(props, caller):
            seen["props"] = props
            return "ok"

        bf.register_child_renderer("probe", probe)
        bf.render_child("probe", {"value": 42})
        self.assertEqual(seen["props"]["value"], 42)

    def test_missing_renderer_raises(self):
        bf = new_bf()
        with self.assertRaises(RuntimeError):
            bf.render_child("missing")

    def test_reserved_word_prop_is_mangled(self):
        bf = new_bf()
        seen = {}

        def probe(props, caller):
            seen["props"] = props
            return "ok"

        bf.register_child_renderer("probe", probe)
        bf.render_child("probe", {"class": "x", "id": "y"})
        self.assertEqual(seen["props"]["class_"], "x")
        self.assertEqual(seen["props"]["id"], "y")
        self.assertNotIn("class", seen["props"])

    def test_passed_reads_the_caller_keys(self):
        # `passed` answers from the keys the caller handed over (raw, before
        # keyword mangling), so a key passed as None counts and an omitted
        # one does not; a root reads `_props`, and with no record at all the
        # template's own fallback decides.
        bf = new_bf()
        seen = {}

        def probe(props, caller):
            child = new_bf()
            seen["label"] = child.passed("label", False)
            seen["class"] = child.passed("class", False)
            seen["tone"] = child.passed("tone", True)
            return ""

        bf.register_child_renderer("probe", probe)
        bf.render_child("probe", {"label": None, "class": None})
        self.assertEqual(seen, {"label": True, "class": True, "tone": False})
        self.assertFalse(bf.passed("label", False), "the record is gone once the render returns")

        root = new_bf()
        self.assertTrue(root.passed("label", True), "no record: the fallback decides")
        self.assertFalse(root.passed("label", False))
        root._props({"label": None})
        self.assertTrue(root.passed("label", False), "a root reads its _props")
        self.assertFalse(root.passed("tone", True))



class TestDeriveStashFromDefaults(unittest.TestCase):
    """The seed (spec/js-undefined-value.md, "Decisions" (6)): a destructure
    default applies to an absent or `undefined` prop only; an explicit
    `None` is JS `null` and keeps its value."""

    def setUp(self):
        from barefootjs.runtime import _derive_stash_from_defaults

        self.derive = _derive_stash_from_defaults

    def test_prop_with_a_default(self):
        defaults = {"v": {"propName": "v", "value": "D"}}
        self.assertEqual(self.derive(defaults, {}), {"v": "D"})
        self.assertEqual(self.derive(defaults, {"v": UNDEF}), {"v": "D"})
        self.assertEqual(self.derive(defaults, {"v": None}), {"v": None})
        self.assertEqual(self.derive(defaults, {"v": 0}), {"v": 0})

    def test_prop_without_a_default_seeds_undefined(self):
        # `extractSsrDefaults` writes no `value` for a prop without a default
        # (rollout step U1); such a prop, absent or `undefined`, is `UNDEF`.
        defaults = {"n": {"propName": "n"}}
        self.assertIs(self.derive(defaults, {})["n"], UNDEF)
        self.assertIs(self.derive(defaults, {"n": UNDEF})["n"], UNDEF)
        self.assertIsNone(self.derive(defaults, {"n": None})["n"])
        self.assertEqual(self.derive(defaults, {"n": 3}), {"n": 3})

    def test_renamed_and_reserved_props(self):
        # `{ n: count = 1 }` seeds `count` from the caller's `n`; a reserved
        # name is looked up and written mangled.
        renamed = {"count": {"propName": "n", "value": 1}}
        self.assertEqual(self.derive(renamed, {}), {"count": 1})
        self.assertEqual(self.derive(renamed, {"n": None}), {"count": None})
        reserved = {"class": {"propName": "class", "value": "x"}}
        self.assertEqual(self.derive(reserved, {"class_": None}), {"class_": None})
        self.assertEqual(self.derive(reserved, {}), {"class_": "x"})

    def test_signal_and_rest_entries(self):
        defaults = {"count": {"value": 0}, "rest": {"isRestProps": True, "value": {}}}
        self.assertEqual(self.derive(defaults, {}), {"count": 0, "rest": {}})
        self.assertEqual(self.derive(defaults, {"rest": {"a": 1}}), {"count": 0, "rest": {"a": 1}})


if __name__ == "__main__":
    unittest.main()
