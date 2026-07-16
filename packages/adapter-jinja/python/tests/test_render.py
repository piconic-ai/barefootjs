"""Jinja2 end-to-end render test, modeled on
packages/adapter-xslate/t/render.t.

Writes a `.jinja` template equivalent to what the `@barefootjs/jinja`
compile-time adapter emits, then renders it through the runtime + the Jinja
backend. Exercises scope markers, hydration attrs, text slots via HTML
comment markers, autoescaping, and `spread_attrs`.

Jinja idiom note: helpers that return already-safe HTML syntax but are NOT
wrapped by the backend's `mark_raw` (`scope_attr`, `hydration_attrs`,
`text_start`, `text_end`, `comment`, `scope_comment`, `scope_comment_end`)
need an explicit `| safe` filter at the call site -- the Jinja-syntax
equivalent of Kolon's `| mark_raw` pipe seen in the Perl port's `render.t`.
`spread_attrs` already returns a `markupsafe.Markup` value (via
`backend.mark_raw`), so it needs no filter, matching the Perl template's
call site exactly.
"""

from __future__ import annotations

import json
import re
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

# A fragment-rooted component template, matching what `renderFragment` emits
# for `fragment.needsScopeComment` (#2289): the begin marker precedes the
# fragment's children, the end marker follows its last top-level node so the
# client's range query has a lower bound and doesn't leak onto later
# siblings owned by the parent.
FRAGMENT_TEMPLATE = (
    "{{ bf.scope_comment() | safe }}"
    "<button>add</button><p>hint</p>"
    "{{ bf.scope_comment_end() | safe }}"
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

    def test_scope_comment_end_marker_pairs_with_begin(self):
        """#2289: the end marker closes the fragment's scope range with the
        SAME scope id as the begin marker, and no host/props segment."""
        template_dir = Path(self._tmpdir.name)
        (template_dir / "fragment.jinja").write_text(FRAGMENT_TEMPLATE, encoding="utf-8")
        out = self.backend.render_named("fragment", self.bf, {})

        self.assertIn("<!--bf-scope:Widget_test-->", out)
        self.assertIn("<!--bf-/scope:Widget_test-->", out)
        # End marker follows the fragment's last top-level node.
        self.assertTrue(out.endswith("<!--bf-/scope:Widget_test-->"))

        begin_id = re.search(r"<!--bf-scope:([^|>-]+)", out).group(1)
        end_id = re.search(r"<!--bf-/scope:([^>-]+)-->", out).group(1)
        self.assertEqual(begin_id, end_id)

    def test_scope_comment_end_carries_no_host_or_props_segment(self):
        """Unlike `scope_comment`, the end marker never carries `|h=`/`|m=`
        or a props JSON segment -- the client only needs the scope id to
        confirm the range closes (#2289)."""
        template_dir = Path(self._tmpdir.name)
        (template_dir / "fragment_child.jinja").write_text(FRAGMENT_TEMPLATE, encoding="utf-8")

        child_bf = BarefootJS(None, {"backend": self.backend})
        child_bf._scope_id("Widget_test_s2")
        child_bf._bf_parent("Widget_test")
        child_bf._bf_mount("s2")
        out = self.backend.render_named("fragment_child", child_bf, {})

        self.assertIn("<!--bf-scope:Widget_test_s2|h=Widget_test|m=s2-->", out)
        self.assertIn("<!--bf-/scope:Widget_test_s2-->", out)


if __name__ == "__main__":
    unittest.main()
