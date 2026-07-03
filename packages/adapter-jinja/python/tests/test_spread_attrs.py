"""`BarefootJS.spread_attrs` -- ported from packages/adapter-perl/t/spread_attrs.t.

JSX intrinsic-element spread runtime helper (#1407 follow-up). Mirrors the
JS `spreadAttrs` runtime and the Go/Perl adapters' equivalents so SSR output
stays byte-equal across every adapter -- cross-adapter parity regressions
surface here first.
"""

from __future__ import annotations

import unittest

from barefootjs import BarefootJS


class _PureBackend:
    """`spread_attrs` only reaches the backend for `mark_raw`, which is the
    identity here."""

    def mark_raw(self, s):
        return s


def run(bag):
    bf = BarefootJS(None, {"backend": _PureBackend()})
    return str(bf.spread_attrs(bag))


class SpreadAttrsTest(unittest.TestCase):
    def test_basic_shapes(self):
        self.assertEqual(run(None), "")
        self.assertEqual(run({}), "")
        self.assertEqual(run("not a hash"), "")
        self.assertEqual(run({"id": "a"}), 'id="a"')

    def test_alphabetic_key_order(self):
        self.assertEqual(run({"id": "a", "class": "on"}), 'class="on" id="a"')

    def test_key_remapping(self):
        self.assertEqual(run({"className": "foo"}), 'class="foo"')
        self.assertEqual(run({"htmlFor": "x"}), 'for="x"')
        self.assertEqual(run({"dataPriority": "high"}), 'data-priority="high"')
        # SVG XML attrs are case-sensitive -- preserve verbatim.
        self.assertEqual(run({"viewBox": "0 0 10 10"}), 'viewBox="0 0 10 10"')
        self.assertEqual(run({"clipPathUnits": "userSpaceOnUse"}), 'clipPathUnits="userSpaceOnUse"')
        # JS-reference parity (#1411): a leading uppercase letter emits a
        # leading dash.
        self.assertEqual(run({"XData": "x"}), '-x-data="x"')

    def test_event_handlers_js_predicate_parity(self):
        self.assertEqual(run({"onClick": "fn", "id": "a"}), 'id="a"')
        self.assertEqual(run({"on_custom": "fn", "id": "a"}), 'id="a"')
        self.assertEqual(run({"on0": "fn", "id": "a"}), 'id="a"')
        self.assertEqual(run({"oncology": "x"}), 'oncology="x"')

    def test_children_skipped_ref_passed_through(self):
        self.assertEqual(run({"children": "x", "id": "a"}), 'id="a"')
        # JS `spreadAttrs` does NOT filter `ref` (`applyRestAttrs` does --
        # that's a separate divergence).
        self.assertEqual(run({"ref": "x", "id": "a"}), 'id="a" ref="x"')

    def test_boolean_values(self):
        # Contract: callers MUST use a real Python bool for boolean
        # attributes -- unlike Perl, no sentinel object is needed.
        self.assertEqual(run({"hidden": True, "id": "a"}), 'hidden id="a"')
        self.assertEqual(run({"hidden": False, "id": "a"}), 'id="a"')
        # Plain numeric 0 renders as a value (matches `tabindex="0"`).
        self.assertEqual(run({"tabindex": 0}), 'tabindex="0"')

    def test_nullish_skip(self):
        self.assertEqual(run({"a": None, "b": "x"}), 'b="x"')

    def test_html_escape(self):
        self.assertEqual(run({"title": '<b>"x"</b>'}), 'title="&lt;b&gt;&#34;x&#34;&lt;/b&gt;"')
        self.assertEqual(run({"alt": "tom & jerry"}), 'alt="tom &amp; jerry"')

    def test_style_object_lowering(self):
        self.assertEqual(
            run({"style": {"backgroundColor": "red", "color": "white"}}),
            'style="background-color:red;color:white"',
        )
        self.assertEqual(run({"style": "color:red"}), 'style="color:red"')


if __name__ == "__main__":
    unittest.main()
