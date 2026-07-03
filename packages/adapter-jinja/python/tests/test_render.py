"""Jinja2 end-to-end render test, modeled on
packages/adapter-xslate/t/render.t.

Writes a `.jinja` template equivalent to what the `@barefootjs/jinja`
compile-time adapter emits, then renders it through the runtime + the Jinja
backend. Exercises scope markers, hydration attrs, text slots via HTML
comment markers, autoescaping, and `spread_attrs`.

Jinja idiom note: helpers that return already-safe HTML syntax but are NOT
wrapped by the backend's `mark_raw` (`scope_attr`, `hydration_attrs`,
`text_start`, `text_end`, `comment`, `scope_comment`) need an explicit
`| safe` filter at the call site -- the Jinja-syntax equivalent of Kolon's
`| mark_raw` pipe seen in the Perl port's `render.t`. `spread_attrs` already
returns a `markupsafe.Markup` value (via `backend.mark_raw`), so it needs no
filter, matching the Perl template's call site exactly.
"""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from barefootjs import BarefootJS
from barefootjs.backend_jinja import JinjaBackend

WIDGET_TEMPLATE = (
    '<div bf-s="{{ bf.scope_attr() }}" {{ bf.hydration_attrs() | safe }}>'
    "count: {{ bf.text_start('s0') | safe }}{{ count }}{{ bf.text_end() | safe }} "
    "<span {{ bf.spread_attrs(attrs) }}>{{ label }}</span>"
    "</div>"
)


class RenderTest(unittest.TestCase):
    def setUp(self):
        self._tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmpdir.cleanup)
        template_dir = Path(self._tmpdir.name)
        (template_dir / "widget.jinja").write_text(WIDGET_TEMPLATE, encoding="utf-8")
        self.backend = JinjaBackend(paths=[str(template_dir)])
        self.bf = BarefootJS(None, {"backend": self.backend})
        self.bf._scope_id("Widget_test")

    def test_scope_and_hydration_markers(self):
        out = self.backend.render_named(
            "widget", self.bf, {"count": 7, "label": "<x>", "attrs": {"id": "n", "class": "c"}}
        )
        self.assertIn('bf-s="Widget_test" bf-r=""', out)

    def test_reactive_text_slot_with_comment_markers(self):
        out = self.backend.render_named(
            "widget", self.bf, {"count": 7, "label": "<x>", "attrs": {"id": "n", "class": "c"}}
        )
        self.assertIn("count: <!--bf:s0-->7<!--/-->", out)

    def test_plain_interpolation_is_autoescaped(self):
        out = self.backend.render_named(
            "widget", self.bf, {"count": 7, "label": "<x>", "attrs": {"id": "n", "class": "c"}}
        )
        self.assertIn("&lt;x&gt;", out)

    def test_spread_attrs_renders_raw_with_sorted_keys(self):
        out = self.backend.render_named(
            "widget", self.bf, {"count": 7, "label": "<x>", "attrs": {"id": "n", "class": "c"}}
        )
        self.assertIn('<span class="c" id="n">', out)

    def test_backend_unit_operations(self):
        self.assertEqual(self.backend.materialize("plain"), "plain")
        self.assertEqual(self.backend.materialize(lambda: "lazy"), "lazy")
        encoded = self.backend.encode_json({"b": 2, "a": 1})
        self.assertEqual(encoded, '{"a":1,"b":2}')  # canonical (sorted) key order

    def test_render_named_mangles_reserved_word_props(self):
        template_dir = Path(self._tmpdir.name)
        (template_dir / "kw.jinja").write_text("{{ class_ }}-{{ for_ }}", encoding="utf-8")
        out = self.backend.render_named("kw", self.bf, {"class": "X", "for": "Y"})
        self.assertEqual(out, "X-Y")

    def test_render_child_end_to_end(self):
        """A parent template renders a registered child via `bf.render_child`,
        exercising `render_child` -> renderer -> `render_named` end-to-end,
        including keyword mangling flowing through both hops."""
        template_dir = Path(self._tmpdir.name)
        (template_dir / "parent.jinja").write_text(
            "parent:{{ bf.render_child('child', class='c1', label='hi') }}", encoding="utf-8"
        )
        (template_dir / "child.jinja").write_text("[{{ class_ }}:{{ label }}]", encoding="utf-8")

        def child_renderer(props, caller):
            child_bf = BarefootJS(None, {"backend": self.backend})
            return self.backend.render_named("child", child_bf, props)

        self.bf.register_child_renderer("child", child_renderer)
        out = self.backend.render_named("parent", self.bf, {})
        self.assertEqual(out, "parent:[c1:hi]")


if __name__ == "__main__":
    unittest.main()
