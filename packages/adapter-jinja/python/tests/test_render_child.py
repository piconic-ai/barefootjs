"""`render_child` renderer-invocation contract, ported from
packages/adapter-perl/t/render_child.t.

Renderer contract (#1897): the renderer is invoked with `(props, invoking_bf)`
so nested renders can chain scope/slot identity off the caller, not the
registrant.
"""

from __future__ import annotations

import unittest

from barefootjs import BarefootJS


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


if __name__ == "__main__":
    unittest.main()
